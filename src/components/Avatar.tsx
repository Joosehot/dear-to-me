import type { User } from '../../shared/types';

export function Avatar({ user, size = 36, live = false }: { user?: User; size?: number; live?: boolean }) {
  const name = user?.name ?? '?';
  return (
    <span
      className={'avatar' + (live ? ' live' : '')}
      style={{ width: size, height: size, background: user?.color ?? '#aaa', fontSize: size * 0.42 }}
      title={name}
    >
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Faces({ users, live = false }: { users: (User | undefined)[]; live?: boolean }) {
  return (
    <span className="faces">
      {users.map((u, i) => (
        <Avatar key={u?.id ?? i} user={u} size={26} live={live} />
      ))}
    </span>
  );
}
