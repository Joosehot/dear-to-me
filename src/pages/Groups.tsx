import { useCallback, useEffect, useState } from 'react';
import type { Group, GroupKind, GroupsOverview, ServerEvent } from '../../shared/types';
import { TOPICS, type TopicId } from '../../shared/interests';
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX } from '../../shared/groups';
import { api, type ApiError } from '../api';
import { useLive } from '../live';
import { t } from '../text';
import { go, usePeople } from '../nav';
import { rich } from '../components/Icon';
import { TopicChips, topicText } from '../components/Topics';
import { GroupAvatar, GroupRow } from '../components/GroupParts';

/** A group error in the reader's words (its code), or the server's message. */
export const groupError = (e: ApiError) => t.groups.errors[e.code ?? ''] ?? e.message;

/** The Groups page: invitations waiting for you (accept or decline), your groups, starting one, and the
 * interest groups by topic (anyone signed in joins them). `onPending`: the badge reloads. */
export function Groups({ onPending }: { onPending: () => void }) {
  const people = usePeople();
  const [o, setO] = useState<GroupsOverview | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.groups().then(setO).catch((e: ApiError) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  // an invitation came while the page is open
  useLive(useCallback((e: ServerEvent) => e.type === 'groups' && load(), [load]));
  const act = (p: Promise<unknown>) =>
    p
      .then(() => {
        load();
        onPending();
      })
      .catch((e: ApiError) => setError(groupError(e)));

  // the interest groups shown: one topic's, or every topic's
  const [topic, setTopic] = useState<TopicId | null>(null);
  const byTopic = TOPICS.map((x) => ({ topic: x.id, groups: (o?.interest ?? []).filter((g) => g.topic === x.id) })).filter((x) => x.groups.length && (!topic || x.topic === topic));

  return (
    <div className="groups">
      <h1>{t.groups.title}</h1>
      <p className="hint page-intro">{t.groups.lead}</p>
      {error && <p className="error">{error}</p>}
      {o && o.invitations.length > 0 && (
        <section className="group-invitations">
          <h2>{t.groups.invitations}</h2>
          <ul className="group-list">
            {o.invitations.map((inv) => (
              <li key={inv.group.id} className="group-row invitation">
                <span className="group-who">
                  <GroupAvatar group={inv.group} />
                  <span>
                    <span className="name">{inv.group.name}</span>
                    <span className="meta">
                      {inv.by ? `${t.groups.invitedBy(people.get(inv.by)?.name ?? '')} · ` : ''}
                      {t.groups.members(inv.group.members)}
                    </span>
                    {inv.group.description && <span className="group-desc">{inv.group.description}</span>}
                  </span>
                </span>
                <span className="row group-row-actions">
                  <button
                    className="primary small"
                    onClick={() =>
                      api
                        .acceptInvite(inv.group.id)
                        .then(() => {
                          onPending();
                          go({ page: 'group', id: inv.group.id });
                        })
                        .catch((e: ApiError) => setError(groupError(e)))
                    }
                  >
                    {t.groups.accept}
                  </button>
                  <button className="ghost-pill small" onClick={() => act(api.declineInvite(inv.group.id))}>
                    {t.groups.decline}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="group-mine">
        <h2>{t.groups.mine}</h2>
        {!!o?.toApprove && <p className="hint to-approve">{t.groups.toApprove(o.toApprove)}</p>}
        {o && o.mine.length === 0 && <p className="quiet">{t.groups.noneMine}</p>}
        <ul className="group-list">
          {o?.mine.map((g) => (
            <GroupRow key={g.id} group={g} />
          ))}
        </ul>
      </section>
      <CreateGroup onCreated={(g) => go({ page: 'group', id: g.id })} />
      <section className="group-interest">
        <h2>{t.groups.interest}</h2>
        <p className="hint">{t.groups.interestLead}</p>
        <TopicChips chosen={topic ? [topic] : []} onChange={(next) => setTopic(next.find((x) => x !== topic) ?? null)} />
        {o && byTopic.length === 0 && <p className="quiet">{t.groups.noneInterest}</p>}
        {byTopic.map((x) => (
          <div key={x.topic} className="group-topic">
            <h3>{topicText(x.topic)}</h3>
            <ul className="group-list">
              {x.groups.map((g) => (
                <GroupRow
                  key={g.id}
                  group={g}
                  action={
                    !g.role && !g.banned ? (
                      <button className="ghost-pill small" onClick={() => act(api.joinGroup(g.id))}>
                        {t.groups.join}
                      </button>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

/** Starting a group: a friend group (a name, a description and a picture if you like) or an interest
 * group (a topic, a name unique within it, and a description). */
function CreateGroup({ onCreated }: { onCreated: (g: Group) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<GroupKind>('friends');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [topic, setTopic] = useState<TopicId | null>(null);
  const [picture, setPicture] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!open)
    return (
      <p>
        <button className="primary create-group" onClick={() => setOpen(true)}>
          {t.groups.create}
        </button>
      </p>
    );
  const ready = name.trim() && (kind === 'friends' || (topic && description.trim()));
  return (
    <section className="create-group-form">
      <h2>{t.groups.create}</h2>
      <div className="seg">
        <button className={kind === 'friends' ? 'on' : ''} onClick={() => setKind('friends')}>
          {rich(t.groups.kindFriends)}
        </button>
        <button className={kind === 'interest' ? 'on' : ''} onClick={() => setKind('interest')}>
          {rich(t.groups.kindInterest)}
        </button>
      </div>
      <p className="hint">{kind === 'friends' ? t.groups.kindFriendsHint : t.groups.kindInterestHint}</p>
      {kind === 'interest' && (
        <>
          <label className="field-label">{t.groups.topic}</label>
          <TopicChips chosen={topic ? [topic] : []} onChange={(next) => setTopic(next.find((x) => x !== topic) ?? null)} />
        </>
      )}
      <label className="field-label" htmlFor="group-name">{t.groups.name}</label>
      <input id="group-name" value={name} maxLength={GROUP_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder={t.groups.namePlaceholder} />
      <label className="field-label" htmlFor="group-description">{kind === 'friends' ? t.groups.descriptionOptional : t.groups.description}</label>
      <textarea id="group-description" value={description} maxLength={GROUP_DESCRIPTION_MAX} rows={3} onChange={(e) => setDescription(e.target.value)} placeholder={t.groups.descriptionPlaceholder} />
      {kind === 'friends' && (
        <>
          <label className="field-label">{t.groups.picture}</label>
          <input type="file" accept="image/*" onChange={(e) => setPicture(e.target.files?.[0] ?? null)} />
        </>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="ghost" onClick={() => setOpen(false)}>
          {t.cancel}
        </button>
        <button
          className="primary"
          disabled={!ready || busy}
          onClick={() => {
            setBusy(true);
            setError('');
            api
              .createGroup({ kind, name, description, topic: kind === 'interest' ? topic ?? undefined : undefined, picture: kind === 'friends' ? picture : null })
              .then(onCreated)
              .catch((e: ApiError) => {
                setError(groupError(e));
                setBusy(false);
              });
          }}
        >
          {t.groups.createButton}
        </button>
      </div>
    </section>
  );
}
