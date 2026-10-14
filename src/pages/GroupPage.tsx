import { useCallback, useEffect, useState } from 'react';
import type { GroupPage, PostSummary, ServerEvent, User } from '../../shared/types';
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX } from '../../shared/groups';
import { api, type ApiError } from '../api';
import { useLive } from '../live';
import { t } from '../text';
import { go, usePeople } from '../nav';
import { Avatar } from '../components/Avatar';
import { Handle } from '../components/Username';
import { Icon, rich } from '../components/Icon';
import { PostCard } from '../components/PostCard';
import { GroupAvatar, groupKindText } from '../components/GroupParts';
import { useLivePosts } from './Feed';
import { groupError } from './Groups';

/** A group's page (/g/<id>): its posts, newest first, its members as you may see them, and its admins'
 * tools. A friend group you are not in is the same "no such group" as one that is not there. */
export function GroupView({ me, id, onPending }: { me: User; id: string; onPending: () => void }) {
  const people = usePeople();
  const [page, setPage] = useState<GroupPage | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api
      .group(id)
      .then((p) => {
        setPage(p);
        setMissing(false);
      })
      .catch((e: ApiError) => (e.status === 404 ? setMissing(true) : setError(e.message)));
  }, [id]);
  useEffect(() => {
    setPage(null);
    load();
  }, [load]);
  const livePosts = useLivePosts(
    useCallback((f: (ps: PostSummary[] | null) => PostSummary[] | null) => setPage((p) => (p ? { ...p, posts: f(p.posts) ?? p.posts } : p)), []),
    load,
  );
  useLive(useCallback((e: ServerEvent) => (e.type === 'groups' ? load() : livePosts(e)), [load, livePosts]));
  const apply = (p: Promise<GroupPage>) =>
    p
      .then((next) => {
        setPage(next);
        setError('');
        onPending();
      })
      .catch((e: ApiError) => setError(groupError(e)));

  if (missing)
    return (
      <div className="not-public group-missing">
        <h1>{t.groups.notFound}</h1>
        <p className="hint">{t.groups.notFoundText}</p>
        <div className="row">
          <a className="button" href="/groups">{t.groups.back}</a>
        </div>
      </div>
    );
  if (!page) return error ? <p className="error">{error}</p> : <p className="quiet">…</p>;
  const g = page.group;
  const admin = g.role === 'admin';
  const member = !!g.role;
  const name = (userId: string) => people.get(userId)?.name ?? '';

  return (
    <div className="group-page">
      <a className="back" href="/groups">{t.groups.back}</a>
      <div className="group-head">
        <GroupAvatar group={g} size={72} />
        <div>
          <h1>{g.name}</h1>
          <p className="meta">
            {rich(groupKindText(g))} · {t.groups.members(g.members)}
          </p>
          {g.description && <p className="group-desc">{g.description}</p>}
          <div className="row group-actions">
            {member && !g.banned && (
              <a className="write-button inline" href={`/write/g/${g.id}`}>
                <Icon name="pen" /> {t.groups.write}
              </a>
            )}
            {!member && g.kind === 'interest' && !g.banned && (
              <button className="primary join-group" onClick={() => apply(api.joinGroup(g.id))}>
                {t.groups.join}
              </button>
            )}
            {member && <LeaveGroup page={page} me={me} onLeft={(deleted) => (g.kind === 'friends' || deleted ? go({ page: 'groups' }) : load())} />}
          </div>
          {g.banned && <p className="restricted-note">{t.groups.bannedNote}</p>}
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <h2>{t.groups.posts}</h2>
      {page.posts.length === 0 && <p className="quiet">{t.groups.noPosts}</p>}
      <div className="feed">
        {page.posts.map((p) => (
          <div key={p.id} className="group-post">
            <PostCard post={p} me={me} />
            {admin && (
              <button className="report-link" onClick={() => confirm(t.groups.removePostConfirm) && apply(api.removeGroupPost(g.id, p.id))}>
                <Icon name="trash" size={14} /> {t.groups.removePost}
              </button>
            )}
          </div>
        ))}
      </div>

      <section className="group-members">
        <h2>{g.kind === 'friends' || admin ? t.groups.memberList : t.groups.admins}</h2>
        <ul className="friend-list member-list">
          {page.members.map((m) => {
            const u = people.get(m.userId);
            return (
              <li key={m.userId}>
                <Avatar user={u} size={34} />
                <span className="who">
                  {u?.name} <Handle user={u} />
                </span>
                {m.role === 'admin' && <span className="tag">{t.groups.admin}</span>}
                {admin && m.userId !== me.id && m.role === 'member' && (
                  <span className="row member-actions">
                    <button className="ghost-pill small" onClick={() => apply(api.groupMember(g.id, m.userId, 'admin'))}>{t.groups.makeAdmin}</button>
                    <button className="ghost-pill small" onClick={() => apply(api.groupMember(g.id, m.userId, 'remove'))}>{t.groups.removeMember}</button>
                    {g.kind === 'interest' && <button className="ghost-pill small" onClick={() => apply(api.groupMember(g.id, m.userId, 'ban'))}>{t.groups.ban}</button>}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {g.kind === 'friends' && member && <InviteFriends page={page} admin={admin} onPage={apply} name={name} />}

      {admin && page.bans && page.bans.length > 0 && (
        <section className="group-bans">
          <h3>{t.groups.bannedList}</h3>
          <ul className="friend-list">
            {page.bans.map((userId) => (
              <li key={userId}>
                <Avatar user={people.get(userId)} size={30} />
                <span className="who">{name(userId)}</span>
                <button className="ghost-pill small" onClick={() => apply(api.groupMember(g.id, userId, 'unban'))}>{t.groups.unban}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {admin && <AdminTools page={page} onPage={apply} onDeleted={() => go({ page: 'groups' })} />}
    </div>
  );
}

/** A friend group's invitations: invite a friend by @username or from your friends (an admin's
 * invitation; a member's suggestion waits for an admin), and those waiting, with an admin's approve and cancel. */
function InviteFriends({ page, admin, onPage, name }: { page: GroupPage; admin: boolean; onPage: (p: Promise<GroupPage>) => void; name: (id: string) => string }) {
  const g = page.group;
  const [friends, setFriends] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  useEffect(() => {
    api.friends().then(setFriends).catch(() => {});
  }, [g.id]);
  const taken = new Set([...page.members.map((m) => m.userId), ...(page.invites ?? []).map((i) => i.userId)]);
  const left = friends.filter((f) => !taken.has(f.id));
  return (
    <section className="group-invite">
      <h2>{t.groups.invite}</h2>
      <p className="hint">{admin ? t.groups.inviteHint : t.groups.suggestHint}</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          onPage(api.inviteToGroup(g.id, { username }));
          setUsername('');
        }}
      >
        <span className="handle-input">
          <span className="at">@</span>
          <input id="group-invite" value={username} onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))} placeholder={t.usernamePlaceholder} autoCapitalize="none" spellCheck={false} />
        </span>
        <button type="submit" disabled={!username.trim()}>{admin ? t.groups.inviteButton : t.groups.suggestButton}</button>
      </form>
      {left.length > 0 && (
        <div className="choose invite-chips">
          {left.map((f) => (
            <button key={f.id} className="chip" onClick={() => onPage(api.inviteToGroup(g.id, { userId: f.id }))}>
              <Avatar user={f} size={22} /> {f.name}
            </button>
          ))}
        </div>
      )}
      {page.invites && page.invites.length > 0 && (
        <>
          <h3>{t.groups.invited}</h3>
          <ul className="friend-list invite-list">
            {page.invites.map((i) => (
              <li key={i.userId}>
                <span className="who">
                  {name(i.userId)} <span className="meta">{i.status === 'suggested' ? t.groups.suggestedTag(i.by ? name(i.by) : '') : t.groups.invitedTag}</span>
                </span>
                {admin && (
                  <span className="row member-actions">
                    {i.status === 'suggested' && <button className="ghost-pill small" onClick={() => onPage(api.groupInvite(g.id, i.userId, 'approve'))}>{t.groups.approve}</button>}
                    <button className="ghost-pill small" onClick={() => onPage(api.groupInvite(g.id, i.userId, 'cancel'))}>{t.groups.cancelInvite}</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Leaving: a word of confirmation; the last admin names who carries on, or deletes the group. */
function LeaveGroup({ page, me, onLeft }: { page: GroupPage; me: User; onLeft: (deleted: boolean) => void }) {
  const people = usePeople();
  const [asking, setAsking] = useState<null | 'confirm' | 'last'>(null);
  const [successor, setSuccessor] = useState('');
  const [error, setError] = useState('');
  const others = page.members.filter((m) => m.userId !== me.id);
  const leave = (opts: { successor?: string; delete?: boolean }) =>
    api
      .leaveGroup(page.group.id, opts)
      .then((r) => onLeft(!!r.deleted))
      .catch((e: ApiError) => (e.code === 'last-admin' ? setAsking('last') : setError(groupError(e))));
  if (!asking)
    return (
      <button className="ghost-pill leave-group" onClick={() => setAsking('confirm')}>
        {t.groups.leave}
      </button>
    );
  if (asking === 'confirm')
    return (
      <div className="leave-ask">
        <p className="hint">{t.groups.leaveConfirm}</p>
        <div className="row">
          <button className="primary danger" onClick={() => leave({})}>{t.groups.leave}</button>
          <button className="ghost" onClick={() => setAsking(null)}>{t.cancel}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  return (
    <div className="leave-ask last-admin">
      <p className="hint">{others.length ? t.groups.lastAdmin : t.groups.lastAlone}</p>
      {others.length > 0 && (
        <div className="row">
          <select className="successor" value={successor} onChange={(e) => setSuccessor(e.target.value)} aria-label={t.groups.successor}>
            <option value="">{t.groups.successor}</option>
            {others.map((m) => (
              <option key={m.userId} value={m.userId}>
                {people.get(m.userId)?.name ?? m.userId}
              </option>
            ))}
          </select>
          <button className="primary" disabled={!successor} onClick={() => leave({ successor })}>{t.groups.handOver}</button>
        </div>
      )}
      <div className="row">
        <button className="primary danger" onClick={() => confirm(t.groups.deleteConfirm) && leave({ delete: true })}>{t.groups.leaveAndDelete}</button>
        <button className="ghost" onClick={() => setAsking(null)}>{t.cancel}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Its admins: the name and the description, a friend group's picture, and deleting the group. */
function AdminTools({ page, onPage, onDeleted }: { page: GroupPage; onPage: (p: Promise<GroupPage>) => void; onDeleted: () => void }) {
  const g = page.group;
  const [name, setName] = useState(g.name);
  const [description, setDescription] = useState(g.description ?? '');
  useEffect(() => {
    setName(g.name);
    setDescription(g.description ?? '');
  }, [g.name, g.description]);
  return (
    <section className="group-admin plan-card">
      <h2>{t.groups.adminTools}</h2>
      <label className="field-label" htmlFor="group-name-edit">{t.groups.name}</label>
      <input id="group-name-edit" value={name} maxLength={GROUP_NAME_MAX} onChange={(e) => setName(e.target.value)} />
      <label className="field-label" htmlFor="group-description-edit">{g.kind === 'friends' ? t.groups.descriptionOptional : t.groups.description}</label>
      <textarea id="group-description-edit" value={description} maxLength={GROUP_DESCRIPTION_MAX} rows={3} onChange={(e) => setDescription(e.target.value)} />
      <p>
        <button className="ghost-pill" disabled={!name.trim() || (name === g.name && description === (g.description ?? ''))} onClick={() => onPage(api.updateGroup(g.id, name, description))}>
          {t.groups.save}
        </button>
      </p>
      {g.kind === 'friends' && (
        <label className="pic-label ghost-pill">
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onPage(api.setGroupPicture(g.id, e.target.files[0]))} />
          <Icon name="picture" size={14} /> {t.groups.changePicture}
        </label>
      )}
      <div className="danger-zone">
        <button className="primary danger" onClick={() => confirm(t.groups.deleteConfirm) && api.deleteGroup(g.id).then(onDeleted)}>
          {t.groups.deleteGroup}
        </button>
      </div>
    </section>
  );
}
