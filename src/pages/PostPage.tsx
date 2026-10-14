import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message, Note, Post, ServerEvent, User } from '../../shared/types';
import { api, type ApiError } from '../api';
import { emit, useLive } from '../live';
import { t } from '../text';
import { useMorePeople } from '../nav';
import { Avatar, Faces } from '../components/Avatar';
import { BovNotes, LeaveBovNote } from '../components/Notes';
import { lifeLabel } from '../components/Life';
import { Prose } from '../components/Prose';
import { LIFE_CHOICES, beyondLite } from '../../shared/plans';
import { go, profileHref } from '../nav';
import { Icon, rich } from '../components/Icon';
import { ConsentBuy } from '../components/Buy';
import { Handle } from '../components/Username';
import { JoinPrompt, NeedsAccount, NotPublic, Waiting } from '../components/Public';

/** A post and its conversation. `me` null: a visitor who is not signed in, on a public post: they read
 * it as someone who has not paid, and its conversation read-only; the rest asks them to sign in. */
export function PostPage({ me, id, onToast }: { me: User | null; id: string; onToast: (text: string) => void }) {
  const signedIn = !!me;
  const [post, setPost] = useState<Post | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [present, setPresent] = useState<string[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [more, setMore] = useState<User[]>([]);
  const people = useMorePeople(more);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setPost(null);
    api
      .post(id)
      .then((r) => {
        setPost(r.post);
        setMessages(r.messages);
        setPresent(r.present);
        setNotes(r.notes);
        setMore(r.people ?? []);
      })
      .catch((e: ApiError) => (e.status === 404 ? setMissing(true) : setError(e.message)));
    // being on the post is being in its conversation (a visitor who is not signed in has no socket)
    if (!signedIn) return;
    emit({ type: 'join', postId: id });
    return () => emit({ type: 'leave', postId: id });
  }, [id, signedIn]);

  useLive(
    useCallback(
      (e: ServerEvent) => {
        if (e.type === 'message' && e.message.postId === id) setMessages((ms) => (ms.some((m) => m.id === e.message.id) ? ms : [...ms, e.message]));
        if (e.type === 'presence' && e.postId === id) setPresent(e.present);
      },
      [id],
    ),
    signedIn,
  );

  // not there, or not for this reader (a friend group's post to someone not in it): the same either way
  if (missing)
    return signedIn ? (
      <div className="not-public post-missing">
        <h1>{t.postNotFound}</h1>
        <p className="hint">{t.postNotFoundText}</p>
        <div className="row">
          <a className="button" href="/">{t.notPublicHome}</a>
        </div>
      </div>
    ) : (
      <NotPublic />
    );
  if (error) return <p className="error">{error}</p>;
  if (!post) return <Waiting />;
  const author = people.get(post.authorId);
  const to = post.letter && Array.isArray(post.audience) ? people.get(post.audience[0]) : undefined;
  const audience = post.letter
    ? t.letterFor(post.audience[0] === me?.id ? t.toYou : to?.name ?? '')
    : post.audience === 'public'
      ? post.paid
        ? t.paidBadge
        : t.public
      : post.audience === 'friends'
      ? t.forAll
      : post.audience === 'group'
        ? t.groups.to(post.group?.name ?? '')
        : t.forSome(post.audience.length);

  const mine = !!me && post.authorId === me.id;
  return (
    <div className="post-layout">
      <article className="post">
        <a className="back" href={post.group ? `/g/${post.group.id}` : '/'}>{t.back}</a>
        <div className="card-head">
          <Avatar user={author} size={44} />
          <div>
            <div className="name">
              {author?.publicProfile ? <a href={profileHref(author)}>{author.name}</a> : author?.name} <Handle user={author} />
            </div>
            <div className="meta">
              {post.kind === 'vlog' ? t.vlog : t.blog} · {t.ago(Date.now() - post.createdAt)} · {post.group ? <a className="group-link" href={`/g/${post.group.id}`}>{rich(audience)}</a> : rich(audience)} · {rich(lifeLabel(post, author))}
            </div>
          </div>
        </div>
        {post.restricted && mine && <p className="restricted-note" role="note">{t.restrictedNote}</p>}
        {post.imageUrl && <img className="post-cover" src={post.imageUrl} alt="" />}
        <h1>{post.title}</h1>
        {post.videoUrl && <video className="post-video" src={post.videoUrl} controls playsInline preload="metadata" />}
        <Prose body={post.body} pictures={post.pictures} />
        {post.locked && author && (
          <Locked
            post={post}
            author={author}
            signedIn={signedIn}
            onOpened={() =>
              api.post(id).then((r) => {
                // subscribed or bought: the whole post, its conversation and its notes
                setPost(r.post);
                setMessages(r.messages);
                setNotes(r.notes);
                emit({ type: 'join', postId: id });
              })
            }
          />
        )}
        {me && mine && <LeaveBovNote post={post} me={me} onLeft={onToast} />}
        {me && mine && <LifeControls post={post} me={me} onChanged={(p) => { setPost(p); onToast(t.lifeChanged); }} />}
        {me && !mine && <Report postId={post.id} onDone={() => onToast(t.reported)} />}
        {!me && <NeedsAccount className="report-link" label={<><Icon name="flag" size={14} /> {t.report}</>} action={t.joinActions.report} />}
      </article>
      {post.locked ? (
        <aside className="chat locked-chat">
          <h3>{t.conversation}</h3>
          <p className="quiet"><Icon name="lock" /> {t.lockedChat}</p>
        </aside>
      ) : (
        <Chat me={me} people={people} postId={post.id} messages={messages} present={present} hint={post.letter ? t.letterChat : post.audience === 'public' ? t.publicChat : post.group ? (post.group.kind === 'interest' ? t.groups.chatInterest : t.groups.chatFriends) : t.conversationHint} />
      )}
      {me && <BovNotes postId={post.id} initial={notes} onReply={() => document.getElementById('say-input')?.focus()} />}
    </div>
  );
}

