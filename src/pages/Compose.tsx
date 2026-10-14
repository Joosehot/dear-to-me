import { useEffect, useMemo, useRef, useState } from 'react';
import { paragraphs, pictureOf } from '../components/Prose';

/** Pictures and GIFs among a blog's text, at most (the server's limit too). */
const MAX_PICTURES = 10;
import type { Group, PostKind, User } from '../../shared/types';
import { api } from '../api';
import { t } from '../text';
import { go, usePeople } from '../nav';
import { Avatar } from '../components/Avatar';
import { ReaderChips } from '../components/Notes';
import type { PlanState } from '../../shared/types';
import { LIFE_CHOICES, PLANS, POST_PRICE, beyondLite, sellsPosts } from '../../shared/plans';
import { SplitTable } from './Place';
import { uploadVideo } from '../upload';
import { Icon, rich } from '../components/Icon';
import { TopicChips } from '../components/Topics';
import { MAX_POST_TOPICS, type TopicId } from '../../shared/interests';

export function Compose({ me, letter = false, to, group }: { me: User; letter?: boolean; to?: string; group?: string }) {
  const [kind, setKind] = useState<PostKind>('blog');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [video, setVideo] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : ''), [image]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  // pictures and GIFs among a blog's paragraphs: each leaves its marker where the cursor was
  const [pictures, setPictures] = useState<File[]>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const picturePreviews = useMemo(() => pictures.map((f) => URL.createObjectURL(f)), [pictures]);
  useEffect(() => () => picturePreviews.forEach((u) => URL.revokeObjectURL(u)), [picturePreviews]);
  const addPicture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || pictures.length >= MAX_PICTURES) return;
    const at = bodyRef.current?.selectionStart ?? body.length;
    const before = body.slice(0, at).replace(/\s+$/, '');
    const after = body.slice(at).replace(/^\s+/, '');
    const marker = t.pictureMarker(pictures.length + 1);
    setBody([before, marker, after].filter(Boolean).join('\n\n'));
    setPictures((p) => [...p, file]);
  };
  const removePicture = (i: number) => {
    // its marker goes, and the later ones move down by one
    const paras = paragraphs(body).flatMap((para) => {
      const n = pictureOf(para);
      if (n === i + 1) return [];
      return [n > i + 1 ? t.pictureMarker(n - 1) : para];
    });
    setBody(paras.join('\n\n'));
    setPictures((p) => p.filter((_, j) => j !== i));
  };
  const [friends, setFriends] = useState<User[]>([]);
  // who it is for: every friend, chosen friends, one friend (a letter), anyone (public), or a group of yours
  const [mode, setMode] = useState<'everyone' | 'chosen' | 'letter' | 'public' | 'group'>(group ? 'group' : letter ? 'letter' : 'everyone');
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState(group ?? '');
  // a friend group's members: the readers a BoVNote can be left for
  const [members, setMembers] = useState<string[]>([]);
  useEffect(() => {
    api.groups().then((o) => setGroups(o.mine.filter((g) => !g.banned))).catch(() => {});
  }, []);
  const chosenGroup = groups.find((g) => g.id === groupId);
  useEffect(() => {
    setMembers([]);
    if (chosenGroup?.kind === 'friends') api.group(chosenGroup.id).then((p) => setMembers(p.members.map((m) => m.userId))).catch(() => {});
  }, [chosenGroup?.id, chosenGroup?.kind]);
  const people = usePeople();
  const [paid, setPaid] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // a public post's topics, as its author picks them (optional: none, and they are read from its words)
  const [topics, setTopics] = useState<TopicId[]>([]);
  const [price, setPrice] = useState(0);
  useEffect(() => {
    api.subscription().then((s) => setPrice(s.price)).catch(() => {});
  }, []);
  const [chosen, setChosen] = useState<string[]>(to ? [to] : []);
  const everyone = mode === 'everyone';
  // an optional BoVNote, left inside the post for chosen readers
  const [note, setNote] = useState('');
  const [noteFor, setNoteFor] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // the video going into the bucket: 0..1, or null when nothing is uploading
  const [uploaded, setUploaded] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.friends().then(setFriends).catch(() => {});
  }, []);

  // the plan: what may be posted today, and (the paid plans) how long it stays
  const [plan, setPlan] = useState<PlanState | null>(null);
  useEffect(() => {
    api.plan().then(setPlan).catch(() => {});
  }, []);
  const pro = !!plan && beyondLite(plan.plan);
  // Exclusive sells the post by itself, at a price of its own
  const exclusive = !!plan && sellsPosts(plan.plan);
  const [postPrice, setPostPrice] = useState('');
  const [life, setLife] = useState<number | null>(LIFE_CHOICES[2].ms);
  // a vlog's length, read in the browser (the server reads it again from the file)
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!video) return setSeconds(0);
    const url = URL.createObjectURL(video);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      setSeconds(v.duration || 0);
      URL.revokeObjectURL(url);
    };
    v.src = url;
  }, [video]);
  const isLetterMode = mode === 'letter';
  const noBlogs = !pro && !isLetterMode && kind === 'blog' && plan?.blogsLeft === 0;
  const noVlogs = !pro && !isLetterMode && kind === 'vlog' && plan?.vlogsLeft === 0;
  const tooLong = !pro && kind === 'vlog' && seconds > PLANS.lite.vlogMaxSeconds;
  // the two spaces: video, and text and pictures
  const videoSize = kind === 'vlog' ? video?.size ?? 0 : 0;
  const mediaSize = (image?.size ?? 0) + (kind === 'blog' ? pictures.reduce((s, f) => s + f.size, 0) : 0) + new TextEncoder().encode(title + body).length;
  const noVideoRoom = !!plan && plan.used.video + videoSize > plan.quota.video;
  const noMediaRoom = !!plan && plan.used.media + mediaSize > plan.quota.media;
  const overLimit = noBlogs || noVlogs || tooLong || noVideoRoom || noMediaRoom;
  // an Exclusive post's price: a blog at most 5 euros, a vlog at most 50 and at least 30 minutes long
  const selling = exclusive && mode === 'public' && paid;
  const postCents = Math.round((Number(postPrice.replace(',', '.')) || 0) * 100);
  const postMax = kind === 'vlog' ? POST_PRICE.vlogMax : POST_PRICE.blogMax;
  const priceBad = selling && postPrice.trim() !== '' && (postCents <= 0 || postCents > postMax);
  const tooShort = selling && kind === 'vlog' && !!video && seconds > 0 && seconds < POST_PRICE.vlogMinSeconds;
  const paidReady = !paid || (exclusive ? postCents > 0 && postCents <= postMax && (kind === 'blog' || (!!video && seconds >= POST_PRICE.vlogMinSeconds)) : price > 0);
  const ready =
    title.trim() &&
    (kind === 'blog' ? body.trim() && image : video) &&
    (everyone || mode === 'public' || (mode === 'group' ? !!chosenGroup && (chosenGroup.kind === 'friends' || confirmed) : mode === 'letter' ? chosen.length === 1 : chosen.length > 0)) &&
    (!note.trim() || noteFor.length > 0) &&
    (mode !== 'public' || (confirmed && paidReady)) &&
    !overLimit;
  const readers =
    mode === 'group'
      ? chosenGroup?.kind === 'friends'
        ? members.flatMap((id) => (id === me.id ? [] : people.get(id) ?? []))
        : friends
      : everyone || mode === 'public'
        ? friends
        : friends.filter((f) => chosen.includes(f.id));

  const publish = async () => {
    setBusy(true);
    setError('');
    const form = new FormData();
    form.set('kind', kind);
    form.set('title', title);
    form.set('body', body);
    form.set('audience', mode === 'public' ? 'public' : mode === 'group' ? 'group' : everyone ? 'friends' : JSON.stringify(chosen));
    if (mode === 'group') {
      form.set('group', groupId);
      if (chosenGroup?.kind === 'interest') form.set('confirm', confirmed ? '1' : '0');
    }
    if (mode === 'public') {
      form.set('confirm', confirmed ? '1' : '0');
      if (paid) form.set('paid', '1');
      if (selling) form.set('price', postPrice);
      if (topics.length) form.set('topics', JSON.stringify(topics));
    }
    if (mode === 'letter') form.set('letter', '1');
    if (pro) form.set('life', life === null ? 'forever' : String(life));
    if (seconds) form.set('duration', String(Math.round(seconds)));
    if (image) form.set('image', image);
    if (kind === 'blog') for (const p of pictures) form.append('pictures', p);
    try {
      // a vlog's video straight into the bucket first (a broken upload goes on next time); without one, with the post
      if (video && kind === 'vlog') {
        setUploaded(0);
        const key = await uploadVideo(video, setUploaded);
        if (key) form.set('videoKey', key);
        else form.set('video', video);
      }
      const post = await api.publish(form);
      const keep = noteFor.filter((r) => readers.some((x) => x.id === r));
      if (note.trim() && keep.length > 0) await api.leaveNote(post.id, note, keep);
      go({ page: 'post', id: post.id });
    } catch (e) {
      setError(uploaded !== null ? t.uploadFailed((e as Error).message) : (e as Error).message);
      setBusy(false);
      setUploaded(null);
    }
  };

  return (
    <div className="compose">
      <h1>{mode === 'letter' ? t.writeLetter : t.newPost}</h1>
      <label className="field-label">{t.kind}</label>
      <div className="seg">
        <button className={kind === 'blog' ? 'on' : ''} onClick={() => setKind('blog')}><Icon name="pen" /> {t.blog}</button>
        <button className={kind === 'vlog' ? 'on' : ''} onClick={() => setKind('vlog')}><Icon name="camcorder" /> {t.vlog}</button>
      </div>

      <label className="field-label">
        {t.image}
        {kind === 'blog' && <span className="required"> *</span>}
      </label>
      <label className={'cover-pick' + (preview ? ' has' : '')}>
        <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
        {preview ? <img src={preview} alt="" /> : <span><Icon name="picture" size={22} /> {t.chooseImage}</span>}
        {preview && <span className="change">{t.changeImage}</span>}
      </label>
      {kind === 'blog' && !image && <p className="hint">{t.imageRequired}</p>}

      <label className="field-label" htmlFor="title">{t.title}</label>
      <input id="title" className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.titlePlaceholder} maxLength={120} />

      {kind === 'vlog' && (
        <>
          <label className="field-label">{t.video}</label>
          <label className="file">
            <input type="file" accept="video/*" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
            {video ? rich(`🎬 ${video.name}`) : t.chooseVideo}
          </label>
        </>
      )}

      <label className="field-label" htmlFor="body">{t.body}</label>
      <textarea ref={bodyRef} id="body" className="prose-input" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t.bodyPlaceholder} rows={kind === 'blog' ? 14 : 5} />
      {kind === 'blog' && (
        <div className="pictures-pick">
          <label className={'ghost-pill small' + (pictures.length >= MAX_PICTURES ? ' disabled' : '')}>
            <input type="file" accept="image/*" disabled={pictures.length >= MAX_PICTURES} onChange={addPicture} />
            <Icon name="picture" size={14} /> {t.addPicture}
          </label>
          <p className="hint">{t.picturesHint(MAX_PICTURES)}</p>
          {pictures.length > 0 && (
            <div className="picture-thumbs">
              {picturePreviews.map((url, i) => (
                <figure key={url}>
                  <img src={url} alt={t.pictureAlt(i + 1)} />
                  <figcaption>
                    {t.pictureMarker(i + 1)}{' '}
                    <button className="ghost" onClick={() => removePicture(i)}>{t.removePicture}</button>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      )}

      <label className="field-label">{t.audience}</label>
      <div className="seg">
        <button className={mode === 'everyone' ? 'on' : ''} onClick={() => setMode('everyone')}>{t.forAll}</button>
        <button className={mode === 'chosen' ? 'on' : ''} onClick={() => setMode('chosen')}>{t.chosen}</button>
        <button
          className={mode === 'letter' ? 'on' : ''}
          onClick={() => {
            setMode('letter');
            setChosen((c) => c.slice(0, 1));
          }}
        >
          {rich(t.letterToOne)}
        </button>
        <button className={mode === 'public' ? 'on' : ''} onClick={() => setMode('public')}>
          {rich(t.public)}
        </button>
        <button className={mode === 'group' ? 'on' : ''} onClick={() => setMode('group')}>
          {rich(t.groups.audience)}
        </button>
      </div>
      {mode === 'group' && (
        <div className="group-options">
          {groups.length === 0 ? (
            <p className="quiet">{t.groups.noGroups}</p>
          ) : (
            <>
              <p className="hint">{t.groups.chooseGroup}</p>
              <div className="choose group-chips">
                {groups.map((g) => (
                  <button key={g.id} type="button" className={'chip group-chip' + (g.id === groupId ? ' on' : '')} aria-pressed={g.id === groupId} onClick={() => setGroupId(g.id)}>
                    {rich(g.kind === 'interest' ? '🌍' : '👥')} {g.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {chosenGroup && <p className="hint">{chosenGroup.kind === 'interest' ? t.groups.composeInterest : t.groups.composeFriends}</p>}
          {chosenGroup?.kind === 'interest' && (
            <label className="check rule">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              {t.confirmRule}
            </label>
          )}
        </div>
      )}
      {mode === 'public' && (
        <div className="public-options">
          <p className="hint">{t.publicFor}</p>
          <label className="field-label">{t.composeTopics}</label>
          <p className="hint">{t.composeTopicsHint(MAX_POST_TOPICS)}</p>
          <TopicChips chosen={topics} onChange={setTopics} max={MAX_POST_TOPICS} />
          <label className={'check' + (pro ? '' : ' disabled')}>
            <input type="checkbox" disabled={!pro} checked={paid && pro} onChange={(e) => setPaid(e.target.checked)} />
            {exclusive ? t.paidToggleExclusive : t.paidToggle}
            {!pro && <span className="meta"> (<Icon name="lock" size={14} /> {t.proOnlyPaid})</span>}
            {!exclusive && price > 0 && <span className="meta"> ({t.euroMonth(price)})</span>}
          </label>
          {paid && !exclusive && price === 0 && <p className="error">{t.paidNeedsPrice}</p>}
          {selling && (
            <div className="post-price">
              <label className="field-label" htmlFor="post-price">{t.postPrice}</label>
              <input id="post-price" className="post-price-input" inputMode="decimal" value={postPrice} onChange={(e) => setPostPrice(e.target.value)} placeholder={t.euros(0)} />
              <p className="hint">{kind === 'vlog' ? t.postPriceHintVlog(t.euros(postMax), POST_PRICE.vlogMinSeconds / 60) : t.postPriceHintBlog(t.euros(postMax))}</p>
              {priceBad && <p className="error">{t.postPriceBad(t.euros(postMax))}</p>}
              {tooShort && <p className="error">{t.vlogTooShortPaid(POST_PRICE.vlogMinSeconds / 60)}</p>}
              {postCents > 0 && postCents <= postMax && <SplitTable cents={postCents} per="post" />}
            </div>
          )}
          <label className="check rule">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            {t.confirmRule}
          </label>
        </div>
      )}
      {mode === 'letter' && <p className="hint">{t.letterHint}</p>}
      {(mode === 'chosen' || mode === 'letter') && (
        <div className="choose">
          {friends.length === 0 && <p className="quiet">{t.noFriends}</p>}
          {friends.map((f) => (
            <button
              key={f.id}
              className={'chip' + (chosen.includes(f.id) ? ' on' : '')}
              onClick={() => setChosen((c) => (mode === 'letter' ? [f.id] : c.includes(f.id) ? c.filter((x) => x !== f.id) : [...c, f.id]))}
            >
              <Avatar user={f} size={22} /> {f.name}
            </button>
          ))}
        </div>
      )}

      <label className="field-label">{rich(t.bovNoteOptional)}</label>
      <p className="hint">{t.bovNoteComposeHint}</p>
      <div className="paper-note">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePlaceholder} rows={2} maxLength={1000} />
      </div>
      {note.trim() && <ReaderChips readers={readers} chosen={noteFor} setChosen={setNoteFor} />}

      {plan && (
        <div className="plan-in-compose">
          {pro ? (
            <>
              <label className="field-label">{t.lifeTitle}</label>
              <div className="seg wrap">
                {LIFE_CHOICES.map((c) => (
                  <button key={t.lifeLabel(c.ms)} className={life === c.ms ? 'on' : ''} onClick={() => setLife(c.ms)}>
                    {t.lifeLabel(c.ms)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="hint">
              {isLetterMode ? t.liteLifeLetter : kind === 'vlog' ? t.liteLifeVlog : t.liteLifeBlog}{' '}
              {!isLetterMode && plan.blogsLeft !== null && plan.vlogsLeft !== null && t.quotaLeft(plan.blogsLeft, plan.vlogsLeft)}
            </p>
          )}
          {selling && life !== null && <p className="hint buyers-life">{t.lifeShownToBuyers}</p>}
          {noBlogs && <p className="error">{t.quotaNoneBlog}</p>}
          {noVlogs && <p className="error">{t.quotaNoneVlog}</p>}
          {tooLong && <p className="error">{t.vlogTooLong(PLANS.lite.vlogMaxSeconds / 60)}</p>}
          {noVideoRoom && <p className="error">{t.storageFullVideo}</p>}
          {noMediaRoom && <p className="error">{t.storageFullMedia}</p>}
        </div>
      )}
      <p className="hint rule-line">{t.rule}</p>
      {error && <p className="error">{error}</p>}
      {uploaded !== null && (
        <div className="upload-progress" role="progressbar" aria-valuenow={Math.round(uploaded * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="storage-bar"><div style={{ width: `${uploaded * 100}%` }} /></div>
          <span className="meta">{uploaded < 1 ? t.uploading(Math.floor(uploaded * 100)) : t.uploadProcessing}</span>
        </div>
      )}
      <div className="actions">
        <span className="as">
          <Avatar user={me} size={26} /> {me.name}
        </span>
        <button className="primary" disabled={!ready || busy} onClick={publish}>
          {busy ? t.publishing : t.publish}
        </button>
      </div>
    </div>
  );
}
