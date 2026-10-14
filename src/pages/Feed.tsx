import { useCallback, useEffect, useState } from 'react';
import type { PostSummary, ServerEvent, User } from '../../shared/types';
import { api } from '../api';
import { useLive } from '../live';
import { t } from '../text';
import { PostCard } from '../components/PostCard';
import { HomeSwitch } from '../components/HomeSwitch';

/** Your friends' posts (your own are in your own place). */
export function Feed({ me }: { me: User }) {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const load = useCallback(() => {
    api.feed().then(setPosts).catch(() => setPosts([]));
  }, []);
  useEffect(load, [load]);
  useLive(useLivePosts(setPosts, load));

  return (
    <div>
      <HomeSwitch on="friends" />
      {posts === null && <p className="quiet">…</p>}
      {posts?.length === 0 && <p className="quiet empty">{t.emptyFeed}</p>}
      <div className="feed">
        {posts?.map((p) => (
          <PostCard key={p.id} post={p} me={me} />
        ))}
      </div>
    </div>
  );
}

/** A list of posts stays alive: new posts, new messages and who is talking show up as they happen. */
export function useLivePosts(setPosts: (f: (ps: PostSummary[] | null) => PostSummary[] | null) => void, reload: () => void) {
  return useCallback(
    (e: ServerEvent) => {
      if (e.type === 'posted') reload();
      if (e.type === 'presence') setPosts((ps) => ps?.map((p) => (p.id === e.postId ? { ...p, present: e.present } : p)) ?? ps);
      if (e.type === 'message') setPosts((ps) => ps?.map((p) => (p.id === e.message.postId ? { ...p, messageCount: p.messageCount + 1 } : p)) ?? ps);
    },
    [setPosts, reload],
  );
}
