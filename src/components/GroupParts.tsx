import type { ReactNode } from 'react';
import type { Group } from '../../shared/types';
import { t } from '../text';
import { Icon, rich } from './Icon';
import { topicText } from './Topics';

/** A group's picture (a friend group's own), or its kind's icon. */
export function GroupAvatar({ group, size = 44 }: { group: Pick<Group, 'kind' | 'pictureUrl' | 'name'>; size?: number }) {
  return (
    <span className={'group-avatar ' + group.kind} style={{ width: size, height: size }} title={group.name}>
      {group.pictureUrl ? <img src={group.pictureUrl} alt="" /> : <Icon name={group.kind === 'interest' ? 'globe' : 'friends'} size={Math.round(size * 0.5)} />}
    </span>
  );
}

/** What kind of group it is: a friend group, or an interest group and its topic. */
export const groupKindText = (g: Pick<Group, 'kind' | 'topic'>) => (g.kind === 'interest' && g.topic ? t.groups.interestKind(topicText(g.topic)) : t.groups.friendsKind);

/** A group in a list: its picture, name, kind and members, linked to its page; `action` beside it (Join). */
export function GroupRow({ group: g, action }: { group: Group; action?: ReactNode }) {
  return (
    <li className="group-row">
      <a className="group-who" href={`/g/${g.id}`}>
        <GroupAvatar group={g} />
        <span>
          <span className="name">{g.name}</span>
          <span className="meta">
            {rich(groupKindText(g))} · {t.groups.members(g.members)}
            {g.role ? ` · ${g.role === 'admin' ? t.groups.admin : t.groups.joined}` : ''}
          </span>
          {g.description && <span className="group-desc">{g.description}</span>}
        </span>
      </a>
      {action}
    </li>
  );
}
