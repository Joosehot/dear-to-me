// Words to topics: the normaliser, matching stems in Finnish and English, reading a post's topics
// from its title and text, and finding the topic a search means. The numbers are in shared/interests.ts.

import {
  FREE_WORD_MAX, FREE_WORD_MIN, INNER_STEM_MIN, MAX_FREE_WORDS, MAX_POST_TOPICS, PREFIX_STEM_MIN, READ_MIN_SCORE, TITLE_WEIGHT, TOPICS, TOPIC_IDS,
  type Topic, type TopicId,
} from './interests';

/** How a post came to carry a topic: its author chose it, or it was read from its words. */
export type TopicHow = 'chosen' | 'read';
export interface PostTopic {
  id: TopicId;
  how: TopicHow;
}

export const isTopic = (x: unknown): x is TopicId => typeof x === 'string' && (TOPIC_IDS as readonly string[]).includes(x);
export const topic = (id: TopicId): Topic => TOPICS.find((t) => t.id === id)!;

/** A blog's picture markers ("[kuva 2]", "[picture 2]") are not words of the post. */
const MARKER = /\[(kuva|picture)\s+\d+\]/giu;

/** Text as words: lowercase, composed (an ä typed as a + ¨ is still ä), everything but letters and
 * digits a space between words. ä, ö and å stay themselves: "sää" is not "saa". */
export function words(text: string): string[] {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(MARKER, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** One normalised word, or '' (a free word or a search: its words joined, no spaces). */
export const normalWord = (text: string) => words(text).join('');

/** Does the stem find this word: the whole word when the stem is short, its start, or (a long stem)
 * anywhere in it, a compound word's later part. */
export function stemMatches(stem: string, word: string) {
  if (stem.length < PREFIX_STEM_MIN) return word === stem;
  if (word.startsWith(stem)) return true;
  return stem.length >= INNER_STEM_MIN && word.includes(stem);
}

/** Every stem of a topic, both languages. */
const stemsOf = (t: Topic) => [...t.stems.fi, ...t.stems.en];

/** How many of these words a topic's stems find. */
const hits = (t: Topic, ws: string[]) => ws.filter((w) => stemsOf(t).some((s) => stemMatches(s, w))).length;

/** The topics any of the text's words point to (a word, a phrase: the matching itself). */
export function matchTopics(text: string): TopicId[] {
  const ws = words(text);
  return TOPICS.filter((t) => hits(t, ws) > 0).map((t) => t.id);
}

/** A post's topics read from its words: each topic's hits, a title's counting TITLE_WEIGHT times;
 * those reaching READ_MIN_SCORE, the most hit first (ties: the topics' own order), MAX_POST_TOPICS at most. */
export function readTopics(title: string, body: string): TopicId[] {
  const inTitle = words(title);
  const inBody = words(body);
  return TOPICS.map((t, i) => ({ id: t.id, i, score: TITLE_WEIGHT * hits(t, inTitle) + hits(t, inBody) }))
    .filter((x) => x.score >= READ_MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_POST_TOPICS)
    .map((x) => x.id);
}

/** The topics a post carries: those its author chose (known ones, at most MAX_POST_TOPICS), or, with
 * none chosen, those read from its words. */
export function postTopics(chosen: unknown, title: string, body: string): PostTopic[] {
  const picked = [...new Set(Array.isArray(chosen) ? chosen.filter(isTopic) : [])].slice(0, MAX_POST_TOPICS);
  if (picked.length) return picked.map((id) => ({ id, how: 'chosen' }));
  return readTopics(title, body).map((id) => ({ id, how: 'read' }));
}

/** A person's own words, cleaned: each normalised, FREE_WORD_MIN..FREE_WORD_MAX long, no doubles, MAX_FREE_WORDS at most. */
export function cleanWords(list: unknown): string[] {
  const out: string[] = [];
  for (const w of Array.isArray(list) ? list : []) {
    const n = typeof w === 'string' ? normalWord(w) : '';
    if (n.length >= FREE_WORD_MIN && n.length <= FREE_WORD_MAX && !out.includes(n)) out.push(n);
  }
  return out.slice(0, MAX_FREE_WORDS);
}

/** A person's topics, cleaned: known ones, no doubles, in the topics' own order. */
export const cleanTopics = (list: unknown): TopicId[] => TOPIC_IDS.filter((id) => Array.isArray(list) && list.includes(id));

/** The reader's own words a post's words have (each a stem, matched as the topics' are). */
export function wordHits(own: string[], title: string, body: string): string[] {
  const ws = [...words(title), ...words(body)];
  return own.filter((o) => ws.some((w) => stemMatches(o, w)));
}

/** The topic a search means: one word that is a topic's id or name (either language), or that one
 * of its stems finds ("ruoka", "metsät", "kirjasto"). None: a search for people only. */
export function topicOfQuery(q: string): TopicId | undefined {
  const ws = words(q);
  if (ws.length !== 1) return undefined;
  const [w] = ws;
  const named = TOPICS.find((t) => t.id === w || words(t.fi).join('') === w || words(t.en).join('') === w);
  if (named) return named.id;
  return TOPICS.find((t) => stemsOf(t).some((s) => stemMatches(s, w)))?.id;
}
