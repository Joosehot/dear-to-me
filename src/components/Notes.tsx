import { useCallback, useEffect, useState } from 'react';
import type { Note, Post, ServerEvent, User } from '../../shared/types';
import { api } from '../api';
import { useLive } from '../live';
import { t } from '../text';
import { usePeople } from '../nav';
import { Avatar } from './Avatar';
import { Icon, rich } from './Icon';

/** The BoVNotes inside a post for you: shown when you open it (and at once if one is left while you read), one at a time. */
export function BovNotes({ postId, initial, onReply }: { postId: string; initial: Note[]; onReply: () => void }) {
  const people = usePeople();
  const [queue, setQueue] = useState<Note[]>(initial);
  useEffect(() => setQueue(initial), [initial]);

  useLive(
    useCallback(
      (e: ServerEvent) => {
        if (e.type === 'note' && e.note.postId === postId) setQueue((q) => (q.some((n) => n.id === e.note.id) ? q : [...q, e.note]));
      },
      [postId],
    ),
  );

  const note = queue[0];
  if (!note) return null;
  const from = people.get(note.authorId);
  const done = () => {
    api.seenNote(note.id).catch(() => {});
    setQueue((q) => q.slice(1));
  };

  return (
    <div className="note-backdrop" role="dialog" aria-modal="true">
      <div className="note-card">
        <div className="note-pin" />
        <div className="note-from">
          <Avatar user={from} size={34} />
          <div>
            <div className="name">{t.noteFrom(from?.name ?? '')}</div>
            <div className="meta">
              {t.bovNote} · {t.ago(Date.now() - note.createdAt)}
            </div>
          </div>
        </div>
        <p className="note-text">{note.text}</p>
        <div className="note-actions">
          <button
            className="ghost"
            onClick={() => {
              done();
              onReply();
            }}
          >
            <Icon name="bubble" /> {t.noteReply}
          </button>
          <button className="primary" onClick={done}>
            {t.noteThanks}
          </button>
        </div>
        {queue.length > 1 && <div className="note-more">+{queue.length - 1}</div>}
      </div>
    </div>
  );
}

/** The readers a BoVNote can be left for: everyone the post was written for (for a public post or an
 * interest group's: your friends; for a friend group's: its members), except its author. */
export function useReaders(post: Post | null, me: User) {
  const people = usePeople();
  const [friends, setFriends] = useState<User[]>([]);
  const [members, setMembers] = useState<string[] | null>(null);
  useEffect(() => {
    setMembers(null);
    if (post?.audience === 'group' && post.groupId)
      api
        .group(post.groupId)
        .then((g) => (g.group.kind === 'friends' ? setMembers(g.members.map((m) => m.userId)) : api.friends().then(setFriends)))
        .catch(() => {});
    else if (post?.audience === 'friends' || post?.audience === 'public') api.friends().then(setFriends).catch(() => {});
  }, [post?.id, post?.audience, post?.groupId]);
  if (!post) return [];
  const byId = (ids: string[]) => ids.map((id) => people.get(id)).filter((u): u is User => !!u);
  const list = members ? byId(members) : !Array.isArray(post.audience) ? friends : byId(post.audience);
  return list.filter((u) => u.id !== me.id);
}

/** Choose readers: everyone, or some. */
export function ReaderChips({ readers, chosen, setChosen }: { readers: User[]; chosen: string[]; setChosen: (c: string[]) => void }) {
  const all = readers.length > 0 && chosen.length === readers.length;
  return (
    <div className="choose">
      {readers.length > 1 && (
        <button className={'chip' + (all ? ' on' : '')} onClick={() => setChosen(all ? [] : readers.map((r) => r.id))}>
          {t.everyoneButton}
        </button>
      )}
      {readers.map((r) => (
        <button
          key={r.id}
          className={'chip' + (chosen.includes(r.id) ? ' on' : '')}
          onClick={() => setChosen(chosen.includes(r.id) ? chosen.filter((x) => x !== r.id) : [...chosen, r.id])}
        >
          <Avatar user={r} size={22} /> {r.name}
        </button>
      ))}
    </div>
  );
}

/** The author leaves a BoVNote inside their post. */
export function LeaveBovNote({ post, me, onLeft }: { post: Post; me: User; onLeft: (text: string) => void }) {
  const readers = useReaders(post, me);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState('');

  if (!open) {
    return (
      <button className="leave-note-button" onClick={() => setOpen(true)}>
        {rich(t.leaveBovNote)}
      </button>
    );
  }
  const names = readers.filter((r) => chosen.includes(r.id)).map((r) => r.name);
  return (
    <div className="leave-note">
      <p className="hint">{t.bovNoteIntro}</p>
      <div className="paper-note">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t.notePlaceholder} rows={3} maxLength={1000} autoFocus />
      </div>
      <label className="field-label">{t.noteFor}</label>
      <ReaderChips readers={readers} chosen={chosen} setChosen={setChosen} />
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="ghost" onClick={() => setOpen(false)}>
          {t.cancel}
        </button>
        <button
          className="primary"
          disabled={!text.trim() || chosen.length === 0}
          onClick={() =>
            api
              .leaveNote(post.id, text, chosen)
              .then(() => {
                onLeft(t.noteLeft(names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} ${t.andMore(names.length - 2)}`));
                setText('');
                setChosen([]);
                setOpen(false);
              })
              .catch((e) => setError(e.message))
          }
        >
          {t.leaveIt}
        </button>
      </div>
    </div>
  );
}
