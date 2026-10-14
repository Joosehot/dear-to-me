import { useCallback, useEffect, useState } from 'react';
import type { Group, PostSummary, User } from '../../shared/types';
import { api } from '../api';
import { useLive } from '../live';
import { t } from '../text';
import { PostCard } from '../components/PostCard';
import { HomeSwitch } from '../components/HomeSwitch';
import { GroupAvatar } from '../components/GroupParts';
import { topicText } from '../components/Topics';
import { useLivePosts } from './Feed';

/** For You: public posts from anyone, apart from your friends' page; above them, a few interest groups
 * that match your interests (never mixed into the posts). */
export function ForYou({ me }: { me: User }) {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const load = useCallback(() => {
    api.forYou().then(setPosts).catch(() => setPosts([]));
  }, []);
  useEffect(load, [load]);
  useLive(useLivePosts(setPosts, load));
  const [groups, setGroups] = useState<Group[]>([]);
  useEffect(() => {
    api.groupSuggestions().then(setGroups).catch(() => {});
  }, []);

  return (
    <div>
      <HomeSwitch on="fyp" />
      <p className="hint page-intro">{t.forYouIntro}</p>
      {groups.length > 0 && (
        <section className="group-strip">
          <h3>{t.groups.suggestions}</h3>
          <div className="group-strip-list">
            {groups.map((g) => (
              <a key={g.id} className="group-tile" href={`/g/${g.id}`}>
                <GroupAvatar group={g} size={36} />
                <span>
                  <span className="name">{g.name}</span>
                  <span className="meta">
                    {g.topic ? `${topicText(g.topic)} · ` : ''}
                    {t.groups.members(g.members)}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
      {posts === null && <p className="quiet">…</p>}
      {posts?.length === 0 && <p className="quiet empty">{t.emptyForYou}</p>}
      <div className="feed">
        {posts?.map((p) => (
          <PostCard key={p.id} post={p} me={me} />
        ))}
      </div>
    </div>
  );
}
