// Moderation, shared by the server (its emails) and the app (the queue, the statements, the forms):
// the rules a decision names, the reasons a report or a notice gives, the facts a statement of
// reasons states, and the shapes the moderation API sends.

import type { Post, User } from './types';

/** The content rules a decision may name (the content rules page lists them in this order). */
export const RULES = ['sexual', 'minors', 'ai', 'illegal', 'harassment', 'spam'] as const;
export type Rule = (typeof RULES)[number];
export const isRule = (x: unknown): x is Rule => RULES.includes(x as Rule);

/** What a signed-in reader may say when reporting a post. */
export const REPORT_REASONS = ['sexual', 'ai', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

type Lang = 'fi' | 'en';

export const RULE_TEXT: Record<Lang, Record<Rule, string>> = {
  fi: {
    sexual: 'seksuaalinen sisältö',
    minors: 'lapsia seksualisoiva sisältö',
    ai: 'tekoälyllä tehty sisältö',
    illegal: 'laiton sisältö',
    harassment: 'häirintä tai uhkailu',
    spam: 'toiseksi henkilöksi tekeytyminen tai roskaposti',
  },
  en: {
    sexual: 'sexual content',
    minors: 'content sexualising children',
    ai: 'AI-generated content',
    illegal: 'illegal content',
    harassment: 'harassment or threats',
    spam: 'impersonation or spam',
  },
};

const REPORT_TEXT: Record<Lang, Record<string, string>> = {
  fi: { sexual: 'seksuaalista sisältöä', ai: 'tekoälyllä tehtyä sisältöä', other: 'muu syy' },
  en: { sexual: 'sexual content', ai: 'AI-generated content', other: 'something else' },
};

/** The decisions: on a post (keep it, remove it, restrict it to its author, lift a restriction), and on a person. */
export type PostAction = 'keep' | 'remove' | 'restrict' | 'lift';
export type DecisionAction = PostAction | 'suspend' | 'unsuspend';
export const POST_ACTIONS: PostAction[] = ['keep', 'remove', 'restrict', 'lift'];
/** The decisions that restrict someone: each sends a statement of reasons, and can be complained about. */
export const RESTRICTING: DecisionAction[] = ['remove', 'restrict', 'suspend'];

/** What a decision was based on: the reports by reason, the notices (from people without an account)
 * by rule, and whether the post was off For You already (hidden automatically by enough reports). */
export interface Facts {
  reports: Record<string, number>;
  notices: Record<string, number>;
  hidden: boolean;
  /** a suspension: the decisions that restricted the person in the months before (their records still kept) */
  earlier?: number;
}

/** The facts in words ("3 ilmoitusta käyttäjiltä: seksuaalista sisältöä 3"). */
export function factsText(f: Facts, lang: Lang, hideAfter = 3): string {
  const fi = lang === 'fi';
  const parts: string[] = [];
  const count = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const reports = count(f.reports);
  const notices = count(f.notices);
  if (reports) {
    const by = Object.entries(f.reports).map(([r, n]) => `${REPORT_TEXT[lang][r] ?? r} ${n}`).join(', ');
    parts.push(fi ? `${reports} ${reports === 1 ? 'ilmoitus käyttäjiltä' : 'ilmoitusta käyttäjiltä'}: ${by}` : `${reports} ${reports === 1 ? 'report' : 'reports'} by users: ${by}`);
  }
  if (notices) {
    const by = Object.entries(f.notices).map(([r, n]) => `${isRule(r) ? RULE_TEXT[lang][r] : r} ${n}`).join(', ');
    parts.push(fi ? `${notices} ${notices === 1 ? 'ilmoitus' : 'ilmoitusta'} ilmoituslomakkeella: ${by}` : `${notices} ${notices === 1 ? 'notice' : 'notices'} through the notice form: ${by}`);
  }
  if (f.earlier) parts.push(fi ? `Aiempia sisältöäsi poistaneita tai rajoittaneita päätöksiä: ${f.earlier}` : `Earlier decisions that removed or restricted your content: ${f.earlier}`);
  if (!reports && !notices && !f.earlier) parts.push(fi ? 'Ei ilmoituksia: moderaattori havaitsi asian itse.' : 'No reports: a moderator found it.');
  if (f.hidden) parts.push(fi ? `Juttu poistui Sinulle-sivulta automaattisesti, kun ${hideAfter} eri käyttäjää oli ilmoittanut siitä.` : `The post left For You automatically once ${hideAfter} different users had reported it.`);
  const text = parts.join('. ').replace(/\.\./g, '.');
  return text.endsWith('.') ? text : `${text}.`;
}

export interface Complaint {
  id: string;
  decisionId: string;
  text: string;
  createdAt: number;
  decidedAt?: number;
  outcome?: 'upheld' | 'reversed';
  /** the moderator's answer */
  answer?: string;
}

/** A moderation decision as its record keeps it: never the content itself. */
export interface Decision {
  id: string;
  action: DecisionAction;
  /** the post it was about (it may be gone), and its title then */
  postId?: string;
  postTitle?: string;
  /** the person it was about (none: their account was deleted since), and their username then */
  userId?: string;
  username?: string;
  /** the rule broken (none: kept, lifted, unsuspended) */
  rule?: Rule;
  /** the moderator's written reason */
  reason: string;
  facts: Facts;
  /** a suspension's end (null: until lifted) */
  until?: number | null;
  /** the moderator's username */
  moderator?: string;
  createdAt: number;
  /** reversed after a complaint */
  reversedAt?: number;
  complaint?: Complaint;
}

/** A notice from someone without an account (the /report-content form). The sender's email is never sent to the app. */
export interface Notice {
  id: string;
  url: string;
  reason: Rule;
  explanation: string;
  /** the post the address names, if it is one here */
  postId?: string;
  createdAt: number;
}

/** A post in the moderation queue: the post itself (whoever it was written for), its author, why it is there, and what was decided before. */
export interface QueueItem {
  post: Post;
  author: User;
  /** open reports, by reason */
  reports: Record<string, number>;
  notices: Notice[];
  /** the first open report or notice */
  since: number;
  /** earlier decisions on this post or its author */
  history: Decision[];
}

export interface Suspension {
  user: User;
  rule?: Rule;
  reason: string;
  /** none: until lifted */
  until: number | null;
  since: number;
  decisionId: string;
}

export interface ModQueue {
  posts: QueueItem[];
  /** notices whose address is not a post here (any more) */
  notices: Notice[];
  complaints: (Complaint & { decision: Decision })[];
  suspended: Suspension[];
}

export interface LogEntry {
  at: number;
  /** the moderator's username ('system': a suspension whose time was up) */
  moderator: string;
  action: string;
  target: string;
  decisionId?: string;
  reason: string;
}

/** The complaint page: the decision as its statement of reasons gave it, and whether a complaint can be made. */
export interface ComplaintPage {
  decision: Decision;
  /** until when a complaint can be made */
  deadline: number;
  canComplain: boolean;
  complaint?: Complaint;
}