/** The conversation (`people`: everyone known, those the post came with too); `me` null: read-only,
 * with the way in where one would write. */
function Chat({ me, people, postId, messages, present, hint }: { me: User | null; people: Map<string, User>; postId: string; messages: Message[]; present: string[]; hint: string }) {
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  // (braces: in new browsers scrollIntoView returns a promise, and an effect may return only a clean-up)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);
  const others = present.filter((p) => p !== me?.id);

  return (
    <aside className="chat">
      <div className="chat-head">
        <h3>{t.conversation}</h3>
        {present.length > 0 && (
          <div className="here">
            {others.length > 0 && (
              <span className="live-pill">
                <span className="dot" /> {t.liveNow}
              </span>
            )}
            <Faces users={present.map((p) => people.get(p))} live />
          </div>
        )}
      </div>
      <p className="hint">{hint}</p>
      <div className="messages">
        {messages.length === 0 && <p className="quiet">{t.noMessages}</p>}
        {messages.map((m, i) => {
          const who = people.get(m.userId);
          const mine = m.userId === me?.id;
          const same = i > 0 && messages[i - 1].userId === m.userId;
          return (
            <div key={m.id} className={'msg' + (mine ? ' mine' : '') + (same ? ' same' : '')}>
              {!mine && !same && <Avatar user={who} size={28} />}
              <div>
                {!mine && !same && <div className="msg-name">{who?.name}</div>}
                <div className="bubble">{m.text}</div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {!me ? (
        <JoinPrompt action={t.joinActions.talk} />
      ) : (
        <form
          className="row say"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            emit({ type: 'say', postId, text });
            setText('');
          }}
        >
          <input id="say-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t.sayPlaceholder} maxLength={2000} />
          <button type="submit" disabled={!text.trim()}>{t.send}</button>
        </form>
      )}
    </aside>
  );
}

/** The rest of a paid post: Unlimited's for the author's subscribers (subscribe here), Exclusive's for
 * those who buy it, once, with no monthly payment (buy here). The prototype charges nothing. */
function Locked({ post, author, signedIn, onOpened }: { post: Post; author: User; signedIn: boolean; onOpened: () => void }) {
  // how long it stays, shown before buying (a bought post goes when its time is up)
  const lasts = <p className="meta locked-lasts">{t.lockedLasts(post.expiresAt ? t.when(post.expiresAt) : null)}</p>;
  if (post.price) {
    return (
      <div className="locked">
        <div className="locked-fade" />
        <h3><Icon name="lock" size={22} /> {t.lockedBuyTitle}</h3>
        <p>{t.lockedBuyText(author.name)}</p>
        {lasts}
        {signedIn ? (
          <ConsentBuy kind="content" open label={t.buyPost(t.euros(post.price))} onBuy={() => api.buy(post.id, true).then(onOpened)} />
        ) : (
          <NeedsAccount label={t.buyPost(t.euros(post.price))} action={t.joinActions.buy} />
        )}
        <p className="hint">{t.prototypeNoCharge}</p>
      </div>
    );
  }
  return (
    <div className="locked">
      <div className="locked-fade" />
      <h3><Icon name="lock" size={22} /> {t.lockedTitle}</h3>
      <p>{t.lockedText(author.name)}</p>
      {lasts}
      {author.price &&
        (signedIn ? (
          <ConsentBuy kind="service" open label={t.subscribeTo(author.name, t.euroMonth(author.price))} onBuy={() => api.subscribe(author.id, true).then(onOpened)} />
        ) : (
          <NeedsAccount label={t.subscribeTo(author.name, t.euroMonth(author.price))} action={t.joinActions.subscribe} />
        ))}
      <p className="hint">{t.prototypeNoCharge}</p>
    </div>
  );
}

/** Report a post: sexual content and AI-made content are not allowed anywhere. */
function Report({ postId, onDone }: { postId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="report-link" onClick={() => setOpen(true)}>
        <Icon name="flag" size={14} /> {t.report}
      </button>
    );
  }
  const send = (reason: string) =>
    api.report(postId, reason).then(() => {
      setOpen(false);
      onDone();
    });
  return (
    <div className="report">
      <h3>{t.reportTitle}</h3>
      <p className="hint">{t.rule}</p>
      <div className="row">
        <button className="primary" onClick={() => send('sexual')}>{t.reportSexual}</button>
        <button className="primary" onClick={() => send('ai')}>{t.reportAi}</button>
        <button className="ghost-pill" onClick={() => send('other')}>{t.reportOther}</button>
        <button className="ghost" onClick={() => setOpen(false)}>{t.cancel}</button>
      </div>
    </div>
  );
}

/** The author's own controls: the paid plans change how long the post stays (or end it now); anyone deletes their own. */
function LifeControls({ post, me, onChanged }: { post: Post; me: User; onChanged: (p: Post) => void }) {
  const pro = beyondLite(me.plan ?? 'lite');
  const archived = post.archived || (post.expiresAt != null && post.expiresAt <= Date.now());
  return (
    <div className="life-controls">
      {pro && (
        <>
          <span className="field-label">{t.changeLife}</span>
          <div className="choose">
            {LIFE_CHOICES.map((c) => (
              <button key={t.lifeLabel(c.ms)} className="chip" onClick={() => api.setLife(post.id, c.ms).then(onChanged)}>
                {t.lifeLabel(c.ms)}
              </button>
            ))}
            {!archived && (
              <button className="chip" onClick={() => api.setLife(post.id, 'end').then(onChanged)}>
                <Icon name="archive" /> {t.endNow}
              </button>
            )}
          </div>
          {archived && <p className="hint">{t.bringBack}</p>}
        </>
      )}
      <button
        className="report-link"
        onClick={() => {
          if (confirm(t.deleteConfirm)) api.deletePost(post.id).then(() => go({ page: 'me' }));
        }}
      >
        <Icon name="trash" size={14} /> {t.deletePost}
      </button>
    </div>
  );
}
