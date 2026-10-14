import { useState } from 'react';
import type { Because } from '../../shared/foryou';
import { FREE_WORD_MAX, MAX_FREE_WORDS, TOPICS, type TopicId } from '../../shared/interests';
import { cleanWords, topic } from '../../shared/topics';
import { lang, t } from '../text';

/** A topic's name in the reader's language, with its emoji. */
export const topicText = (id: TopicId) => `${topic(id).emoji} ${topic(id)[lang()]}`;

/** Every topic as a chip to choose: `max` at most (more: the first chosen stay). */
export function TopicChips({ chosen, onChange, max }: { chosen: TopicId[]; onChange: (next: TopicId[]) => void; max?: number }) {
  return (
    <div className="choose topic-chips">
      {TOPICS.map((x) => {
        const on = chosen.includes(x.id);
        const full = !on && max !== undefined && chosen.length >= max;
        return (
          <button key={x.id} type="button" className={'chip topic' + (on ? ' on' : '')} disabled={full} aria-pressed={on} onClick={() => onChange(on ? chosen.filter((c) => c !== x.id) : [...chosen, x.id])}>
            {topicText(x.id)}
          </button>
        );
      })}
    </div>
  );
}

/** The line under a For You card: the reader's topics and words it carries, then the judges that carried it. */
export function BecauseLine({ because }: { because: Because }) {
  const parts = [
    ...because.topics.map(topicText),
    ...because.words.map((w) => `“${w}”`),
    ...because.judges.filter((j) => j !== 'interest').map((j) => t.judgeNames[j]),
  ];
  if (!parts.length) return null;
  return (
    <p className="because">
      {t.because} {parts.join(' · ')}
    </p>
  );
}

/** Choosing interests: topics, and up to MAX_FREE_WORDS words of one's own. */
export function InterestsEditor({ topics, words, onTopics, onWords }: { topics: TopicId[]; words: string[]; onTopics: (next: TopicId[]) => void; onWords: (next: string[]) => void }) {
  const [word, setWord] = useState('');
  const add = () => {
    const next = cleanWords([...words, word]);
    onWords(next);
    setWord('');
  };
  return (
    <div className="interests-editor">
      <TopicChips chosen={topics} onChange={onTopics} />
      <label className="field-label" htmlFor="interest-word">{t.interestsWords}</label>
      <p className="hint">{t.interestsWordsHint(MAX_FREE_WORDS)}</p>
      <div className="row interest-word-row">
        <input
          id="interest-word"
          value={word}
          maxLength={FREE_WORD_MAX}
          disabled={words.length >= MAX_FREE_WORDS}
          placeholder={t.interestsWordPlaceholder}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && word.trim()) {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="ghost-pill small" disabled={!word.trim() || words.length >= MAX_FREE_WORDS} onClick={add}>
          {t.add}
        </button>
      </div>
      {words.length > 0 && (
        <div className="choose interest-words">
          {words.map((w) => (
            <button key={w} type="button" className="chip on word" aria-label={t.removeWord(w)} onClick={() => onWords(words.filter((x) => x !== w))}>
              {w} ✕
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
