// For You, the HotMotor way: the candidates are shown to judges, each scoring one aspect in 0..1
// without seeing where a post came from; the rules weigh them; a beam keeps the best order under
// the diversity rules; and every post carries a trace of why it is where it is. Deterministic: the
// same posts, interests and time give the same order. The server and the mock both run this.
// Every number is in shared/interests.ts.

import * as R from './interests';
import type { JudgeName, TopicId } from './interests';
import { wordHits, type PostTopic } from './topics';

/** A post as the judges see it: its public content and how much it is talked about, nothing of who reads it. */
export interface Candidate {
  id: string;
  authorId: string;
  createdAt: number;
  title: string;
  body: string;
  /** messages in its conversation */
  messages: number;
  topics: PostTopic[];
  /** its author is the reader's friend */
  friend: boolean;
}

/** What the reader chose: topics and their own words (normalised). */
export interface Reader {
  topics: TopicId[];
  words: string[];
}

/** Why a post is where it is: the reader's topics and words it carries, and the judges that carried it. */
export interface Because {
  topics: TopicId[];
  words: string[];
  judges: JudgeName[];
}

export interface Ranked {
  id: string;
  score: number;
  because: Because;
}

const HOUR = 60 * 60 * 1000;

/** The judges: each a score in 0..1 for one aspect, and what it found (for the trace). */
function judge(c: Candidate, reader: Reader, now: number) {
  // interest: the best of the reader's topics the post carries (a chosen one surer than a read one),
  // and their own words in it; the two together as either-or (1 - both missing)
  const topics = c.topics.filter((t) => reader.topics.includes(t.id));
  const topicPart = Math.max(0, ...topics.map((t) => (t.how === 'chosen' ? R.TRUST_CHOSEN : R.TRUST_READ)));
  const words = wordHits(reader.words, c.title, c.body);
  const wordPart = Math.min(1, words.length * R.FREE_WORD_HIT);
  const interest = 1 - (1 - topicPart) * (1 - wordPart);
  // freshness: halves every HALF_LIFE_HOURS
  const ageHours = Math.max(0, now - c.createdAt) / HOUR;
  const freshness = Math.pow(0.5, ageHours / R.HALF_LIFE_HOURS);
  // conversation: diminishing returns, half at TALK_HALF messages
  const conversation = c.messages / (c.messages + R.TALK_HALF);
  const friend = c.friend ? 1 : 0;
  return { scores: { interest, freshness, conversation, friend } as Record<JudgeName, number>, topics: topics.map((t) => t.id), words };
}

interface Judged {
  c: Candidate;
  score: number;
  because: Because;
}

/** Each candidate judged and weighed by the rules, with its trace. */
function judgeAll(cands: Candidate[], reader: Reader, now: number): Judged[] {
  const has = reader.topics.length > 0 || reader.words.length > 0;
  const weights = has ? R.WEIGHTS : R.WEIGHTS_NO_INTERESTS;
  return cands.map((c) => {
    const j = judge(c, reader, now);
    const parts = (Object.keys(weights) as JudgeName[]).map((k) => ({ k, v: weights[k] * j.scores[k] }));
    const score = parts.reduce((s, p) => s + p.v, 0);
    // the judges that carried it: a share of CARRY_SHARE or more, the biggest first (ties: the rules' order)
    const carried = parts
      .filter((p) => p.v > 0 && p.v >= R.CARRY_SHARE * score)
      .sort((a, b) => b.v - a.v)
      .slice(0, R.TRACE_JUDGES)
      .map((p) => p.k);
    const judges = carried.length ? carried : parts.filter((p) => p.v > 0).sort((a, b) => b.v - a.v).slice(0, 1).map((p) => p.k);
    return { c, score, because: { topics: judges.includes('interest') ? j.topics : [], words: judges.includes('interest') ? j.words : [], judges } };
  });
}

