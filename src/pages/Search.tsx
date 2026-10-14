import { useEffect, useState } from 'react';
import type { Group, PostSummary, Profile, TopicPage, User } from '../../shared/types';
import { GroupRow } from '../components/GroupParts';
import type { TopicId } from '../../shared/interests';
import { topicOfQuery } from '../../shared/topics';
import { TopicChips, topicText } from '../components/Topics';
import { api } from '../api';
import { t } from '../text';
import { Avatar } from '../components/Avatar';
import { PostCard } from '../components/PostCard';
import { ConsentBuy, Subscribed } from '../components/Buy';
import { Handle } from '../components/Username';
import { followLink, profileHref } from '../nav';

/** Search people by name or @username: add a friend, subscribe to a writer, read what they make public (and nothing else).
 * And by topic: a chip, or a topic's name or one of its words typed, shows its public posts and who writes about it. */
export function Search({ me, onChange }: { me: User; onChange: () => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostSummary[]>([]);

  // nothing typed: browse every profile; something typed: search
  const [all, setAll] = useState<Profile[] | null>(null);
  useEffect(() => {
    if (!q.trim()) {
      setFound(null);
      api.profiles().then(setAll).catch(() => setAll([]));
      return;
    }
    const timer = setTimeout(() => api.search(q).then(setFound).catch(() => setFound([])), 200);
    return () => clearTimeout(timer);
  }, [q]);
  const shown = q.trim() ? found : all;
  // groups by name: interest groups, and your own friend groups
  const [groups, setGroups] = useState<Group[]>([]);
  useEffect(() => {
    if (!q.trim()) return setGroups([]);
    const timer = setTimeout(() => api.searchGroups(q).then(setGroups).catch(() => setGroups([])), 200);
    return () => clearTimeout(timer);
  }, [q]);

  // a topic: the chip chosen, or the one the words typed mean
  const [chip, setChip] = useState<TopicId | null>(null);
  const topic = chip ?? topicOfQuery(q) ?? null;
  const [topicPage, setTopicPage] = useState<TopicPage | null>(null);
  useEffect(() => {
    setTopicPage(null);
    if (topic) api.topic(topic).then(setTopicPage).catch(() => {});
  }, [topic]);

  useEffect(() => {
    if (open) api.publicPosts(open).then(setPosts).catch(() => setPosts([]));
  }, [open]);

  const refresh = () => {
    if (q.trim()) api.search(q).then(setFound).catch(() => {});
    else api.profiles().then(setAll).catch(() => {});
    if (open) api.publicPosts(open).then(setPosts).catch(() => {});
    onChange();
  };

  return (
    <div className="search">
      <h1>{t.searchTitle}</h1>
      <input className="search-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchPlaceholder} />
      <p className="hint">{t.searchHint}</p>
      <h3 className="browse-title">{t.searchTopics}</h3>
      <TopicChips chosen={chip ? [chip] : []} onChange={(next) => setChip(next.find((x) => x !== chip) ?? null)} />
      {topic && topicPage?.topic === topic && (
        <div className="topic-results">
          <h3>{t.topicPosts(topicText(topic))}</h3>
          {topicPage.posts.length === 0 && <p className="quiet">{t.topicNone}</p>}
          {topicPage.writers.length > 0 && (
            <>
              <p className="meta">{t.topicWriters}</p>
              <ul className="topic-writers">
                {topicPage.writers.map((w) => (
                  <li key={w.user.id}>
                    <a href={profileHref(w.user)}>
                      <Avatar user={w.user} size={28} /> {w.user.name} <Handle user={w.user} />
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="feed">
            {topicPage.posts.map((x) => (
              <PostCard key={x.id} post={x} me={me} />
            ))}
          </div>
        </div>
      )}
      {groups.length > 0 && (
        <div className="group-results">
          <h3 className="browse-title">{t.groups.searchTitle}</h3>
          <ul className="group-list">
            {groups.map((g) => (
              <GroupRow key={g.id} group={g} />
            ))}
          </ul>
        </div>
      )}
      {!q.trim() && (
        <>
          <h3 className="browse-title">{t.browse}</h3>
          <p className="hint">{t.browseHint}</p>
        </>
      )}
      {shown?.length === 0 && <p className="quiet">{t.searchNone}</p>}
      <ul className="results">
        {shown?.map((p) => (
          <li key={p.user.id} className={open === p.user.id ? 'open' : ''}>
            <div className="result">
              <button className="result-who" onClick={() => setOpen(open === p.user.id ? null : p.user.id)}>
                <Avatar user={p.user} size={44} />
                <span>
                  <span className="name">
                    {p.user.name} {p.friend && <span className="tag">{t.friendLabel}</span>}
                  </span>
                  <Handle user={p.user} />
                  <span className="meta">
                    {p.user.publicProfile && <a className="profile-link" href={profileHref(p.user)} onClick={(e) => {
                      // not the card's click; the document never hears of it, so the link is followed here
                      e.stopPropagation();
                      followLink(e.nativeEvent);
                    }}>{t.openProfile}</a>}{' '}
                    {t.publicCount(p.publicPosts)}
                    {p.user.price ? ` · ${t.euroMonth(p.user.price)}` : ''}
                  </span>
                </span>
              </button>
              <div className="result-actions">
                {!p.friend && (
                  <button className="ghost-pill" onClick={() => api.addFriend(p.user.username).then(refresh)}>
                    {t.addAsFriend}
                  </button>
                )}
                {!!p.user.price &&
                  (p.subscribed ? (
                    <Subscribed author={p.user} until={p.subscribedUntil} onChange={refresh} />
                  ) : (
                    <ConsentBuy kind="service" small label={t.subscribeTo(p.user.name, t.euroMonth(p.user.price!))} onBuy={() => api.subscribe(p.user.id, true).then(refresh)} />
                  ))}
              </div>
            </div>
            {open === p.user.id && (
              <div className="result-posts">
                <h3>{t.publicOnly}</h3>
                {posts.length === 0 && <p className="quiet">{t.noPublic}</p>}
                <div className="feed">
                  {posts.map((x) => (
                    <PostCard key={x.id} post={x} me={me} showAuthor={false} />
                  ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
