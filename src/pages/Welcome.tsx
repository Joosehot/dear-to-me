import { useEffect, useState } from 'react';
import type { TopicId } from '../../shared/interests';
import { api } from '../api';
import { navigate, nextPath } from '../nav';
import { t } from '../text';
import { InterestsEditor } from '../components/Topics';

/** Once, right after sign-up: a few interests for For You. Skippable, and never shown again once
 * skipped or saved (the server remembers it was asked). Then on to the page they came from (?next=), or the feed. */
export function Welcome() {
  const [topics, setTopics] = useState<TopicId[]>([]);
  const [words, setWords] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .interests()
      .then((i) => (i.asked ? navigate(nextPath()) : setReady(true)))
      .catch(() => navigate(nextPath()));
  }, []);
  const done = (p: Promise<unknown>) => {
    setBusy(true);
    p.catch(() => {}).finally(() => navigate(nextPath()));
  };
  if (!ready) return null;
  return (
    <div className="welcome">
      <h1>{t.welcomeTitle}</h1>
      <p className="hint">{t.welcomeLead}</p>
      <InterestsEditor topics={topics} words={words} onTopics={setTopics} onWords={setWords} />
      <div className="actions">
        <button className="ghost" disabled={busy} onClick={() => done(api.skipInterests())}>
          {t.welcomeSkip}
        </button>
        <button className="primary" disabled={busy || (topics.length === 0 && words.length === 0)} onClick={() => done(api.setInterests(topics, words))}>
          {t.welcomeSave}
        </button>
      </div>
    </div>
  );
}