/** The best first; ties: the newer, then the smaller id (so two calls never differ). */
const byScore = (a: Judged, b: Judged) => b.score - a.score || b.c.createdAt - a.c.createdAt || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0);

interface Order {
  picked: Judged[];
  value: number;
  /** posts each author has in it */
  per: Map<string, number>;
}

/** Can `j` come next in this order: not the author just before it, and not an author who has
 * MAX_PER_AUTHOR already. `strict` false: the per-author cap gives way (nothing else is left). */
function allowed(o: Order, j: Judged, strict: boolean) {
  const last = o.picked[o.picked.length - 1];
  if (last && last.c.authorId === j.c.authorId) return false;
  return !strict || (o.per.get(j.c.authorId) ?? 0) < R.MAX_PER_AUTHOR;
}

/** The candidates ordered for this reader: one page (PAGE_SIZE), best first under the diversity rules. */
export function rank(cands: Candidate[], reader: Reader, now: number): Ranked[] {
  const pool = judgeAll(cands, reader, now).sort(byScore);
  let beam: Order[] = [{ picked: [], value: 0, per: new Map() }];
  const size = Math.min(R.PAGE_SIZE, pool.length);
  for (let step = 0; step < size; step++) {
    const next: Order[] = [];
    const worth = Math.pow(R.POSITION_DISCOUNT, step);
    for (const o of beam) {
      const left = pool.filter((j) => !o.picked.includes(j));
      // the rules first; if no post keeps them, the cap gives way, then the neighbour rule too
      let fits = left.filter((j) => allowed(o, j, true));
      if (!fits.length) fits = left.filter((j) => allowed(o, j, false));
      if (!fits.length) fits = left;
      for (const j of fits.slice(0, R.BEAM_WIDTH)) {
        const per = new Map(o.per);
        per.set(j.c.authorId, (per.get(j.c.authorId) ?? 0) + 1);
        next.push({ picked: [...o.picked, j], value: o.value + worth * j.score, per });
      }
    }
    // the best orders stay; ties keep the order they were made in (the stable sort), so it is deterministic
    beam = next.sort((a, b) => b.value - a.value).slice(0, R.BEAM_WIDTH);
  }
  return beam[0].picked.map((j) => ({ id: j.c.id, score: j.score, because: j.because }));
}

// ---------------- interest groups to suggest ----------------

/** An interest group as the suggestion sees it: its public side only. */
export interface GroupCandidate {
  id: string;
  topic: TopicId;
  name: string;
  description: string;
  members: number;
  createdAt: number;
}

/** The interest groups to suggest to this reader, best first (GROUP_SUGGESTIONS at most), each with the
 * reader's topics and words it matched: its topic one of theirs (GROUP_TOPIC_MATCH), and each of their
 * own words in its name or description (GROUP_WORD_HIT, to 1), together as either-or; those reaching
 * GROUP_SUGGEST_MIN. Ties: more members, then the newer, then the smaller id. */
export function suggestGroups(groups: GroupCandidate[], reader: Reader): { id: string; score: number; because: Pick<Because, 'topics' | 'words'> }[] {
  return groups
    .map((g) => {
      const topic = reader.topics.includes(g.topic);
      const words = wordHits(reader.words, g.name, g.description);
      const score = 1 - (1 - (topic ? R.GROUP_TOPIC_MATCH : 0)) * (1 - Math.min(1, words.length * R.GROUP_WORD_HIT));
      return { g, score, because: { topics: topic ? [g.topic] : [], words } };
    })
    .filter((x) => x.score >= R.GROUP_SUGGEST_MIN)
    .sort((a, b) => b.score - a.score || b.g.members - a.g.members || b.g.createdAt - a.g.createdAt || (a.g.id < b.g.id ? -1 : 1))
    .slice(0, R.GROUP_SUGGESTIONS)
    .map((x) => ({ id: x.g.id, score: x.score, because: x.because }));
}
