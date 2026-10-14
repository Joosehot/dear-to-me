import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProfilePage as Page, User } from '../../shared/types';
import { api, type ApiError } from '../api';
import { t } from '../text';
import { Avatar } from '../components/Avatar';
import { PostCard } from '../components/PostCard';
import { ConsentBuy, Subscribed } from '../components/Buy';
import { Handle } from '../components/Username';
import { NeedsAccount, NotPublic, Waiting } from '../components/Public';
import { People, useMorePeople } from '../nav';

/** Someone's public profile: who they are, their public posts, and a way to subscribe or befriend. */
/** By id (/u/<id>) or by username (/@<username>). `me` null: a visitor who is not signed in, who sees it
 * as anyone does; befriending and subscribing ask them to sign in. */
export function ProfilePage({ me, userId, username, onChange }: { me: User | null; userId?: string; username?: string; onChange: () => void }) {
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const signedIn = !!me;
  const load = useCallback(() => {
    (username ? api.profileByUsername(username) : api.profile(userId ?? ''))
      .then(setPage)
      .catch((e: ApiError) => (signedIn ? setError(t.noProfile) : e.status === 404 ? setMissing(true) : setError(e.message)));
  }, [userId, username, signedIn]);
  // (whose page it is: the cards name them, and tell how long their posts stay by their plan)
  const people = useMorePeople(useMemo(() => (page ? [page.user] : []), [page]));
  useEffect(load, [load]);
  const refresh = () => {
    load();
    onChange();
  };

  if (missing) return <NotPublic />;
  if (error) return <p className="quiet empty">{error}</p>;
  if (!page) return <Waiting />;
  const { user, friend, subscribed, posts } = page;
  const mine = user.id === me?.id;
  return (
    <div className="profile">
      <div className={'wallpaper' + (user.wallpaperUrl ? '' : ' plain')} style={user.wallpaperUrl ? { backgroundImage: `url(${user.wallpaperUrl})` } : { background: user.color }} />
      <div className="profile-head">
        <Avatar user={user} size={96} />
        <div>
          <h1>{user.name}</h1>
          <p className="profile-handle"><Handle user={user} /></p>
          {user.bio && <p className="bio">{user.bio}</p>}
          <p className="meta">
            {t.publicCount(page.publicPosts)}
            {user.price ? ` · ${t.euroMonth(user.price)}` : ''}
            {friend ? ` · ${t.friendLabel}` : ''}
          </p>
          {!me && (
            <div className="row profile-actions">
              <NeedsAccount className="ghost-pill" label={t.addAsFriend} action={t.joinActions.befriend} />
              {!!user.price && <NeedsAccount label={t.subscribeTo(user.name, t.euroMonth(user.price))} action={t.joinActions.subscribe} />}
            </div>
          )}
          {me && !mine && (
            <div className="row profile-actions">
              {!friend && (
                <button className="ghost-pill" onClick={() => api.addFriend(user.username).then(refresh)}>
                  {t.addAsFriend}
                </button>
              )}
              {!!user.price &&
                (subscribed ? (
                  <Subscribed author={user} until={page.subscribedUntil} onChange={refresh} />
                ) : (
                  <ConsentBuy kind="service" label={t.subscribeTo(user.name, t.euroMonth(user.price))} onBuy={() => api.subscribe(user.id, true).then(refresh)} />
                ))}
            </div>
          )}
        </div>
      </div>
      <h3>{t.publicOnly}</h3>
      {posts.length === 0 && <p className="quiet">{t.noPublic}</p>}
      <People.Provider value={people}>
        <div className="feed">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} me={me} showAuthor={false} />
          ))}
        </div>
      </People.Provider>
    </div>
  );
}
