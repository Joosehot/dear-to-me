import { useCallback, useEffect, useState } from 'react';
import type { PostSummary, User } from '../../shared/types';
import { api } from '../api';
import { useLive } from '../live';
import { t } from '../text';
import { PostCard } from '../components/PostCard';
import { useLivePosts } from './Feed';
import { Icon, rich } from '../components/Icon';

/** Letters: blogs and vlogs written for one person, to you and from you, each with a conversation for two. */
export function Letters({ me }: { me: User }) {
  const [letters, setLetters] = useState<PostSummary[] | null>(null);
  const load = useCallback(() => {
    api.letters().then(setLetters).catch(() => setLetters([]));
  }, []);
  useEffect(load, [load]);
  useLive(useLivePosts(setLetters, load));

  return (
    <div className="letters">
      <div className="section-head">
        <h1>{t.letters}</h1>
        <a className="write-button inline" href="/write/letter"><Icon name="envelope" /> {t.writeLetter}</a>
      </div>
      {letters === null && <p className="quiet">…</p>}
      {letters?.length === 0 && <p className="quiet empty">{t.noLetters}</p>}
      <div className="feed">
        {letters?.map((p) => (
          <PostCard key={p.id} post={p} me={me} />
        ))}
      </div>
    </div>
  );
}
