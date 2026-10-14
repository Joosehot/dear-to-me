import { useEffect, useState } from 'react';
import type { User } from '../../shared/types';
import { api, type ApiError } from '../api';
import { t } from '../text';
import { Avatar } from '../components/Avatar';
import { Handle } from '../components/Username';

export function Friends({ me, onChange }: { me: User; onChange: () => void }) {
  const [friends, setFriends] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.friends().then(setFriends).catch(() => {});
  }, [me.id]);

  return (
    <div className="friends">
      <h1>{t.yourFriends}</h1>
      {friends.length === 0 && <p className="quiet">{t.noFriends}</p>}
      <ul className="friend-list">
        {friends.map((f) => (
          <li key={f.id}>
            <Avatar user={f} size={40} />
            <span className="who">
              {f.name} <Handle user={f} />
            </span>
          </li>
        ))}
      </ul>
      <h3>{t.addFriend}</h3>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          api
            .addFriend(username)
            .then((fs) => {
              setFriends(fs);
              setUsername('');
              onChange();
            })
            .catch((err: ApiError) => setError(err.code === 'no-username' ? t.noUsername(username.trim().replace(/^@/, '')) : err.message));
        }}
      >
        <span className="handle-input">
          <span className="at">@</span>
          <input id="friend-username" value={username} onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))} placeholder={t.usernamePlaceholder} autoCapitalize="none" spellCheck={false} />
        </span>
        <button type="submit" disabled={!username.trim()}>{t.add}</button>
      </form>
      <p className="hint">{t.addFriendHint}</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
