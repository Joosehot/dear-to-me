// The storage: one SQLite file, db.sqlite in the data folder, through Node's own node:sqlite.
//
// Every method runs its SQL at once; nothing is held in memory. Steps that belong together run in
// one transaction (tx), so a crash leaves none of them half done, and files on disk go only once
// it is committed. A data folder from before SQLite (db.json) is imported on its first start, in one
// transaction, and the JSON file is kept beside it as db.json.migrated.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import type { Message, Note, PlanState, Post, User } from '../shared/types.js';
import type { Purchase } from './pay.js';
import { remove } from './media.js';
import { hashPasswordSync } from './auth.js';
import { PLANS, beyondLite, isLive, quota, type PlanName, type Space } from '../shared/plans.js';
import { AUDIT_MONTHS, COMPLAINT_MONTHS, REPORT_MONTHS } from '../shared/terms.js';
import { isRule, type Complaint, type Decision, type DecisionAction, type Facts, type LogEntry, type ModQueue, type Notice, type PostAction, type QueueItem, type Rule, type Suspension } from '../shared/moderation.js';
import { USERNAME_HOLD_DAYS, normalUsername, usernameFrom, usernameProblem, type UsernameReason } from '../shared/usernames.js';
import { TOPIC_POSTS_MAX, TOPIC_WRITERS_MAX, type TopicId } from '../shared/interests.js';
import { cleanTopics, cleanWords, isTopic, postTopics, type PostTopic } from '../shared/topics.js';
import { rank, suggestGroups, type Candidate, type Ranked } from '../shared/foryou.js';
import type { Group, GroupInvite, GroupKind, GroupMember, GroupRole, Interests, Invitation } from '../shared/types.js';
import { GROUP_LIST_MAX, GROUP_SEARCH_MAX } from '../shared/groups.js';

// ---------------- the schema ----------------
// Ids are the app's own (hex strings). `n INTEGER PRIMARY KEY` keeps the order rows came in where it
// matters (an INTEGER PRIMARY KEY survives VACUUM; a plain rowid may not). Times are ms since 1970,
// money in cents, flags 0 or 1. A user's deletion cascades to everything of theirs; the purchases
// log keeps its rows, without whose they were.

/** Usernames changed away from: held for their previous owner for USERNAME_HOLD_DAYS (only they may
 * take one back). They go with the account (a deleted account holds nothing). Since version 2. */
const RELEASED = `-- a username changed away from, and when (held for its previous owner a while)
CREATE TABLE released_usernames (
  username TEXT PRIMARY KEY COLLATE NOCASE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  released_at INTEGER NOT NULL
);
CREATE INDEX released_usernames_user ON released_usernames (user_id);
CREATE INDEX released_usernames_at ON released_usernames (released_at);
`;

/** Interests (since version 3). A post's topics, chosen by its author or read from its words (public
 * posts only: For You and the topic search are theirs); and a person's own interests, private: never
 * sent to anyone else, used only to order their For You. Both go with what they belong to. */
const INTERESTS = `-- a public post's topics: 'chosen' by its author, or 'read' from its title and text
CREATE TABLE post_topics (
  post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  how TEXT NOT NULL CHECK (how IN ('chosen', 'read')),
  PRIMARY KEY (post_id, topic)
);
CREATE INDEX post_topics_topic ON post_topics (topic, post_id);
-- a person's interests (private): topics and their own words, JSON arrays; asked_at: when they saved
-- or skipped the step after sign-up (none: never asked)
CREATE TABLE interests (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  topics TEXT NOT NULL DEFAULT '[]',
  words TEXT NOT NULL DEFAULT '[]',
  asked_at INTEGER
);
`;

/** Stripe's webhook events already applied (since version 4): Stripe sends an event again until it is
 * answered, so one is applied once. Kept STRIPE_EVENT_DAYS (Stripe retries for three days). */
const STRIPE_EVENTS = `-- a webhook event from Stripe, applied once
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX stripe_events_at ON stripe_events (at);
`;
const STRIPE_EVENT_DAYS = 30;

/** Links sent by email (since version 5): an address to confirm ('verify', after sign-up or for a new
 * address) or a password to reset ('reset'). Only the SHA-256 of the link's token is kept; a token is
 * used once, and a new one of a kind replaces the user's older ones. They go with the account. */
const EMAIL_TOKENS = `-- a link sent by email: its token's SHA-256, whose, what for, for which address, until when
CREATE TABLE email_tokens (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX email_tokens_user ON email_tokens (user_id, kind);
CREATE INDEX email_tokens_expiry ON email_tokens (expires_at);
`;

/** Moderation (since version 6; and the posts' restricted column). A decision is kept as a record of
 * what was decided, never the content: COMPLAINT_MONTHS, longer only while a complaint about it is
 * open or a suspension it made lasts. A deleted account leaves its decisions without whose they were
 * (the username then stays). Notices go after REPORT_MONTHS, the log after AUDIT_MONTHS. */
const MODERATION = `-- a moderation decision: what, about which post and whom, on which rule, why, on what facts (JSON)
CREATE TABLE mod_decisions (
  n INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK (action IN ('keep', 'remove', 'restrict', 'lift', 'suspend', 'unsuspend')),
  -- the post (it may be gone since) and its title then
  post_id TEXT,
  post_title TEXT,
  -- the person it was about, and their username then
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  username TEXT,
  rule TEXT,
  reason TEXT NOT NULL,
  facts TEXT NOT NULL,
  -- a suspension's end (none: until lifted)
  until INTEGER,
  moderator_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  moderator TEXT,
  created_at INTEGER NOT NULL,
  -- reversed after a complaint
  reversed_at INTEGER
);
CREATE INDEX mod_decisions_post ON mod_decisions (post_id);
CREATE INDEX mod_decisions_user ON mod_decisions (user_id);
CREATE INDEX mod_decisions_created ON mod_decisions (created_at);
-- a complaint about a decision by the person it was about (one a decision); the address the outcome goes to
CREATE TABLE mod_complaints (
  n INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  decision_id TEXT NOT NULL UNIQUE REFERENCES mod_decisions (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  outcome TEXT CHECK (outcome IN ('upheld', 'reversed')),
  answer TEXT,
  moderator_id TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX mod_complaints_open ON mod_complaints (decided_at);
-- the link in a statement of reasons to complain with (a suspended person cannot sign in): its token's SHA-256, used once
CREATE TABLE mod_tokens (
  hash TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES mod_decisions (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX mod_tokens_decision ON mod_tokens (decision_id);
CREATE INDEX mod_tokens_expiry ON mod_tokens (expires_at);
-- a suspended account: no signing in, nothing of theirs shown to others, until \`until\` (none: until lifted)
CREATE TABLE suspensions (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  decision_id TEXT NOT NULL,
  rule TEXT,
  reason TEXT NOT NULL,
  until INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX suspensions_until ON suspensions (until) WHERE until IS NOT NULL;
-- a notice from someone without an account (the /report-content form): their address, for the answer
CREATE TABLE mod_notices (
  n INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  url TEXT NOT NULL,
  -- the post the address names, if it is one here
  post_id TEXT REFERENCES posts (id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  explanation TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decision_id TEXT
);
CREATE INDEX mod_notices_post ON mod_notices (post_id);
CREATE INDEX mod_notices_created ON mod_notices (created_at);
-- every moderation action: by whom (their username then), when, what, about what, and why
CREATE TABLE mod_log (
  n INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  moderator_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  moderator TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  decision_id TEXT,
  reason TEXT NOT NULL
);
CREATE INDEX mod_log_at ON mod_log (at);
`;

/** Groups (since version 7). A friend group is private: its members see it and its posts, and one joins
 * only by accepting an invitation (an admin's, or a member's suggestion an admin approved). An interest
 * group is open, around a topic: anyone signed in reads it and joins; its admins may ban. A post written
 * to a group is the posts' audience 'group' with its group_id; deleting a group deletes its posts first
 * (deletePost). Memberships, invitations and bans go with the account; a group's last admin is handled
 * by deleteUser before that. */
const GROUPS = `-- a group: 'friends' (private, by invitation) or 'interest' (open, around a topic)
CREATE TABLE groups (
  n INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('friends', 'interest')),
  name TEXT NOT NULL,
  -- the name in lowercase: search, and an interest group's name is unique within its topic
  name_key TEXT NOT NULL,
  description TEXT,
  -- an interest group's topic (shared/interests.ts); a friend group has none
  topic TEXT,
  -- a friend group's picture
  picture_url TEXT,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  CHECK ((kind = 'interest') = (topic IS NOT NULL))
);
CREATE UNIQUE INDEX groups_topic_name ON groups (topic, name_key) WHERE kind = 'interest';
CREATE INDEX groups_name ON groups (name_key);
-- a member and their role
CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user ON group_members (user_id);
-- a friend group's invitation: 'invited' (waits for the invitee to accept or decline) or 'suggested' by
-- a member (waits for an admin to approve); who asked
CREATE TABLE group_invites (
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  invited_by TEXT REFERENCES users (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('invited', 'suggested')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_invites_user ON group_invites (user_id);
-- banned from an interest group by its admins: they cannot join it or talk in it
CREATE TABLE group_bans (
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  banned_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
`;

/** The posts table (made under another name when version 7 rebuilds it: SQLite cannot change a CHECK). */
const POSTS = (table: string) => `CREATE TABLE ${table} (
  n INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  author_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- 'blog' or 'vlog'
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  video_url TEXT,
  image_url TEXT,
  -- pictures among a blog's text: a JSON array of addresses
  pictures TEXT,
  -- 'friends', 'public', 'chosen': the friends in chosen (a JSON array of ids), or 'group': the group in group_id (since version 7)
  audience TEXT NOT NULL CHECK (audience IN ('friends', 'public', 'chosen', 'group')),
  chosen TEXT,
  group_id TEXT REFERENCES groups (id),
  paid INTEGER NOT NULL DEFAULT 0,
  -- Exclusive: the post sold by itself (none: a subscription post)
  price INTEGER,
  -- reported by enough readers: off For You
  hidden INTEGER NOT NULL DEFAULT 0,
  -- restricted by a moderator: only its author sees it (since version 6)
  restricted INTEGER NOT NULL DEFAULT 0,
  -- when its time is up (none: it stays until its author ends it)
  expires_at INTEGER,
  archived INTEGER NOT NULL DEFAULT 0,
  -- bytes of its text and pictures, and of its video
  size INTEGER,
  video_size INTEGER,
  -- a vlog's length in seconds
  duration REAL,
  letter INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  CHECK ((audience = 'group') = (group_id IS NOT NULL))
);
`;
const POST_INDEXES = `CREATE INDEX posts_author ON posts (author_id, created_at);
CREATE INDEX posts_audience ON posts (audience, created_at);
CREATE INDEX posts_created ON posts (created_at);
-- the sweep: live posts whose time may be up
CREATE INDEX posts_expiry ON posts (expires_at) WHERE archived = 0 AND expires_at IS NOT NULL;
-- a group's posts
CREATE INDEX posts_group ON posts (group_id, created_at) WHERE group_id IS NOT NULL;
`;
/** The posts' columns before version 7 (what the rebuild copies). */
const POST_COLUMNS_6 = 'n, id, author_id, kind, title, body, video_url, image_url, pictures, audience, chosen, paid, price, hidden, restricted, expires_at, archived, size, video_size, duration, letter, created_at';

const SCHEMA = `
-- people, in the order they came
CREATE TABLE users (
  n INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  -- the display name: free, two people may share one
  name TEXT NOT NULL,
  -- the name in lowercase, for search
  name_key TEXT NOT NULL,
  -- the @handle: unique, lowercase as shared/usernames.ts allows it (friends are added by it)
  username TEXT NOT NULL COLLATE NOCASE,
  color TEXT NOT NULL,
  -- the monthly subscription to their paid public posts (none: they sell nothing)
  price INTEGER,
  -- 'pro' (Unlimited) or 'exclusive' (none: Lite)
  plan TEXT,
  -- storage packs bought, each space (none: never had one)
  packs_video INTEGER,
  packs_media INTEGER,
  public_profile INTEGER NOT NULL DEFAULT 0,
  bio TEXT,
  avatar_url TEXT,
  wallpaper_url TEXT
);
CREATE INDEX users_name ON users (name_key);
CREATE UNIQUE INDEX users_username ON users (username);
${RELEASED}
-- signing in: kept off the users (who are sent to every client)
CREATE TABLE accounts (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- trimmed and lowercase
  email TEXT NOT NULL UNIQUE,
  -- scrypt, as server/auth.ts writes it
  password TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  -- when they accepted the terms of use and the privacy policy
  terms_at INTEGER,
  -- when the email was confirmed (none: not yet; buying, selling and a public profile wait for it)
  verified_at INTEGER,
  -- the invite code signed up with (a closed beta), if one was asked
  invite_code TEXT
);

-- a session is the SHA-256 of its cookie's token (the token itself is never kept)
CREATE TABLE sessions (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);

-- friendships, both ways: (a, b) means a and b are friends (kept once, either way round)
CREATE TABLE friends (
  a TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  b TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (a, b)
);
CREATE INDEX friends_b ON friends (b, a);

${POSTS('posts')}${POST_INDEXES}
-- the conversation under each post
CREATE TABLE messages (
  n INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX messages_post ON messages (post_id, created_at);
CREATE INDEX messages_user ON messages (user_id);

-- BoVNotes: left inside a post for chosen readers (recipients and seen_by: JSON arrays of ids)
CREATE TABLE notes (
  n INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  recipients TEXT NOT NULL,
  seen_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX notes_post ON notes (post_id, created_at);
CREATE INDEX notes_author ON notes (author_id);

-- subscribed to an author's paid public posts (until: cancelled, open until then)
CREATE TABLE subscriptions (
  reader_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  until INTEGER,
  PRIMARY KEY (reader_id, author_id)
);
CREATE INDEX subscriptions_author ON subscriptions (author_id);
CREATE INDEX subscriptions_until ON subscriptions (until) WHERE until IS NOT NULL;

-- an Exclusive post bought
CREATE TABLE purchases (
  buyer_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  PRIMARY KEY (buyer_id, post_id)
);
CREATE INDEX purchases_post ON purchases (post_id);

-- one report a reader a post
CREATE TABLE reports (
  post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX reports_user ON reports (user_id);
CREATE INDEX reports_created ON reports (created_at);

-- Stripe's ids, kept off the users. An author's Connect account (it stays at Stripe when they go)
CREATE TABLE pay_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  account TEXT NOT NULL
);
-- the monthly subscription of a user's plan
CREATE TABLE pay_plans (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  subscription TEXT NOT NULL
);
-- a user's storage pack subscriptions
CREATE TABLE pay_packs (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  subscription TEXT NOT NULL,
  PRIMARY KEY (user_id, subscription)
);
-- a reader's subscription to an author
CREATE TABLE pay_readers (
  reader_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  subscription TEXT NOT NULL,
  PRIMARY KEY (reader_id, author_id)
);
CREATE INDEX pay_readers_author ON pay_readers (author_id);
-- Checkout sessions already granted (each once)
CREATE TABLE pay_sessions (
  id TEXT PRIMARY KEY
);

-- every purchase, D2M's own record of it (the legal texts point to it): kept for accounting when
-- its buyer goes (user_id then none), and item none when it named a deleted author
CREATE TABLE purchase_log (
  n INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  -- 'plan', 'pack', 'author' or 'post'
  kind TEXT NOT NULL,
  -- the plan, the storage space, the author's id or the post's id
  item TEXT,
  amount INTEGER NOT NULL,
  -- Stripe's ids: the Checkout session, the monthly subscription, a single post's payment intent
  session TEXT,
  subscription TEXT,
  payment TEXT,
  consent_at INTEGER,
  created_at INTEGER NOT NULL,
  withdrawn_at INTEGER,
  refunded INTEGER,
  refunded_at INTEGER
);
CREATE INDEX purchase_log_user ON purchase_log (user_id);
CREATE INDEX purchase_log_item ON purchase_log (item);

-- videos uploaded straight into R2, not yet in a post (no foreign key: a deleted user's upload
-- stays until the stale-upload sweep takes it out of the bucket)
CREATE TABLE uploads (
  key TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  -- the bytes, once the parts are put together
  size INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX uploads_user ON uploads (user_id);
CREATE INDEX uploads_created ON uploads (created_at);

-- files to remove later: a vlog's original after its smaller copy took over (someone may be watching it)
CREATE TABLE later (
  n INTEGER PRIMARY KEY,
  url TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX later_at ON later (at);
${INTERESTS}${STRIPE_EVENTS}${EMAIL_TOKENS}${MODERATION}${GROUPS}`;

/** PRAGMA user_version once the schema and its first rows are in (0: a fresh file, or one whose first start rolled back).
 * 1: the first schema. 2: usernames (the users' username column, released_usernames). 3: interests (post_topics and
 * interests; the public posts there were get topics read from their words). 4: stripe_events (the webhook's events
 * applied). 5: email (the accounts' verified_at and invite_code, email_tokens; the accounts there were count as
 * verified). 6: moderation (the posts' restricted column; decisions, complaints, their links, suspensions, notices
 * and the log). 7: groups (groups, their members, invitations and bans; the posts' group_id and audience 'group',
 * the posts table rebuilt for its new CHECK). migrate() brings an older one here. */
const VERSION = 7;

// ---------------- the shapes ----------------

/** The data as db.json held it (before SQLite); the seed is made in it too. */
interface Data {
  users: User[];
  /** friendships, both ways: [a, b] means a and b are friends */
  friends: [string, string][];
  posts: Post[];
  messages: Message[];
  notes: Note[];
  /** [subscriber, author, until]: subscribed to the author's paid public posts (until: cancelled, open until then) */
  subscriptions: [string, string, number?][];
  /** [buyer, post]: an Exclusive post bought */
  purchases: [string, string][];
  reports: { postId: string; userId: string; reason: string; createdAt: number }[];
  /** Stripe's side, kept off the users (who are sent to every client) */
  pay: Pay;
  /** videos uploaded straight into R2, not yet in a post */
  uploads: Upload[];
  /** files to remove later */
  later: { url: string; at: number }[];
  /** emails, passwords and sessions, kept off the users */
  auth: Auth;
}

export interface Account {
  /** trimmed and lowercase */
  email: string;
  /** scrypt, as server/auth.ts writes it */
  password: string;
  createdAt: number;
  /** when they accepted the terms of use and the privacy policy */
  termsAt?: number;
  /** when the email was confirmed (none: not yet) */
  verifiedAt?: number;
  /** the invite code signed up with (a closed beta) */
  inviteCode?: string;
}

export interface Session {
  /** SHA-256 of the cookie's token (the token itself is never kept) */
  hash: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface Auth {
  /** by user id */
  accounts: Record<string, Account>;
  sessions: Session[];
}

/** The demo people's emails are <name>@demo.d2m, and they all share this password (D2M_DEMO=1 only). */
export const DEMO_NAMES = ['Joose', 'Aino', 'Mikko', 'Sara', 'Leo', 'Mira', 'Eeva'];
export const DEMO_PASSWORD = 'dear-to-me-demo';
export const demoEmail = (name: string) => `${name.toLowerCase()}@demo.d2m`;

export interface Upload {
  key: string;
  uploadId: string;
  userId: string;
  /** the bytes, once the parts are put together */
  size?: number;
  createdAt: number;
}

/** Stripe's side as db.json held it. */
export interface Pay {
  accounts: Record<string, string>;
  plans: Record<string, string>;
  packs: Record<string, string[]>;
  /** `${reader}:${author}` */
  readers: Record<string, string>;
  sessions: string[];
  log: LogRow[];
}

/** One purchase in the log. Kept for accounting when its buyer's account is deleted, without whose it was. */
export interface LogRow {
  id: string;
  /** the buyer (none: their account was deleted) */
  userId?: string;
  kind: 'plan' | 'pack' | 'author' | 'post';
  /** the plan, the storage space, the author's id or the post's id (none: that author's account was deleted) */
  item?: string;
  /** cents charged (0: payments were off) */
  amount: number;
  /** Stripe's ids: the Checkout session, the monthly subscription, a single post's payment intent */
  session?: string;
  subscription?: string;
  payment?: string;
  /** when the buyer gave their express consent in the app (access at once) */
  consentAt?: number;
  createdAt: number;
  withdrawnAt?: number;
  /** cents refunded, and when */
  refunded?: number;
  refundedAt?: number;
}

/** Reports from this many different readers take a post off the For You page until it is reviewed. */
export const HIDE_AFTER_REPORTS = 3;

const COLORS = ['#c0577a', '#5b7fbf', '#3f9d7f', '#d08a3c', '#8a63b8', '#c4573c', '#4a9bb0'];

export const id = () => crypto.randomBytes(6).toString('hex');

/** What may be bound: undefined goes in as NULL, a flag as 0 or 1. */
type Arg = string | number | boolean | null | undefined;
type Row = Record<string, string | number | null>;
const bind = (x: Arg): SQLInputValue => (x === undefined ? null : typeof x === 'boolean' ? Number(x) : x);

const PACK_COLUMN: Record<Space, string> = { video: 'packs_video', media: 'packs_media' };
const PICTURE_COLUMN = { avatarUrl: 'avatar_url', wallpaperUrl: 'wallpaper_url' } as const;

/** A live post, in SQL (as isLive says it), at :now. */
const LIVE = '(p.archived = 0 AND (p.expires_at IS NULL OR p.expires_at > :now))';

/** A suspension in force at `at` (SQL, for the suspensions row `s`). */
const SUSPENDED = (at: string) => `(s.until IS NULL OR s.until > ${at})`;

/** A post moderation does not keep from others, in SQL at :now: not restricted, and its author not suspended. */
const OPEN = `(p.restricted = 0 AND NOT EXISTS (SELECT 1 FROM suspensions s WHERE s.user_id = p.author_id AND ${SUSPENDED(':now')}))`;

/** `m` months before `now` (ms). */
function monthsBefore(now: number, m: number) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - m);
  return d.getTime();
}

function toDecision(r: Row): Decision {
  const d: Decision = { id: r.id as string, action: r.action as DecisionAction, reason: r.reason as string, facts: JSON.parse(r.facts as string), createdAt: r.created_at as number };
  if (r.post_id !== null) d.postId = r.post_id as string;
  if (r.post_title !== null) d.postTitle = r.post_title as string;
  if (r.user_id !== null) d.userId = r.user_id as string;
  if (r.username !== null) d.username = r.username as string;
  if (r.rule !== null && isRule(r.rule)) d.rule = r.rule;
  if (r.action === 'suspend') d.until = r.until as number | null;
  if (r.moderator !== null) d.moderator = r.moderator as string;
  if (r.reversed_at !== null) d.reversedAt = r.reversed_at as number;
  return d;
}

function toComplaint(r: Row): Complaint {
  const c: Complaint = { id: r.id as string, decisionId: r.decision_id as string, text: r.text as string, createdAt: r.created_at as number };
  if (r.decided_at !== null) c.decidedAt = r.decided_at as number;
  if (r.outcome !== null) c.outcome = r.outcome as Complaint['outcome'];
  if (r.answer !== null) c.answer = r.answer as string;
  return c;
}

function toNotice(r: Row): Notice {
  const n: Notice = { id: r.id as string, url: r.url as string, reason: r.reason as Rule, explanation: r.explanation as string, createdAt: r.created_at as number };
  if (r.post_id !== null) n.postId = r.post_id as string;
  return n;
}

/** Who did a moderation action: a moderator (their id and username), or the system (a suspension's time up). */
export interface Moderator {
  id: string | null;
  username: string;
}

function toUser(r: Row): User {
  const u: User = { id: r.id as string, name: r.name as string, username: r.username as string, color: r.color as string };
  if (r.price !== null) u.price = r.price as number;
  if (r.plan !== null) u.plan = r.plan as PlanName;
  if (r.packs_video !== null || r.packs_media !== null) {
    u.packs = {};
    if (r.packs_video !== null) u.packs.video = r.packs_video as number;
    if (r.packs_media !== null) u.packs.media = r.packs_media as number;
  }
  if (r.public_profile) u.publicProfile = true;
  if (r.bio !== null) u.bio = r.bio as string;
  if (r.avatar_url !== null) u.avatarUrl = r.avatar_url as string;
  if (r.wallpaper_url !== null) u.wallpaperUrl = r.wallpaper_url as string;
  return u;
}

function toPost(r: Row): Post {
  const p: Post = {
    id: r.id as string,
    authorId: r.author_id as string,
    kind: r.kind as Post['kind'],
    title: r.title as string,
    body: r.body as string,
    audience: r.audience === 'chosen' ? JSON.parse(r.chosen as string) : (r.audience as 'friends' | 'public' | 'group'),
    expiresAt: r.expires_at as number | null,
    createdAt: r.created_at as number,
  };
  if (r.group_id !== null && r.group_id !== undefined) p.groupId = r.group_id as string;
  if (r.video_url !== null) p.videoUrl = r.video_url as string;
  if (r.image_url !== null) p.imageUrl = r.image_url as string;
  if (r.pictures !== null) p.pictures = JSON.parse(r.pictures as string);
  if (r.paid) p.paid = true;
  if (r.price !== null) p.price = r.price as number;
  if (r.hidden) p.hidden = true;
  if (r.restricted) p.restricted = true;
  if (r.archived) p.archived = true;
  if (r.size !== null) p.size = r.size as number;
  if (r.video_size !== null) p.videoSize = r.video_size as number;
  if (r.duration !== null) p.duration = r.duration as number;
  if (r.letter) p.letter = true;
  return p;
}

/** A group's columns, how many members it has, and the asker's (:me) role in it and whether they are banned (SQL, for the groups row `g`). */
const GROUP_COLUMNS = `g.*, (SELECT count(*) FROM group_members c WHERE c.group_id = g.id) AS members,
  (SELECT r.role FROM group_members r WHERE r.group_id = g.id AND r.user_id = :me) AS role,
  EXISTS (SELECT 1 FROM group_bans b WHERE b.group_id = g.id AND b.user_id = :me) AS banned`;

function toGroup(r: Row): Group {
  const g: Group = { id: r.id as string, kind: r.kind as GroupKind, name: r.name as string, createdAt: r.created_at as number, members: r.members as number };
  if (r.description !== null) g.description = r.description as string;
  if (isTopic(r.topic)) g.topic = r.topic;
  if (r.picture_url !== null) g.pictureUrl = r.picture_url as string;
  if (r.role !== null && r.role !== undefined) g.role = r.role as GroupRole;
  if (r.banned) g.banned = true;
  return g;
}

const toMessage = (r: Row): Message => ({ id: r.id as string, postId: r.post_id as string, userId: r.user_id as string, text: r.text as string, createdAt: r.created_at as number });

const toNote = (r: Row): Note => ({
  id: r.id as string,
  postId: r.post_id as string,
  authorId: r.author_id as string,
  text: r.text as string,
  recipients: JSON.parse(r.recipients as string),
  seenBy: JSON.parse(r.seen_by as string),
  createdAt: r.created_at as number,
});

const toUpload = (r: Row): Upload => {
  const u: Upload = { key: r.key as string, uploadId: r.upload_id as string, userId: r.user_id as string, createdAt: r.created_at as number };
  if (r.size !== null) u.size = r.size as number;
  return u;
};

function toLogRow(r: Row): LogRow {
  const row: LogRow = { id: r.id as string, kind: r.kind as LogRow['kind'], amount: r.amount as number, createdAt: r.created_at as number };
  const more = { userId: r.user_id, item: r.item, session: r.session, subscription: r.subscription, payment: r.payment, consentAt: r.consent_at, withdrawnAt: r.withdrawn_at, refunded: r.refunded, refundedAt: r.refunded_at };
  for (const [k, v] of Object.entries(more)) if (v !== null) (row as unknown as Record<string, unknown>)[k] = v;
  return row;
}

export class Store {
  private db: DatabaseSync;
  private statements = new Map<string, StatementSync>();
  /** how deep in tx() we are (a transaction's steps may be transactions of their own) */
  private depth = 0;
  /** what waits for the transaction to commit (files to remove) */
  private afterCommit: (() => void)[] = [];

  /** `file`: db.sqlite (a db.json beside it is imported on its first start).
   * `demo`: a fresh start has the demo people and their posts, and the demo people can sign in.
   * Without it a fresh start is empty (production). */
  constructor(file: string, private uploads = '', demo = false) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    // WAL: readers (a backup) never wait for the writer; secure_delete: a deleted account's rows are
    // overwritten, not left in free pages
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;');
    const json = path.join(path.dirname(file), 'db.json');
    if (this.version() === 0) {
      const old = fs.existsSync(json);
      const loaded = this.load(old ? fromJson(JSON.parse(fs.readFileSync(json, 'utf8'))) : demo ? seed() : empty());
      if (old && loaded) {
        // kept, never deleted: the way back if anything went wrong
        const to = fs.existsSync(`${json}.migrated`) ? `${json}.migrated-${Date.now()}` : `${json}.migrated`;
        fs.renameSync(json, to);
        console.log(`store: ${json} imported into ${file}, kept as ${path.basename(to)}`);
      }
    } else {
      if (fs.existsSync(json)) console.warn(`store: ${json} is ignored (the data is in ${path.basename(file)})`);
      this.migrate();
    }
    // the demo people (and only they) get their demo sign-in, if they have none (data from before sign-in too)
    if (demo)
      for (const name of DEMO_NAMES) {
        const user = this.get('SELECT id FROM users WHERE username = ?', name.toLowerCase());
        if (user && !this.authAccount(user.id as string) && !this.account(demoEmail(name)))
          this.run('INSERT INTO accounts (user_id, email, password, created_at, verified_at) VALUES (?, ?, ?, ?, ?)', user.id, demoEmail(name), hashPasswordSync(DEMO_PASSWORD), Date.now(), Date.now());
      }
    this.run('DELETE FROM sessions WHERE expires_at <= ?', Date.now());
    this.run('DELETE FROM email_tokens WHERE expires_at <= ?', Date.now());
  }

  /** Close the file (the checks; the server keeps it open while it runs). */
  close() {
    this.db.close();
  }

  // ---------------- SQL ----------------

  private st(sql: string) {
    let s = this.statements.get(sql);
    if (!s) this.statements.set(sql, (s = this.db.prepare(sql)));
    return s;
  }

  /** Arguments by position, or one object of named ones (:name in the SQL). */
  private args(a: Arg[] | [Record<string, Arg>]): SQLInputValue[] | [Record<string, SQLInputValue>] {
    const [first] = a;
    if (first !== null && typeof first === 'object') return [Object.fromEntries(Object.entries(first).map(([k, v]) => [k, bind(v)]))];
    return (a as Arg[]).map(bind);
  }

  private run(sql: string, ...a: Arg[] | [Record<string, Arg>]) {
    return this.st(sql).run(...(this.args(a) as SQLInputValue[]));
  }

  private get(sql: string, ...a: Arg[] | [Record<string, Arg>]) {
    return this.st(sql).get(...(this.args(a) as SQLInputValue[])) as Row | undefined;
  }

  private all(sql: string, ...a: Arg[] | [Record<string, Arg>]) {
    return this.st(sql).all(...(this.args(a) as SQLInputValue[])) as Row[];
  }

  /** Run `f` in one transaction: all of it, or (if it throws) none of it. Inside another, it is part of that one. */
  private tx<T>(f: () => T): T {
    if (this.depth > 0) {
      this.depth++;
      try {
        return f();
      } finally {
        this.depth--;
      }
    }
    this.db.exec('BEGIN IMMEDIATE');
    this.depth = 1;
    let result: T;
    try {
      result = f();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      this.afterCommit = [];
      throw e;
    } finally {
      this.depth = 0;
    }
    const after = this.afterCommit;
    this.afterCommit = [];
    for (const f of after) f();
    return result;
  }

  /** Once the transaction is committed (at once outside one). */
  private then(f: () => void) {
    if (this.depth > 0) this.afterCommit.push(f);
    else f();
  }

  private version() {
    return (this.get('PRAGMA user_version')?.user_version as number) ?? 0;
  }

  /** The schema and a first set of rows (db.json's, the seed, or none), in one transaction. Rows
   * naming someone or something no longer there (left by the JSON file's older code) are left out. */
  private load(d: Data): boolean {
    // the foreign keys are checked once everything is in (a pragma that cannot change inside a transaction)
    this.db.exec('PRAGMA foreign_keys = OFF');
    try {
      return this.tx(() => {
        // asked again inside the lock: two servers starting at once (a dev restart) must not both build it
        if (this.version() !== 0) return false;
        this.db.exec(SCHEMA);
        let skipped = 0;
        const put = (sql: string, ...a: Arg[]) => {
          if (this.run(sql, ...a).changes === 0) skipped++;
        };
        // db.json had no usernames: each gets one from their name (the seed's are made the same way)
        const taken = new Set<string>();
        for (const u of d.users) {
          const username = usernameFrom(u.name, (x) => !taken.has(x));
          taken.add(username);
          put(
            'INSERT OR IGNORE INTO users (id, name, name_key, username, color, price, plan, packs_video, packs_media, public_profile, bio, avatar_url, wallpaper_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            u.id, u.name, u.name.toLowerCase(), username, u.color, u.price, u.plan, u.packs?.video, u.packs?.media, !!u.publicProfile, u.bio, u.avatarUrl, u.wallpaperUrl,
          );
        }
        for (const [userId, a] of Object.entries(d.auth.accounts))
          // (accounts from before email verification count as verified)
          put('INSERT OR IGNORE INTO accounts (user_id, email, password, created_at, terms_at, verified_at) VALUES (?, ?, ?, ?, ?, ?)', userId, a.email, a.password, a.createdAt, a.termsAt, a.verifiedAt ?? Date.now());
        for (const s of d.auth.sessions) put('INSERT OR IGNORE INTO sessions (hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', s.hash, s.userId, s.createdAt, s.expiresAt);
        for (const [a, b] of d.friends) put('INSERT OR IGNORE INTO friends (a, b) SELECT ?1, ?2 WHERE NOT EXISTS (SELECT 1 FROM friends WHERE a = ?2 AND b = ?1)', a, b);
        for (const p of d.posts) this.insertPost(p);
        for (const m of d.messages) put('INSERT OR IGNORE INTO messages (id, post_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)', m.id, m.postId, m.userId, m.text, m.createdAt);
        for (const n of d.notes)
          put('INSERT OR IGNORE INTO notes (id, post_id, author_id, text, recipients, seen_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', n.id, n.postId, n.authorId, n.text, JSON.stringify(n.recipients ?? []), JSON.stringify(n.seenBy ?? []), n.createdAt);
        for (const [s, a, until] of d.subscriptions) put('INSERT OR REPLACE INTO subscriptions (reader_id, author_id, until) VALUES (?, ?, ?)', s, a, until);
        for (const [b, p] of d.purchases) put('INSERT OR IGNORE INTO purchases (buyer_id, post_id) VALUES (?, ?)', b, p);
        for (const r of d.reports) put('INSERT OR IGNORE INTO reports (post_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)', r.postId, r.userId, r.reason, r.createdAt);
        const p = d.pay;
        for (const [u, account] of Object.entries(p.accounts)) put('INSERT INTO pay_accounts (user_id, account) VALUES (?, ?)', u, account);
        for (const [u, sub] of Object.entries(p.plans)) put('INSERT INTO pay_plans (user_id, subscription) VALUES (?, ?)', u, sub);
        for (const [u, subs] of Object.entries(p.packs)) for (const sub of subs) put('INSERT OR IGNORE INTO pay_packs (user_id, subscription) VALUES (?, ?)', u, sub);
        for (const [k, sub] of Object.entries(p.readers)) {
          const [reader, author] = k.split(':');
          put('INSERT OR IGNORE INTO pay_readers (reader_id, author_id, subscription) VALUES (?, ?, ?)', reader, author, sub);
        }
        for (const s of p.sessions) put('INSERT OR IGNORE INTO pay_sessions (id) VALUES (?)', s);
        // the log's buyers that are gone stay as rows without whose they were (the foreign key sets none)
        for (const r of p.log) this.insertLog({ ...r, userId: r.userId && d.users.some((u) => u.id === r.userId) ? r.userId : undefined });
        for (const u of d.uploads) put('INSERT OR IGNORE INTO uploads (key, upload_id, user_id, size, created_at) VALUES (?, ?, ?, ?, ?)', u.key, u.uploadId, u.userId, u.size, u.createdAt);
        for (const l of d.later) put('INSERT INTO later (url, at) VALUES (?, ?)', l.url, l.at);
        // what names someone or something not there goes (until nothing does: a post's messages after it)
        for (let bad = this.all('PRAGMA foreign_key_check'); bad.length; bad = this.all('PRAGMA foreign_key_check'))
          for (const b of bad) {
            this.db.prepare(`DELETE FROM "${b.table}" WHERE rowid = ?`).run(b.rowid);
            skipped++;
          }
        if (skipped) console.warn(`store: ${skipped} rows left out (doubles, or naming someone or something no longer there)`);
        this.db.exec(`PRAGMA user_version = ${VERSION}`);
        return true;
      });
    } finally {
      this.db.exec('PRAGMA foreign_keys = ON');
    }
  }

  /** An older schema brought up to VERSION, a step a version, each in one transaction. */
  private migrate() {
    if (this.version() < 2)
      this.tx(() => {
        // asked again inside the lock: two servers starting at once (a dev restart) must not both migrate
        if (this.version() >= 2) return;
        // usernames: everyone gets one made from their display name, in the order they came (the demo
        // people first: @joose, @aino, …); a name taken or reserved gets digits after it
        this.db.exec("ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT '' COLLATE NOCASE");
        const taken = new Set<string>();
        for (const u of this.all('SELECT id, name FROM users ORDER BY n')) {
          const username = usernameFrom(u.name as string, (x) => !taken.has(x));
          taken.add(username);
          this.run('UPDATE users SET username = ? WHERE id = ?', username, u.id);
        }
        this.db.exec(`CREATE UNIQUE INDEX users_username ON users (username);\n${RELEASED}`);
        this.db.exec('PRAGMA user_version = 2');
        console.log(`store: usernames given to ${taken.size} people (schema version 2)`);
      });
    if (this.version() < 3)
      this.tx(() => {
        if (this.version() >= 3) return;
        // interests: the tables, and the public posts there are get their topics read from their words
        // (no one chose any then); no one has interests yet, and no one is asked after the fact
        this.db.exec(INTERESTS);
        const posts = this.all("SELECT id, title, body FROM posts WHERE audience = 'public' ORDER BY n");
        for (const p of posts) this.putTopics(p.id as string, postTopics(undefined, p.title as string, p.body as string));
        this.db.exec('PRAGMA user_version = 3');
        console.log(`store: topics read for ${posts.length} public posts (schema version 3)`);
      });
    if (this.version() < 4)
      this.tx(() => {
        if (this.version() >= 4) return;
        this.db.exec(STRIPE_EVENTS);
        this.db.exec('PRAGMA user_version = 4');
        console.log('store: a table for Stripe webhook events (schema version 4)');
      });
    if (this.version() < 5)
      this.tx(() => {
        if (this.version() >= 5) return;
        // email: the accounts there were count as verified now (they signed up before there was any
        // checking); everyone new confirms their address
        this.db.exec('ALTER TABLE accounts ADD COLUMN verified_at INTEGER; ALTER TABLE accounts ADD COLUMN invite_code TEXT;');
        const n = this.run('UPDATE accounts SET verified_at = ?', Date.now()).changes;
        this.db.exec(EMAIL_TOKENS);
        this.db.exec('PRAGMA user_version = 5');
        console.log(`store: email verification, ${n} accounts counted as verified (schema version 5)`);
      });
    if (this.version() < 6)
      this.tx(() => {
        if (this.version() >= 6) return;
        // moderation: no post is restricted, no one suspended, nothing decided yet
        this.db.exec('ALTER TABLE posts ADD COLUMN restricted INTEGER NOT NULL DEFAULT 0');
        this.db.exec(MODERATION);
        // the report reason 'intimate' is 'sexual' now: intimate content (one's private life) is allowed, sexual content is not
        this.run("UPDATE reports SET reason = 'sexual' WHERE reason = 'intimate'");
        this.db.exec('PRAGMA user_version = 6');
        console.log('store: moderation (decisions, complaints, suspensions, notices, the log) (schema version 6)');
      });
    if (this.version() < 7) {
      // groups: the tables, and the posts table rebuilt with its group_id and the audience 'group' (SQLite
      // cannot change a CHECK in place: a new table, the rows copied, the old one dropped, the new one
      // renamed, its indexes made again). The other tables' foreign keys name "posts" and hold again once
      // it is renamed; they are checked before the commit. A pragma that cannot change inside a transaction.
      this.db.exec('PRAGMA foreign_keys = OFF');
      try {
        this.tx(() => {
          if (this.version() >= 7) return;
          this.db.exec(GROUPS);
          this.db.exec(POSTS('posts_v7'));
          const copied = this.db.prepare(`INSERT INTO posts_v7 (${POST_COLUMNS_6}) SELECT ${POST_COLUMNS_6} FROM posts ORDER BY n`).run().changes;
          this.db.exec(`DROP TABLE posts; ALTER TABLE posts_v7 RENAME TO posts;\n${POST_INDEXES}`);
          const broken = this.all('PRAGMA foreign_key_check');
          if (broken.length) throw new Error(`store: version 7 would leave ${broken.length} rows naming what is not there`);
          this.db.exec('PRAGMA user_version = 7');
          console.log(`store: groups, ${copied} posts carried over (schema version 7)`);
        });
      } finally {
        this.db.exec('PRAGMA foreign_keys = ON');
      }
    }
  }

  /** A post's topics, in place of any it had. */
  private putTopics(postId: string, topics: PostTopic[]) {
    this.run('DELETE FROM post_topics WHERE post_id = ?', postId);
    for (const t of topics) this.run('INSERT INTO post_topics (post_id, topic, how) VALUES (?, ?, ?)', postId, t.id, t.how);
  }

  /** A post in, with its topics if it is public: `chosen` by its author, or (none) read from its words. */
  private insertPost(p: Post, chosen?: TopicId[]) {
    this.tx(() => {
      this.insertPostRow(p);
      if (p.audience === 'public') this.putTopics(p.id, postTopics(chosen, p.title, p.body ?? ''));
    });
  }

  private insertPostRow(p: Post) {
    this.run(
      'INSERT INTO posts (id, author_id, kind, title, body, video_url, image_url, pictures, audience, chosen, group_id, paid, price, hidden, expires_at, archived, size, video_size, duration, letter, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      p.id, p.authorId, p.kind, p.title, p.body ?? '', p.videoUrl, p.imageUrl, p.pictures ? JSON.stringify(p.pictures) : null,
      Array.isArray(p.audience) ? 'chosen' : p.audience, Array.isArray(p.audience) ? JSON.stringify(p.audience) : null, p.audience === 'group' ? p.groupId : null,
      !!p.paid, p.price, !!p.hidden, p.expiresAt, !!p.archived, p.size, p.videoSize, p.duration, !!p.letter, p.createdAt,
    );
  }

  private insertLog(r: LogRow) {
    this.run(
      'INSERT INTO purchase_log (id, user_id, kind, item, amount, session, subscription, payment, consent_at, created_at, withdrawn_at, refunded, refunded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      r.id, r.userId, r.kind, r.item, r.amount, r.session, r.subscription, r.payment, r.consentAt, r.createdAt, r.withdrawnAt, r.refunded, r.refundedAt,
    );
  }

  // ---------------- accounts and sessions ----------------

  /** The account with this email (already normalised), and whose it is. */
  account(email: string) {
    const r = this.get('SELECT * FROM accounts WHERE email = ?', email);
    return r && { userId: r.user_id as string, ...toAccount(r) };
  }

  /** The user with this username (a leading @ and any case are fine). */
  byUsername(username: string) {
    const r = this.get('SELECT * FROM users WHERE username = ?', normalUsername(username));
    return r && toUser(r);
  }

  /** Why this username (normalised) cannot be had by `userId` (none: by someone new), or nothing:
   * against the rule, someone else's, or changed away from lately by someone else (held for them). */
  usernameRefused(username: string, userId?: string): UsernameReason | undefined {
    const problem = usernameProblem(username);
    if (problem) return problem;
    const since = Date.now() - USERNAME_HOLD_DAYS * 24 * 60 * 60 * 1000;
    const held = this.get(
      'SELECT 1 FROM users WHERE username = ?1 AND id IS NOT ?2 UNION ALL SELECT 1 FROM released_usernames WHERE username = ?1 AND user_id IS NOT ?2 AND released_at > ?3',
      username, userId, since,
    );
    return held ? 'taken' : undefined;
  }

  /** A free username like this one (for the live check to offer), or nothing. */
  usernameLike(username: string, userId?: string) {
    return usernameFrom(username, (x) => !this.usernameRefused(x, userId));
  }

  /** A new user with an account (its email not yet verified), and the invite code they came with, if
   * one was asked. The caller has checked that the username and the email are free. */
  /** verified: the account counts as verified at once (D2M_MAIL=console: no email could confirm it). */
  signUp(name: string, username: string, email: string, password: string, inviteCode?: string, verified = false): User {
    const clean = name.trim().slice(0, 40);
    const user: User = { id: id(), name: clean, username, color: colorFor(clean) };
    this.tx(() => {
      this.run('INSERT INTO users (id, name, name_key, username, color) VALUES (?, ?, ?, ?, ?)', user.id, user.name, user.name.toLowerCase(), username, user.color);
      this.run('INSERT INTO accounts (user_id, email, password, created_at, terms_at, invite_code, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)', user.id, email, password, Date.now(), Date.now(), inviteCode, verified ? Date.now() : null);
    });
    return user;
  }

  /** A new username (normalised), in one transaction: the old one is held for its owner for
   * USERNAME_HOLD_DAYS, and taking back one's own held name frees it. The reason it was refused, or nothing. */
  setUsername(userId: string, username: string): UsernameReason | undefined {
    return this.tx(() => {
      const old = this.user(userId)?.username;
      if (old === undefined || old === username) return undefined;
      const refused = this.usernameRefused(username, userId);
      if (refused) return refused;
      const now = Date.now();
      // the held names whose time is up go now and then: here
      this.run('DELETE FROM released_usernames WHERE released_at <= ? OR username = ?', now - USERNAME_HOLD_DAYS * 24 * 60 * 60 * 1000, username);
      this.run('INSERT OR REPLACE INTO released_usernames (username, user_id, released_at) VALUES (?, ?, ?)', old, userId, now);
      this.run('UPDATE users SET username = ? WHERE id = ?', username, userId);
      return undefined;
    });
  }

  addSession(hash: string, userId: string, days: number) {
    const now = Date.now();
    this.tx(() => {
      // the expired ones go whenever a new one comes
      this.run('DELETE FROM sessions WHERE expires_at <= ?', now);
      this.run('INSERT INTO sessions (hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', hash, userId, now, now + days * 24 * 60 * 60 * 1000);
    });
  }

  /** The user of a live session, by its token's hash. */
  sessionUser(hash: string) {
    const r = this.get('SELECT u.* FROM sessions x JOIN users u ON u.id = x.user_id WHERE x.hash = ?1 AND x.expires_at > ?2 AND NOT EXISTS (SELECT 1 FROM suspensions s WHERE s.user_id = x.user_id AND ' + SUSPENDED('?2') + ')', hash, Date.now());
    return r && toUser(r);
  }

  dropSession(hash: string) {
    this.run('DELETE FROM sessions WHERE hash = ?', hash);
  }

  // ---------------- links sent by email ----------------

  /** A new link of a kind for a user and an address, by its token's hash; the user's older ones of the
   * kind go (a new request invalidates them), and so do expired ones of anyone's. */
  addEmailToken(hash: string, userId: string, kind: 'verify' | 'reset', email: string, ms: number) {
    const now = Date.now();
    this.tx(() => {
      this.run('DELETE FROM email_tokens WHERE expires_at <= ? OR (user_id = ? AND kind = ?)', now, userId, kind);
      this.run('INSERT INTO email_tokens (hash, user_id, kind, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)', hash, userId, kind, email, now, now + ms);
    });
  }

  /** A link used: its row, once (it is deleted whether it is still valid or not); none when unknown or expired. */
  private takeEmailToken(hash: string, kind: 'verify' | 'reset') {
    const r = this.get('SELECT * FROM email_tokens WHERE hash = ? AND kind = ?', hash, kind);
    if (!r) return undefined;
    this.run('DELETE FROM email_tokens WHERE hash = ?', hash);
    if ((r.expires_at as number) <= Date.now()) return undefined;
    return { userId: r.user_id as string, email: r.email as string };
  }

  /** The address a user asked to change to and has not confirmed yet (a live link to it), if any. */
  pendingEmail(userId: string) {
    const r = this.get("SELECT e.email FROM email_tokens e JOIN accounts a ON a.user_id = e.user_id WHERE e.user_id = ? AND e.kind = 'verify' AND e.expires_at > ? AND e.email <> a.email ORDER BY e.created_at DESC LIMIT 1", userId, Date.now());
    return r?.email as string | undefined;
  }

  /** A verification link opened, in one transaction: its address confirmed. The account's own address is
   * marked verified; a new address replaces the old one (unless someone else has it by now: 'taken').
   * What happened, with whose it was and the address before; none for a link unknown, used or expired. */
  verifyEmail(hash: string): { userId: string; email: string; before: string; changed: boolean } | 'taken' | undefined {
    return this.tx(() => {
      const t = this.takeEmailToken(hash, 'verify');
      const account = t && this.authAccount(t.userId);
      if (!t || !account) return undefined;
      const changed = t.email !== account.email;
      if (changed && this.account(t.email)) return 'taken';
      this.run('UPDATE accounts SET email = ?, verified_at = ? WHERE user_id = ?', t.email, Date.now(), t.userId);
      return { userId: t.userId, email: t.email, before: account.email, changed };
    });
  }

  /** A password reset, in one transaction: the link used, the new password (scrypt) in, every session
   * of the user ended, and every other link of theirs gone (a pending email change too). Following the
   * link proved the address, so it counts as verified if it is still the account's. Whose it was; none
   * for a link unknown, used or expired. */
  resetPassword(hash: string, password: string) {
    return this.tx(() => {
      const t = this.takeEmailToken(hash, 'reset');
      const account = t && this.authAccount(t.userId);
      if (!t || !account) return undefined;
      this.run('UPDATE accounts SET password = ?, verified_at = CASE WHEN email = ? THEN coalesce(verified_at, ?) ELSE verified_at END WHERE user_id = ?', password, t.email, Date.now(), t.userId);
      this.run('DELETE FROM sessions WHERE user_id = ?', t.userId);
      this.run('DELETE FROM email_tokens WHERE user_id = ?', t.userId);
      return t.userId;
    });
  }

  /** Has the user confirmed their email address? */
  verified(userId: string) {
    return !!this.get('SELECT 1 FROM accounts WHERE user_id = ? AND verified_at IS NOT NULL', userId);
  }

  addUpload(u: Upload) {
    this.run('INSERT INTO uploads (key, upload_id, user_id, size, created_at) VALUES (?, ?, ?, ?, ?)', u.key, u.uploadId, u.userId, u.size, u.createdAt);
  }

  /** A user's own upload, by its key and upload id. */
  upload(userId: string, key: string, uploadId?: string) {
    const r = this.get('SELECT * FROM uploads WHERE user_id = ? AND key = ? AND (?3 IS NULL OR upload_id = ?3)', userId, key, uploadId);
    return r && toUpload(r);
  }

  uploadDone(key: string, size: number) {
    this.run('UPDATE uploads SET size = ? WHERE key = ?', size, key);
  }

  dropUpload(key: string) {
    this.run('DELETE FROM uploads WHERE key = ?', key);
  }

  /** Remove a file later, not now. */
  removeLater(url: string, inMs: number) {
    this.run('INSERT INTO later (url, at) VALUES (?, ?)', url, Date.now() + inMs);
  }

  /** The files whose time to go has come (taken off the list). */
  dueRemovals() {
    const now = Date.now();
    return this.tx(() => {
      const due = this.all('SELECT url FROM later WHERE at <= ? ORDER BY n', now).map((r) => r.url as string);
      if (due.length) this.run('DELETE FROM later WHERE at <= ?', now);
      return due;
    });
  }

  /** Uploads never put into a post, older than this. */
  staleUploads(olderThan: number) {
    return this.all('SELECT * FROM uploads WHERE created_at < ?', Date.now() - olderThan).map(toUpload);
  }

  // ---------------- Stripe's side ----------------

  /** An author's Stripe account for being paid. */
  payAccount(userId: string) {
    return (this.get('SELECT account FROM pay_accounts WHERE user_id = ?', userId)?.account as string | undefined) ?? undefined;
  }

  setPayAccount(userId: string, account: string) {
    this.run('INSERT INTO pay_accounts (user_id, account) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET account = excluded.account', userId, account);
  }

  /** The Stripe subscription of a user's plan. */
  planSubscription(userId: string) {
    return (this.get('SELECT subscription FROM pay_plans WHERE user_id = ?', userId)?.subscription as string | undefined) ?? undefined;
  }

  /** A user's storage pack subscriptions. */
  packSubscriptions(userId: string) {
    return this.all('SELECT subscription FROM pay_packs WHERE user_id = ? ORDER BY rowid', userId).map((r) => r.subscription as string);
  }

  /** A reader's Stripe subscription to an author. */
  readerSubscription(readerId: string, authorId: string) {
    return (this.get('SELECT subscription FROM pay_readers WHERE reader_id = ? AND author_id = ?', readerId, authorId)?.subscription as string | undefined) ?? undefined;
  }

  /** The Stripe subscriptions of one author's readers, or of one reader's to authors. */
  readerSubscriptions(who: { author?: string; reader?: string }) {
    return this.all('SELECT subscription FROM pay_readers WHERE author_id = ? OR reader_id = ?', who.author, who.reader).map((r) => r.subscription as string);
  }

  /** Has this Checkout session been granted already? */
  granted(sessionId: string) {
    return !!this.get('SELECT 1 FROM pay_sessions WHERE id = ?', sessionId);
  }

  /** A paid Checkout session granted, once, in one transaction: the session taken, the purchase into
   * the log, its Stripe subscription kept, and what it paid for given. False: it was granted already. */
  grant(sessionId: string, userId: string, what: Purchase, paid: { amount: number; subscription?: string; payment?: string; consentAt?: number }) {
    return this.tx(() => {
      if (this.run('INSERT OR IGNORE INTO pay_sessions (id) VALUES (?)', sessionId).changes === 0) return false;
      const { subscription } = paid;
      const item = what.kind === 'plan' ? what.plan : what.kind === 'pack' ? what.space : what.kind === 'author' ? what.authorId : what.postId;
      this.logPurchase({ userId, kind: what.kind, item, amount: paid.amount, session: sessionId, subscription, payment: paid.payment, consentAt: paid.consentAt });
      if (what.kind === 'plan') {
        if (subscription) this.run('INSERT OR REPLACE INTO pay_plans (user_id, subscription) VALUES (?, ?)', userId, subscription);
        this.setPlan(userId, what.plan);
      } else if (what.kind === 'pack') {
        if (subscription) this.run('INSERT OR IGNORE INTO pay_packs (user_id, subscription) VALUES (?, ?)', userId, subscription);
        this.buyPack(userId, what.space);
      } else if (what.kind === 'author') {
        // (an author gone meanwhile: the log has the payment, there is nothing to subscribe to)
        if (this.user(what.authorId)) {
          if (subscription) this.run('INSERT OR REPLACE INTO pay_readers (reader_id, author_id, subscription) VALUES (?, ?, ?)', userId, what.authorId, subscription);
          this.subscribe(userId, what.authorId);
        }
      } else this.buy(userId, what.postId);
      return true;
    });
  }

  /** Take a webhook event to apply: false if it was applied (or is being applied) already. Old ones go. */
  claimEvent(eventId: string, type: string, now = Date.now()) {
    return this.tx(() => {
      this.run('DELETE FROM stripe_events WHERE at < ?', now - STRIPE_EVENT_DAYS * 24 * 60 * 60 * 1000);
      return this.run('INSERT OR IGNORE INTO stripe_events (id, type, at) VALUES (?, ?, ?)', eventId, type, now).changes === 1;
    });
  }

  /** An event that could not be applied is let go, so Stripe's next try applies it. */
  releaseEvent(eventId: string) {
    this.run('DELETE FROM stripe_events WHERE id = ?', eventId);
  }

  /** What a Stripe subscription is in D2M: a user's plan, one of their storage packs, or a reader's
   * subscription to an author (none: not one D2M keeps, or it ended here already). */
  subscriptionOf(subscription: string):
    | { kind: 'plan'; userId: string }
    | { kind: 'pack'; userId: string }
    | { kind: 'author'; readerId: string; authorId: string }
    | undefined {
    const plan = this.get('SELECT user_id FROM pay_plans WHERE subscription = ?', subscription);
    if (plan) return { kind: 'plan', userId: plan.user_id as string };
    const pack = this.get('SELECT user_id FROM pay_packs WHERE subscription = ?', subscription);
    if (pack) return { kind: 'pack', userId: pack.user_id as string };
    const reader = this.get('SELECT reader_id, author_id FROM pay_readers WHERE subscription = ?', subscription);
    if (reader) return { kind: 'author', readerId: reader.reader_id as string, authorId: reader.author_id as string };
  }

  /** A storage pack whose Stripe subscription ended there: one fewer, once (its space from the purchase
   * that bought it; a pack bought before the log knew it, a video pack). */
  packEnded(userId: string, subscription: string) {
    this.tx(() => {
      if (this.run('DELETE FROM pay_packs WHERE user_id = ? AND subscription = ?', userId, subscription).changes === 0) return;
      const space = this.get("SELECT item FROM purchase_log WHERE kind = 'pack' AND subscription = ? ORDER BY n DESC", subscription)?.item;
      this.dropPack(userId, space === 'media' ? 'media' : 'video');
    });
  }

  /** A reader's subscription set at Stripe to end (`until`, ms) or to go on after all (null). */
  readerEnds(readerId: string, authorId: string, until: number | null) {
    this.run('UPDATE subscriptions SET until = ? WHERE reader_id = ? AND author_id = ?', until, readerId, authorId);
  }

  /** A cheap read of the database (the health check). */
  ping() {
    return this.get('SELECT count(*) AS n FROM (SELECT 1 FROM users LIMIT 1)')?.n !== undefined;
  }

  /** A purchase into the log. */
  logPurchase(row: Omit<LogRow, 'id' | 'createdAt'>) {
    const r: LogRow = { id: id(), createdAt: Date.now(), ...row };
    this.insertLog(r);
    return r;
  }

  /** A user's purchases, oldest first. */
  purchaseLog(userId: string) {
    return this.all('SELECT * FROM purchase_log WHERE user_id = ? ORDER BY n', userId).map(toLogRow);
  }

  /** One purchase of a user's. */
  logRow(rowId: string, userId: string) {
    const r = this.get('SELECT * FROM purchase_log WHERE id = ? AND user_id = ?', rowId, userId);
    return r && toLogRow(r);
  }

  /** A post's purchases since then not yet refunded. */
  refundable(postId: string, since: number) {
    return this.all("SELECT * FROM purchase_log WHERE kind = 'post' AND item = ? AND created_at > ? AND refunded_at IS NULL ORDER BY n", postId, since).map(toLogRow);
  }

  /** A purchase refunded (cents). */
  refunded(rowId: string, cents: number) {
    this.run('UPDATE purchase_log SET refunded = ?, refunded_at = ? WHERE id = ?', cents, Date.now(), rowId);
  }

  /** A monthly contract withdrawn from (Stripe's side done: `refunded` cents back), in one transaction:
   * marked in the log, and it ends here. A plan goes back to Lite; a pack, or a subscription to an
   * author, ends with its Stripe id. */
  withdrawn(rowId: string, refunded: number) {
    this.tx(() => {
      const row = this.get('SELECT * FROM purchase_log WHERE id = ?', rowId);
      if (!row) return;
      const r = toLogRow(row);
      this.run('UPDATE purchase_log SET withdrawn_at = ?, refunded = ? WHERE id = ?', Date.now(), refunded, rowId);
      if (!r.userId || !r.item) return;
      if (r.kind === 'plan') this.setPlan(r.userId, 'lite');
      else if (r.kind === 'pack') {
        this.run('DELETE FROM pay_packs WHERE user_id = ? AND subscription = ?', r.userId, r.subscription);
        this.dropPack(r.userId, r.item as Space);
      } else if (r.kind === 'author') this.unsubscribe(r.userId, r.item);
    });
  }

  /** A user's sign-in account (to check their password again). */
  authAccount(userId: string): Account | undefined {
    const r = this.get('SELECT * FROM accounts WHERE user_id = ?', userId);
    return r && toAccount(r);
  }

  users() {
    return this.all('SELECT * FROM users ORDER BY n').map(toUser);
  }

  user(userId: string) {
    const r = this.get('SELECT * FROM users WHERE id = ?', userId);
    return r && toUser(r);
  }

  friendsOf(userId: string): User[] {
    return this.all('SELECT * FROM users WHERE id IN (SELECT b FROM friends WHERE a = ?1 UNION SELECT a FROM friends WHERE b = ?1) ORDER BY n', userId).map(toUser);
  }

  areFriends(a: string, b: string) {
    return !!this.get('SELECT 1 FROM friends WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)', a, b);
  }

  befriend(a: string, b: string) {
    if (a !== b && !this.areFriends(a, b)) this.run('INSERT INTO friends (a, b) VALUES (?, ?)', a, b);
  }

  /** Can this user see this post? The author (archived posts too); while it is live, anyone for a public
   * post, a group's post as the group allows (seesGroup), or a friend it was written for. */
  canSee(userId: string, post: Post) {
    if (post.authorId === userId) return true;
    if (!isLive(post)) return false;
    // restricted by a moderator, or its author suspended: its author's alone
    if (post.restricted || this.suspension(post.authorId)) return false;
    if (post.audience === 'public') return true;
    // a group's: its members (a friend group), or everyone signed in (an interest group)
    if (post.audience === 'group') return !!post.groupId && this.seesGroup(userId, post.groupId);
    if (!this.areFriends(userId, post.authorId)) return false;
    return post.audience === 'friends' || post.audience.includes(userId);
  }

  /** Can this user read it whole and talk under it? A paid post: the author, and its subscribers
   * (Unlimited) or those who bought it (Exclusive). */
  canRead(userId: string, post: Post) {
    if (!this.canSee(userId, post)) return false;
    if (!post.paid || post.authorId === userId) return true;
    return post.price ? this.bought(userId, post.id) : this.subscribed(userId, post.authorId);
  }

  bought(userId: string, postId: string) {
    return !!this.get('SELECT 1 FROM purchases WHERE buyer_id = ? AND post_id = ?', userId, postId);
  }

  /** Buy an Exclusive post (the prototype charges nothing). */
  buy(userId: string, postId: string) {
    // (a post deleted meanwhile is not bought)
    this.run('INSERT OR IGNORE INTO purchases (buyer_id, post_id) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM posts WHERE id = ?2)', userId, postId);
  }

  /** How many have bought this post. */
  buyers(postId: string) {
    return this.get('SELECT count(*) AS c FROM purchases WHERE post_id = ?', postId)!.c as number;
  }

  /** Subscribed now: a cancelled subscription stays open until the end of the period paid for. */
  subscribed(userId: string, authorId: string, now = Date.now()) {
    return !!this.get('SELECT 1 FROM subscriptions WHERE reader_id = ? AND author_id = ? AND (until IS NULL OR until > ?)', userId, authorId, now);
  }

  /** When a cancelled subscription closes (none: it goes on). */
  subscribedUntil(userId: string, authorId: string) {
    return (this.get('SELECT until FROM subscriptions WHERE reader_id = ? AND author_id = ?', userId, authorId)?.until as number | null | undefined) ?? undefined;
  }

  subscribe(userId: string, authorId: string) {
    if (userId !== authorId && !this.subscribed(userId, authorId))
      this.run('INSERT INTO subscriptions (reader_id, author_id) VALUES (?, ?) ON CONFLICT DO UPDATE SET until = NULL', userId, authorId);
  }

  /** A reader ends a subscription: open until `until` (the period paid for), or gone at once, its
   * Stripe id with it. */
  unsubscribe(userId: string, authorId: string, until?: number) {
    this.tx(() => {
      if (until) this.run('UPDATE subscriptions SET until = ? WHERE reader_id = ? AND author_id = ?', until, userId, authorId);
      else {
        this.run('DELETE FROM subscriptions WHERE reader_id = ? AND author_id = ?', userId, authorId);
        this.run('DELETE FROM pay_readers WHERE reader_id = ? AND author_id = ?', userId, authorId);
      }
    });
  }

  /** An author stops selling: every reader's subscription to them ends, and its Stripe id goes (the
   * caller has cancelled them at Stripe). */
  dropSubscribers(authorId: string) {
    this.tx(() => {
      this.run('DELETE FROM subscriptions WHERE author_id = ?', authorId);
      this.run('DELETE FROM pay_readers WHERE author_id = ?', authorId);
    });
  }

  subscribers(authorId: string) {
    return this.get('SELECT count(*) AS c FROM subscriptions WHERE author_id = ?', authorId)!.c as number;
  }

  /** Set the monthly price of one's subscription, in cents (0: none). */
  setPrice(userId: string, cents: number) {
    this.run('UPDATE users SET price = ? WHERE id = ?', cents > 0 ? cents : null, userId);
  }

  /** A reader reports a post (sexual content is not allowed anywhere). Enough reports hide it from For You. */
  report(postId: string, userId: string, reason: string) {
    this.tx(() => {
      if (!this.post(postId)) return;
      if (this.run('INSERT OR IGNORE INTO reports (post_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)', postId, userId, reason.slice(0, 200), Date.now()).changes === 0) return;
      if ((this.get('SELECT count(*) AS c FROM reports WHERE post_id = ?', postId)!.c as number) >= HIDE_AFTER_REPORTS) this.run('UPDATE posts SET hidden = 1 WHERE id = ?', postId);
    });
  }

  // ---------------- moderation ----------------
  // Every decision is a person's (a moderator's), with a written reason; each is kept as a record
  // (never the content) and goes into the log with who made it.

  /** The suspension in force on a user, if any. */
  suspension(userId: string, now = Date.now()) {
    const r = this.get(`SELECT * FROM suspensions s WHERE user_id = ?1 AND ${SUSPENDED('?2')}`, userId, now);
    if (!r) return undefined;
    return { decisionId: r.decision_id as string, rule: isRule(r.rule) ? r.rule : undefined, reason: r.reason as string, until: r.until as number | null, since: r.created_at as number };
  }

  private logAction(by: Moderator, action: string, target: string, decisionId: string | undefined, reason: string) {
    this.run('INSERT INTO mod_log (at, moderator_id, moderator, action, target, decision_id, reason) VALUES (?, ?, ?, ?, ?, ?, ?)', Date.now(), by.id, by.username, action, target, decisionId, reason);
  }

  private addDecision(d: Omit<Decision, 'id' | 'createdAt'>, moderatorId: string | null): Decision {
    const decision: Decision = { ...d, id: id(), createdAt: Date.now() };
    this.run(
      'INSERT INTO mod_decisions (id, action, post_id, post_title, user_id, username, rule, reason, facts, until, moderator_id, moderator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      decision.id, d.action, d.postId, d.postTitle, d.userId, d.username, d.rule, d.reason, JSON.stringify(d.facts), d.until, moderatorId, d.moderator, decision.createdAt,
    );
    return decision;
  }

  /** The open reports by reason (most first), and the open notices by rule, of one post or of all of an author's. */
  private openCounts(where: { post?: string; author?: string }) {
    const sel = where.post ? 'post_id = ?' : 'post_id IN (SELECT id FROM posts WHERE author_id = ?)';
    const arg = where.post ?? where.author;
    const reports: Record<string, number> = {};
    for (const r of this.all(`SELECT reason, count(*) AS c FROM reports WHERE ${sel} GROUP BY reason ORDER BY c DESC, reason`, arg)) reports[r.reason as string] = r.c as number;
    const notices: Record<string, number> = {};
    for (const r of this.all(`SELECT reason, count(*) AS c FROM mod_notices WHERE decided_at IS NULL AND ${sel} GROUP BY reason ORDER BY c DESC, reason`, arg)) notices[r.reason as string] = r.c as number;
    return { reports, notices };
  }

  /** A moderator's decision on a post, in one transaction: kept as a record with the facts it was based
   * on (the open reports and notices, and whether it was off For You), the reports cleared and the
   * notices answered, and then: 'keep' puts it back on For You; 'remove' deletes it as deletePost does
   * (its files once committed; no refund here: the caller decides); 'restrict' leaves it to its author
   * alone; 'lift' ends a restriction. Into the log. The decision, the reporters (ids, to tell them) and
   * the notices it answered (with their senders' addresses); none for a post not there. */
  decidePost(postId: string, action: PostAction, by: Moderator, rule: Rule | undefined, reason: string) {
    return this.tx(() => {
      const post = this.post(postId);
      if (!post) return undefined;
      const author = this.user(post.authorId);
      const facts: Facts = { ...this.openCounts({ post: postId }), hidden: !!post.hidden };
      const reporters = this.all('SELECT user_id FROM reports WHERE post_id = ? ORDER BY created_at', postId).map((r) => r.user_id as string);
      const notices = this.all('SELECT * FROM mod_notices WHERE post_id = ? AND decided_at IS NULL ORDER BY n', postId).map((r) => ({ ...toNotice(r), email: r.email as string }));
      const restricting = action === 'remove' || action === 'restrict';
      const decision = this.addDecision({ action, postId, postTitle: post.title, userId: post.authorId, username: author?.username, rule: restricting ? rule : undefined, reason, facts, moderator: by.username }, by.id);
      this.run('UPDATE mod_notices SET decided_at = ?, decision_id = ? WHERE post_id = ? AND decided_at IS NULL', decision.createdAt, decision.id, postId);
      this.run('DELETE FROM reports WHERE post_id = ?', postId);
      if (action === 'remove') this.deletePost(postId);
      else if (action === 'restrict') this.run('UPDATE posts SET restricted = 1, hidden = 0 WHERE id = ?', postId);
      else if (action === 'lift') this.run('UPDATE posts SET restricted = 0, hidden = 0 WHERE id = ?', postId);
      else this.run('UPDATE posts SET hidden = 0 WHERE id = ?', postId);
      this.logAction(by, action, `post ${postId} "${post.title}" by @${author?.username ?? '?'}`, decision.id, reason);
      return { decision, reporters, notices };
    });
  }

  /** A suspension, in one transaction: the decision kept (its facts: the open reports and notices on
   * their posts, and the decisions that restricted them before), the suspension in force until `until`
   * (null: until lifted), and every session of theirs ended. Into the log. None: no such user. */
  suspend(userId: string, by: Moderator, rule: Rule, reason: string, until: number | null) {
    return this.tx(() => {
      const user = this.user(userId);
      if (!user) return undefined;
      const earlier = this.get("SELECT count(*) AS c FROM mod_decisions WHERE user_id = ? AND action IN ('remove', 'restrict', 'suspend') AND reversed_at IS NULL", userId)!.c as number;
      const facts: Facts = { ...this.openCounts({ author: userId }), hidden: false, earlier };
      const decision = this.addDecision({ action: 'suspend', userId, username: user.username, rule, reason, facts, until, moderator: by.username }, by.id);
      this.run('INSERT OR REPLACE INTO suspensions (user_id, decision_id, rule, reason, until, created_at) VALUES (?, ?, ?, ?, ?, ?)', userId, decision.id, rule, reason, until, decision.createdAt);
      this.run('DELETE FROM sessions WHERE user_id = ?', userId);
      this.logAction(by, 'suspend', `@${user.username}${until ? ` until ${new Date(until).toISOString()}` : ''}`, decision.id, reason);
      return decision;
    });
  }

  /** A suspension lifted by a moderator, in one transaction: a decision of its own, and into the log. None: not suspended. */
  unsuspend(userId: string, by: Moderator, reason: string) {
    return this.tx(() => {
      const user = this.user(userId);
      if (!user || !this.suspension(userId)) return undefined;
      this.run('DELETE FROM suspensions WHERE user_id = ?', userId);
      const decision = this.addDecision({ action: 'unsuspend', userId, username: user.username, reason, facts: { reports: {}, notices: {}, hidden: false }, moderator: by.username }, by.id);
      this.logAction(by, 'unsuspend', `@${user.username}`, decision.id, reason);
      return decision;
    });
  }

  /** The people suspended now, the newest first. */
  suspendedList(now = Date.now()): Suspension[] {
    return this.all(`SELECT s.*, u.id AS uid FROM suspensions s JOIN users u ON u.id = s.user_id WHERE ${SUSPENDED('?')} ORDER BY s.created_at DESC`, now).flatMap((r) => {
      const user = this.user(r.uid as string);
      return user ? [{ user, rule: isRule(r.rule) ? r.rule : undefined, reason: r.reason as string, until: r.until as number | null, since: r.created_at as number, decisionId: r.decision_id as string }] : [];
    });
  }

  /** A decision's record, with the complaint about it if there is one. */
  decision(decisionId: string): Decision | undefined {
    const r = this.get('SELECT * FROM mod_decisions WHERE id = ?', decisionId);
    return r && this.withComplaint(toDecision(r));
  }

  private withComplaint(d: Decision): Decision {
    const c = this.get('SELECT * FROM mod_complaints WHERE decision_id = ?', d.id);
    return c ? { ...d, complaint: toComplaint(c) } : d;
  }

  /** The decisions kept about a post or a person, newest first. */
  decisionsAbout(postId: string | undefined, userId: string | undefined, limit = 20): Decision[] {
    return this.all('SELECT * FROM mod_decisions WHERE post_id = ? OR user_id = ? ORDER BY n DESC LIMIT ?', postId, userId, limit).map((r) => this.withComplaint(toDecision(r)));
  }

  /** The link to complain with, by its token's hash (until the time to complain is up). */
  addModToken(hash: string, decisionId: string, expiresAt: number) {
    this.run('INSERT INTO mod_tokens (hash, decision_id, expires_at) VALUES (?, ?, ?)', hash, decisionId, expiresAt);
  }

  /** Is this a live link to complain about this decision (unused, not expired)? */
  validModToken(hash: string, decisionId: string) {
    return !!this.get('SELECT 1 FROM mod_tokens WHERE hash = ? AND decision_id = ? AND expires_at > ?', hash, decisionId, Date.now());
  }

  /** A complaint about a decision, once, in one transaction; every link to complain about the decision
   * is used up with it. The caller has checked who may complain and whether there is still time. None:
   * the link (if one was given) was not valid, or there is a complaint already. */
  complain(decisionId: string, text: string, email: string, tokenHash?: string): Complaint | undefined {
    return this.tx(() => {
      if (tokenHash && !this.validModToken(tokenHash, decisionId)) return undefined;
      if (this.get('SELECT 1 FROM mod_complaints WHERE decision_id = ?', decisionId)) return undefined;
      this.run('DELETE FROM mod_tokens WHERE decision_id = ?', decisionId);
      const c: Complaint = { id: id(), decisionId, text: text.trim().slice(0, 4000), createdAt: Date.now() };
      this.run('INSERT INTO mod_complaints (id, decision_id, text, email, created_at) VALUES (?, ?, ?, ?, ?)', c.id, decisionId, c.text, email, c.createdAt);
      return c;
    });
  }

  /** A complaint decided by a moderator, in one transaction: 'upheld' keeps the decision; 'reversed'
   * undoes what can be undone (a restriction lifted, the suspension it made ended; a removed post's
   * content is gone and cannot come back) and marks the decision reversed. Into the log. The complaint
   * with its address, and the decision; none for a complaint not open. */
  decideComplaint(complaintId: string, by: Moderator, outcome: 'upheld' | 'reversed', answer: string) {
    return this.tx(() => {
      const r = this.get('SELECT * FROM mod_complaints WHERE id = ? AND decided_at IS NULL', complaintId);
      const d = r && this.decision(r.decision_id as string);
      if (!r || !d) return undefined;
      const now = Date.now();
      this.run('UPDATE mod_complaints SET decided_at = ?, outcome = ?, answer = ?, moderator_id = ? WHERE id = ?', now, outcome, answer, by.id, complaintId);
      if (outcome === 'reversed') {
        this.run('UPDATE mod_decisions SET reversed_at = ? WHERE id = ?', now, d.id);
        if (d.action === 'restrict' && d.postId) this.run('UPDATE posts SET restricted = 0 WHERE id = ?', d.postId);
        if (d.action === 'suspend' && d.userId) this.run('DELETE FROM suspensions WHERE user_id = ? AND decision_id = ?', d.userId, d.id);
      }
      const what = d.postId ? `post ${d.postId} "${d.postTitle ?? ''}" by @${d.username ?? '?'}` : `@${d.username ?? '?'}`;
      this.logAction(by, `complaint ${outcome}`, `${d.action}: ${what}`, d.id, answer);
      return { complaint: { ...toComplaint(r), decidedAt: now, outcome, answer }, email: r.email as string, decision: this.decision(d.id)! };
    });
  }

  /** A notice from someone without an account. */
  addNotice(email: string, url: string, reason: Rule, explanation: string, postId?: string): Notice {
    const n: Notice = { id: id(), url, reason, explanation, createdAt: Date.now(), ...(postId ? { postId } : {}) };
    this.run('INSERT INTO mod_notices (id, email, url, post_id, reason, explanation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', n.id, email, url, postId, reason, explanation, n.createdAt);
    return n;
  }

  /** A notice answered without a decision on a post here (the address is not one, or the post is gone):
   * into the log. The notice with its sender's address; none for a notice not open. */
  closeNotice(noticeId: string, by: Moderator, reason: string) {
    return this.tx(() => {
      const r = this.get('SELECT * FROM mod_notices WHERE id = ? AND decided_at IS NULL', noticeId);
      if (!r) return undefined;
      this.run('UPDATE mod_notices SET decided_at = ? WHERE id = ?', Date.now(), noticeId);
      this.logAction(by, 'notice closed', r.url as string, undefined, reason);
      return { ...toNotice(r), email: r.email as string };
    });
  }

  /** The moderation queue: posts with open reports or notices, the most first (each with the post itself,
   * its author, the open reports by reason, the notices and the decisions before); notices about no post
   * here; open complaints with their decisions; and the people suspended now. */
  modQueue(): ModQueue {
    const rows = this.all(
      `SELECT post_id, sum(c) AS c, min(at) AS since FROM (
         SELECT post_id, count(*) AS c, min(created_at) AS at FROM reports GROUP BY post_id
         UNION ALL SELECT post_id, count(*) AS c, min(created_at) AS at FROM mod_notices WHERE decided_at IS NULL AND post_id IS NOT NULL GROUP BY post_id
       ) GROUP BY post_id ORDER BY c DESC, since`,
    );
    const posts: QueueItem[] = rows.flatMap((r) => {
      const post = this.post(r.post_id as string);
      const author = post && this.user(post.authorId);
      if (!post || !author) return [];
      const notices = this.all('SELECT * FROM mod_notices WHERE post_id = ? AND decided_at IS NULL ORDER BY n', post.id).map(toNotice);
      return [{ post, author, reports: this.openCounts({ post: post.id }).reports, notices, since: r.since as number, history: this.decisionsAbout(post.id, author.id) }];
    });
    const notices = this.all('SELECT * FROM mod_notices WHERE decided_at IS NULL AND post_id IS NULL ORDER BY n').map(toNotice);
    const complaints = this.all('SELECT * FROM mod_complaints WHERE decided_at IS NULL ORDER BY n').flatMap((r) => {
      const decision = this.decision(r.decision_id as string);
      return decision ? [{ ...toComplaint(r), decision }] : [];
    });
    return { posts, notices, complaints, suspended: this.suspendedList() };
  }

  /** The moderation log, newest first. */
  modLog(limit = 500): LogEntry[] {
    return this.all('SELECT * FROM mod_log ORDER BY n DESC LIMIT ?', limit).map((r) => {
      const e: LogEntry = { at: r.at as number, moderator: r.moderator as string, action: r.action as string, target: r.target as string, reason: r.reason as string };
      if (r.decision_id !== null) e.decisionId = r.decision_id as string;
      return e;
    });
  }

  /** The emails of these users' accounts (those that still have one). */
  emailsOf(userIds: string[]) {
    if (userIds.length === 0) return [];
    return this.all('SELECT email FROM accounts WHERE user_id IN (SELECT value FROM json_each(?))', JSON.stringify(userIds)).map((r) => r.email as string);
  }

  // ---------------- plans: Lite, Unlimited ('pro') and Exclusive ----------------

  planOf(userId: string): PlanName {
    return (this.get('SELECT plan FROM users WHERE id = ?', userId)?.plan as PlanName | null | undefined) ?? 'lite';
  }

  /** The bytes a user's posts take, live and archived, each space. */
  used(userId: string): Record<Space, number> {
    const r = this.get('SELECT coalesce(sum(video_size), 0) AS video, coalesce(sum(size), 0) AS media FROM posts WHERE author_id = ?', userId)!;
    return { video: r.video as number, media: r.media as number };
  }

  /** How many posts of a kind (letters aside) this user made in the last 24 hours. */
  postedLastDay(userId: string, kind: Post['kind']) {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return this.get('SELECT count(*) AS c FROM posts WHERE author_id = ? AND kind = ? AND letter = 0 AND created_at > ?', userId, kind, since)!.c as number;
  }

  planState(userId: string): PlanState {
    const user = this.user(userId);
    const plan = this.planOf(userId);
    const lite = plan === 'lite';
    return {
      plan,
      packs: { video: user?.packs?.video ?? 0, media: user?.packs?.media ?? 0 },
      used: this.used(userId),
      quota: quota(plan, user?.packs),
      blogsLeft: lite ? Math.max(0, PLANS.lite.blogsPer24h - this.postedLastDay(userId, 'blog')) : null,
      vlogsLeft: lite ? Math.max(0, PLANS.lite.vlogsPer24h - this.postedLastDay(userId, 'vlog')) : null,
    };
  }

  /** A plan, with its clean-ups, in one transaction: storage packs are the paid plans' (back on Lite
   * they go, and the Stripe ids of the plan and the packs); selling a monthly subscription is
   * Unlimited's (off it, the price goes and every reader's subscription ends). Stripe's side the
   * caller has done. */
  setPlan(userId: string, plan: PlanName) {
    this.tx(() => {
      if (this.run('UPDATE users SET plan = ? WHERE id = ?', plan, userId).changes === 0) return;
      if (plan === 'lite') {
        this.run('UPDATE users SET packs_video = NULL, packs_media = NULL WHERE id = ?', userId);
        this.run('DELETE FROM pay_plans WHERE user_id = ?', userId);
        this.run('DELETE FROM pay_packs WHERE user_id = ?', userId);
      }
      if (plan !== 'pro') {
        this.run('UPDATE users SET price = NULL WHERE id = ?', userId);
        this.dropSubscribers(userId);
      }
    });
  }

  /** A profile picture or wallpaper: the new one in, the old file away. */
  setPicture(userId: string, which: 'avatarUrl' | 'wallpaperUrl', url: string | undefined) {
    const user = this.user(userId);
    if (!user) return;
    this.run(`UPDATE users SET ${PICTURE_COLUMN[which]} = ? WHERE id = ?`, url, userId);
    if (this.uploads) void remove(user[which], this.uploads);
  }

  /** A public profile: anyone may make one, and say a few words. */
  setProfile(userId: string, publicProfile: boolean, bio: string) {
    this.run('UPDATE users SET public_profile = ?, bio = ? WHERE id = ?', publicProfile, bio.trim().slice(0, 300) || null, userId);
  }

  buyPack(userId: string, space: Space) {
    if (!this.user(userId) || !beyondLite(this.planOf(userId))) return false;
    const col = PACK_COLUMN[space];
    this.run(`UPDATE users SET ${col} = coalesce(${col}, 0) + 1 WHERE id = ?`, userId);
    return true;
  }

  /** A storage pack ends (withdrawn from). */
  dropPack(userId: string, space: Space) {
    const col = PACK_COLUMN[space];
    if (col) this.run(`UPDATE users SET ${col} = ${col} - 1 WHERE id = ? AND ${col} > 0`, userId);
  }

  /** The paid plans: how long a post stays live from now (null: until ended), or end it now (into the archive). */
  setLife(postId: string, until: number | null | 'end' | 'live') {
    if (until === 'end') this.run('UPDATE posts SET archived = 1 WHERE id = ?', postId);
    else if (until === 'live') this.run('UPDATE posts SET archived = 0 WHERE id = ?', postId);
    else this.run('UPDATE posts SET archived = 0, expires_at = ? WHERE id = ?', until, postId);
  }

  /** A post's files at new addresses (moved to R2). */
  moveFiles(postId: string, urls: Pick<Post, 'videoUrl' | 'imageUrl' | 'pictures'>) {
    this.run('UPDATE posts SET video_url = ?, image_url = ?, pictures = ? WHERE id = ?', urls.videoUrl, urls.imageUrl, urls.pictures ? JSON.stringify(urls.pictures) : null, postId);
  }

  /** A profile picture or wallpaper at its new address (moved to R2), if it is still the one in use. */
  movePicture(userId: string, which: 'avatarUrl' | 'wallpaperUrl', from: string, to: string) {
    const col = PICTURE_COLUMN[which];
    return this.run(`UPDATE users SET ${col} = ? WHERE id = ? AND ${col} = ?`, to, userId, from).changes > 0;
  }

  /** A vlog's file replaced by a smaller copy. */
  replaceVideo(postId: string, videoUrl: string, videoSize: number) {
    this.run('UPDATE posts SET video_url = ?, video_size = ? WHERE id = ?', videoUrl, videoSize, postId);
  }

  /** A post, with its messages, BoVNotes, purchases and reports (they cascade); its files once that is committed. */
  deletePost(postId: string) {
    this.tx(() => {
      const post = this.post(postId);
      if (!post) return;
      this.run('DELETE FROM posts WHERE id = ?', postId);
      if (this.uploads) this.then(() => [post.videoUrl, post.imageUrl, ...(post.pictures ?? [])].forEach((url) => void remove(url, this.uploads)));
    });
  }

  /** Every post of a user's: letters and the archive too. */
  postsOf(userId: string) {
    return this.all('SELECT * FROM posts WHERE author_id = ? ORDER BY n', userId).map(toPost);
  }

  /** Posts whose time is up: a Lite author's disappear, a paid plan's go to their archive. Cancelled
   * subscriptions whose period is over end, and reports older than six months go. One transaction,
   * and only when there is something to do (it runs before every request). */
  sweep(now = Date.now()) {
    const old = new Date(monthsBefore(now, REPORT_MONTHS));
    const decided = monthsBefore(now, COMPLAINT_MONTHS);
    const logged = monthsBefore(now, AUDIT_MONTHS);
    // a decision's record goes once the time to complain is up, unless a complaint about it is open or a suspension it made lasts
    const stale = `d.created_at <= ?3 AND NOT EXISTS (SELECT 1 FROM mod_complaints c WHERE c.decision_id = d.id AND c.decided_at IS NULL) AND NOT EXISTS (SELECT 1 FROM suspensions s WHERE s.decision_id = d.id)`;
    const due = this.get(
      `SELECT EXISTS (SELECT 1 FROM posts WHERE archived = 0 AND expires_at IS NOT NULL AND expires_at <= ?1)
           OR EXISTS (SELECT 1 FROM subscriptions WHERE until IS NOT NULL AND until <= ?1)
           OR EXISTS (SELECT 1 FROM reports WHERE created_at <= ?2)
           OR EXISTS (SELECT 1 FROM suspensions WHERE until IS NOT NULL AND until <= ?1)
           OR EXISTS (SELECT 1 FROM mod_tokens WHERE expires_at <= ?1)
           OR EXISTS (SELECT 1 FROM mod_notices WHERE created_at <= ?2)
           OR EXISTS (SELECT 1 FROM mod_decisions d WHERE ${stale})
           OR EXISTS (SELECT 1 FROM mod_log WHERE at <= ?4) AS due`,
      now, old.getTime(), decided, logged,
    )!.due;
    if (!due) return;
    this.tx(() => {
      const ended = this.all('SELECT p.id, u.plan FROM posts p JOIN users u ON u.id = p.author_id WHERE p.archived = 0 AND p.expires_at IS NOT NULL AND p.expires_at <= ?', now);
      for (const p of ended) {
        if (beyondLite((p.plan as PlanName | null) ?? 'lite')) this.run('UPDATE posts SET archived = 1 WHERE id = ?', p.id);
        else this.deletePost(p.id as string);
      }
      // the Stripe subscription ended with its period: its id goes with it
      this.run('DELETE FROM pay_readers WHERE (reader_id, author_id) IN (SELECT reader_id, author_id FROM subscriptions WHERE until IS NOT NULL AND until <= ?)', now);
      this.run('DELETE FROM subscriptions WHERE until IS NOT NULL AND until <= ?', now);
      this.run('DELETE FROM reports WHERE created_at <= ?', old.getTime());
      // suspensions whose time is up end (into the log), and what moderation keeps goes in its time
      for (const r of this.all('SELECT s.decision_id, u.username FROM suspensions s JOIN users u ON u.id = s.user_id WHERE s.until IS NOT NULL AND s.until <= ?', now))
        this.logAction({ id: null, username: 'system' }, 'suspension ended', `@${r.username}`, r.decision_id as string, 'its time was up');
      this.run('DELETE FROM suspensions WHERE until IS NOT NULL AND until <= ?', now);
      this.run('DELETE FROM mod_tokens WHERE expires_at <= ?', now);
      this.run('DELETE FROM mod_notices WHERE created_at <= ?', old.getTime());
      this.run(`DELETE FROM mod_decisions AS d WHERE ${stale.split('?3').join('?')}`, decided);
      this.run('DELETE FROM mod_log WHERE at <= ?', logged);
    });
  }

  /** A deleted account, in one transaction: everything of the user's goes (their posts are deleted
   * first, through deletePost, then the groups they are the last admin of are seen to; the rest
   * cascades with the user): their messages anywhere, BoVNotes, friendships, subscriptions both ways,
   * purchases, reports, group memberships, invitations and bans, Stripe ids, sign-in and sessions, and
   * the user. The purchases log keeps its rows for accounting, without whose they were. */
  deleteUser(userId: string) {
    this.tx(() => {
      const user = this.user(userId);
      if (!user) return;
      for (const p of this.postsOf(userId)) this.deletePost(p.id);
      // the groups they are the last admin of: a friend group goes with its posts; an interest group's
      // oldest member becomes its admin (none left: it goes too). Their memberships, invitations and
      // bans go with them (they cascade).
      for (const g of this.all("SELECT g.id, g.kind FROM groups g JOIN group_members m ON m.group_id = g.id AND m.user_id = ?1 AND m.role = 'admin' WHERE NOT EXISTS (SELECT 1 FROM group_members o WHERE o.group_id = g.id AND o.role = 'admin' AND o.user_id != ?1)", userId)) {
        const next = g.kind === 'interest' ? this.oldestMember(g.id as string, userId) : undefined;
        if (next) this.run("UPDATE group_members SET role = 'admin' WHERE group_id = ? AND user_id = ?", g.id, next);
        else this.deleteGroup(g.id as string);
      }
      // out of the BoVNotes left for them (a note for no one any more goes)
      const theirs = this.all('SELECT * FROM notes WHERE EXISTS (SELECT 1 FROM json_each(recipients) WHERE value = ?1) OR EXISTS (SELECT 1 FROM json_each(seen_by) WHERE value = ?1)', userId).map(toNote);
      for (const n of theirs) {
        const recipients = n.recipients.filter((r) => r !== userId);
        if (recipients.length === 0) this.run('DELETE FROM notes WHERE id = ?', n.id);
        else this.run('UPDATE notes SET recipients = ?, seen_by = ? WHERE id = ?', JSON.stringify(recipients), JSON.stringify(n.seenBy.filter((r) => r !== userId)), n.id);
      }
      // the log's rows that name them as the author subscribed to (as the buyer, the foreign key does it)
      this.run('UPDATE purchase_log SET item = NULL WHERE item = ?', userId);
      // the Connect account stays at Stripe (it holds what the author is still owed); only our link to it goes
      this.run('DELETE FROM users WHERE id = ?', userId);
      if (this.uploads) this.then(() => [user.avatarUrl, user.wallpaperUrl].forEach((url) => void remove(url, this.uploads)));
    });
  }

  /** A paid plan's archive: their posts whose time is up, newest first. */
  archive(userId: string): Post[] {
    return this.all(`SELECT * FROM posts p WHERE author_id = :me AND NOT ${LIVE} ORDER BY created_at DESC, n`, { me: userId, now: Date.now() }).map(toPost);
  }

  /** People whose display name or username has each of the words in it (a word's leading @ aside),
   * you aside; the one whose username is the query exactly first. */
  search(userId: string, q: string): User[] {
    const words = q.toLowerCase().split(/\s+/).map((w) => w.replace(/^@+/, '')).filter(Boolean);
    if (words.length === 0) return [];
    const each = words.map((_, i) => `AND (instr(name_key, ?${i + 3}) > 0 OR instr(username, ?${i + 3}) > 0)`).join(' ');
    return this.db
      .prepare(`SELECT * FROM users WHERE id != ?1 ${each} ORDER BY username = ?2 DESC, n LIMIT 20`)
      .all(userId, normalUsername(q), ...words)
      .map((r) => toUser(r as Row));
  }

  /** Someone's public posts (what anyone may see of them), newest first. */
  publicPosts(authorId: string): Post[] {
    return this.all(`SELECT * FROM posts p WHERE author_id = :author AND audience = 'public' AND ${LIVE} AND ${OPEN} ORDER BY created_at DESC, n`, { author: authorId, now: Date.now() }).map(toPost);
  }

  /** For search engines: the live public posts that are not hidden (no letters), newest first; one author's, or everyone's. */
  indexedPosts(authorId?: string): Post[] {
    const where = `audience = 'public' AND letter = 0 AND hidden = 0 AND ${LIVE} AND ${OPEN}`;
    const rows = authorId
      ? this.all(`SELECT * FROM posts p WHERE author_id = :author AND ${where} ORDER BY created_at DESC, n`, { author: authorId, now: Date.now() })
      : this.all(`SELECT * FROM posts p WHERE ${where} ORDER BY created_at DESC, n`, { now: Date.now() });
    return rows.map(toPost);
  }

  /** The people whose profile is public. */
  publicProfiles(): User[] {
    return this.all('SELECT * FROM users u WHERE public_profile = 1 AND NOT EXISTS (SELECT 1 FROM suspensions s WHERE s.user_id = u.id AND ' + SUSPENDED('?') + ') ORDER BY n', Date.now()).map(toUser);
  }

  /** The live posts this user can see (as canSee says it), and `more`, newest first. */
  private visible(userId: string, more = '') {
    return this.all(
      `SELECT * FROM posts p WHERE ${LIVE} AND (
         p.author_id = :me OR ${OPEN} AND (p.audience = 'public'
         OR (EXISTS (SELECT 1 FROM friends WHERE (a = :me AND b = p.author_id) OR (a = p.author_id AND b = :me))
             AND (p.audience = 'friends' OR (p.audience = 'chosen' AND EXISTS (SELECT 1 FROM json_each(p.chosen) WHERE value = :me)))))
       ) ${more} ORDER BY p.created_at DESC, p.n`,
      { me: userId, now: Date.now() },
    ).map(toPost);
  }

  /** Your friends' posts for you: friends-only, chosen, and their public ones (not letters). */
  friendsFeed(userId: string): Post[] {
    return this.visible(userId, 'AND p.author_id != :me AND p.letter = 0 AND EXISTS (SELECT 1 FROM friends WHERE (a = :me AND b = p.author_id) OR (a = p.author_id AND b = :me))');
  }

  /** Your own live posts (not letters), newest first. */
  ownPosts(userId: string): Post[] {
    return this.all(`SELECT * FROM posts p WHERE author_id = :me AND letter = 0 AND ${LIVE} ORDER BY created_at DESC, n`, { me: userId, now: Date.now() }).map(toPost);
  }

  /** For You: public posts by anyone but you, live and not hidden, judged and ordered by
   * shared/foryou.ts for your interests (none: the freshest and most talked about first). Each with
   * why it is there. Only your chosen interests and the posts' public side go in (their words,
   * topics, how many messages, whether the author is your friend): nothing of what you read. */
  forYou(userId: string, now = Date.now()): { post: Post; ranked: Ranked }[] {
    const rows = this.all(
      `SELECT p.*, (SELECT count(*) FROM messages m WHERE m.post_id = p.id) AS talk,
         EXISTS (SELECT 1 FROM friends WHERE (a = :me AND b = p.author_id) OR (a = p.author_id AND b = :me)) AS friend
       FROM posts p WHERE p.audience = 'public' AND ${LIVE} AND p.hidden = 0 AND ${OPEN} AND p.author_id != :me ORDER BY p.n`,
      { me: userId, now },
    );
    const topics = this.topicsOf(rows.map((r) => r.id as string));
    const posts = new Map(rows.map((r) => [r.id as string, toPost(r)]));
    const cands: Candidate[] = rows.map((r) => ({
      id: r.id as string,
      authorId: r.author_id as string,
      createdAt: r.created_at as number,
      title: r.title as string,
      body: r.body as string,
      messages: r.talk as number,
      topics: topics.get(r.id as string) ?? [],
      friend: !!r.friend,
    }));
    const { topics: mine, words } = this.interests(userId);
    return rank(cands, { topics: mine, words }, now).map((ranked) => ({ post: posts.get(ranked.id)!, ranked }));
  }

  /** The topics of these posts, by post (in the topics' own order). */
  topicsOf(postIds: string[]): Map<string, PostTopic[]> {
    const out = new Map<string, PostTopic[]>();
    if (postIds.length === 0) return out;
    const rows = this.all('SELECT post_id, topic, how FROM post_topics WHERE post_id IN (SELECT value FROM json_each(?)) ORDER BY rowid', JSON.stringify(postIds));
    for (const r of rows) {
      if (!isTopic(r.topic)) continue;
      const list = out.get(r.post_id as string) ?? [];
      list.push({ id: r.topic, how: r.how as PostTopic['how'] });
      out.set(r.post_id as string, list);
    }
    return out;
  }

  // ---------------- interests (private: only their owner ever gets them) ----------------

  interests(userId: string): Interests {
    const r = this.get('SELECT * FROM interests WHERE user_id = ?', userId);
    return r ? { topics: cleanTopics(JSON.parse(r.topics as string)), words: cleanWords(JSON.parse(r.words as string)), asked: r.asked_at !== null } : { topics: [], words: [], asked: false };
  }

  /** A person's interests saved (cleaned: known topics, their own words normalised); they have been asked. */
  setInterests(userId: string, topics: unknown, words: unknown): Interests {
    this.run(
      `INSERT INTO interests (user_id, topics, words, asked_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (user_id) DO UPDATE SET topics = excluded.topics, words = excluded.words, asked_at = coalesce(interests.asked_at, excluded.asked_at)`,
      userId, JSON.stringify(cleanTopics(topics)), JSON.stringify(cleanWords(words)), Date.now(),
    );
    return this.interests(userId);
  }

  /** The step after sign-up skipped: never asked again (what they had stays). */
  skipInterests(userId: string): Interests {
    this.run('INSERT INTO interests (user_id, asked_at) VALUES (?1, ?2) ON CONFLICT (user_id) DO UPDATE SET asked_at = coalesce(interests.asked_at, excluded.asked_at)', userId, Date.now());
    return this.interests(userId);
  }

  /** A topic's page: its live, not hidden public posts, newest first (TOPIC_POSTS_MAX), and the people
   * with a public profile whose posts carry it most (TOPIC_WRITERS_MAX), you aside. */
  byTopic(userId: string, topic: TopicId): { posts: Post[]; writers: User[] } {
    const now = Date.now();
    const posts = this.all(
      `SELECT p.* FROM posts p JOIN post_topics t ON t.post_id = p.id AND t.topic = :topic
       WHERE p.audience = 'public' AND ${LIVE} AND p.hidden = 0 AND ${OPEN} ORDER BY p.created_at DESC, p.n LIMIT ${TOPIC_POSTS_MAX}`,
      { topic, now },
    ).map(toPost);
    const writers = this.all(
      `SELECT u.*, count(*) AS c FROM users u JOIN posts p ON p.author_id = u.id JOIN post_topics t ON t.post_id = p.id AND t.topic = :topic
       WHERE u.public_profile = 1 AND u.id != :me AND p.audience = 'public' AND ${LIVE} AND p.hidden = 0 AND ${OPEN}
       GROUP BY u.id ORDER BY c DESC, u.n LIMIT ${TOPIC_WRITERS_MAX}`,
      { topic, me: userId, now },
    ).map(toUser);
    return { posts, writers };
  }

  feed(userId: string): Post[] {
    return this.visible(userId);
  }

  post(postId: string) {
    const r = this.get('SELECT * FROM posts WHERE id = ?', postId);
    return r && toPost(r);
  }

  /** A new post; a public one carries the topics its author chose (none: read from its words). */
  addPost(p: Omit<Post, 'id' | 'createdAt'>, topics?: TopicId[]): Post {
    const post = { ...p, id: id(), createdAt: Date.now() };
    this.insertPost(post, topics);
    return post;
  }

  /** Letters to or from this user, newest first. */
  letters(userId: string): Post[] {
    return this.all(
      `SELECT * FROM posts p WHERE letter = 1 AND ${LIVE} AND (author_id = :me OR (${OPEN} AND audience = 'chosen' AND EXISTS (SELECT 1 FROM json_each(p.chosen) WHERE value = :me))) ORDER BY created_at DESC, n`,
      { me: userId, now: Date.now() },
    ).map(toPost);
  }

  // ---------------- groups ----------------
  // A friend group is its members' alone: nothing of it (its name, its posts, who is in it) goes to anyone
  // else, and an invitee sees only the invitation. An interest group is open to everyone signed in.

  /** A group as this user sees it (their role in it, banned or not); none: no such group. Whether they
   * may see it at all is seesGroup's. */
  group(groupId: string, userId: string): Group | undefined {
    const r = this.get(`SELECT ${GROUP_COLUMNS} FROM groups g WHERE g.id = :id`, { id: groupId, me: userId });
    return r && toGroup(r);
  }

  /** May this user see the group and its posts: an interest group, anyone signed in; a friend group, its members. */
  seesGroup(userId: string, groupId: string) {
    return !!this.get("SELECT 1 FROM groups g WHERE g.id = ?1 AND (g.kind = 'interest' OR EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = ?2))", groupId, userId);
  }

  /** This user's role in the group (none: not a member). */
  groupRole(groupId: string, userId: string): GroupRole | undefined {
    return (this.get('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId)?.role as GroupRole | undefined) ?? undefined;
  }

  /** Banned from the group by its admins? */
  bannedFrom(groupId: string, userId: string) {
    return !!this.get('SELECT 1 FROM group_bans WHERE group_id = ? AND user_id = ?', groupId, userId);
  }

  /** The groups this user is a member of, by name. */
  groupsOf(userId: string): Group[] {
    return this.all(`SELECT ${GROUP_COLUMNS} FROM groups g WHERE EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = :me) ORDER BY g.name_key, g.n`, { me: userId }).map(toGroup);
  }

  /** Every interest group (they are open), the most members first (GROUP_LIST_MAX at most). */
  interestGroups(userId: string): Group[] {
    return this.all(`SELECT ${GROUP_COLUMNS} FROM groups g WHERE g.kind = 'interest' ORDER BY members DESC, g.n LIMIT ${GROUP_LIST_MAX}`, { me: userId }).map(toGroup);
  }

  /** Groups whose name has each of the words in it: interest groups, and the friend groups this user is
   * in (no one else's); the one named exactly so first, then the most members (GROUP_SEARCH_MAX at most). */
  searchGroups(userId: string, q: string): Group[] {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 10);
    if (words.length === 0) return [];
    const each = words.map((_, i) => `AND instr(g.name_key, :w${i}) > 0`).join(' ');
    const args: Record<string, Arg> = { me: userId, q: words.join(' ') };
    words.forEach((w, i) => (args[`w${i}`] = w));
    return this.db
      .prepare(
        `SELECT ${GROUP_COLUMNS} FROM groups g WHERE (g.kind = 'interest' OR EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = :me)) ${each}
         ORDER BY g.name_key = :q DESC, members DESC, g.n LIMIT ${GROUP_SEARCH_MAX}`,
      )
      .all(...(this.args([args]) as [Record<string, SQLInputValue>]))
      .map((r) => toGroup(r as Row));
  }

  /** A new group, its creator its admin, in one transaction: an interest group around its topic (its name
   * unique within the topic, whatever its case: 'name-taken'), or a friend group. */
  createGroup(userId: string, g: { kind: GroupKind; name: string; description?: string; topic?: TopicId; pictureUrl?: string }): Group | 'name-taken' {
    return this.tx(() => {
      const key = g.name.toLowerCase();
      if (g.kind === 'interest' && this.get("SELECT 1 FROM groups WHERE kind = 'interest' AND topic = ? AND name_key = ?", g.topic, key)) return 'name-taken';
      const groupId = id();
      const now = Date.now();
      this.run(
        'INSERT INTO groups (id, kind, name, name_key, description, topic, picture_url, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        groupId, g.kind, g.name, key, g.description || null, g.kind === 'interest' ? g.topic : null, g.kind === 'friends' ? g.pictureUrl : null, userId, now,
      );
      this.run("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)", groupId, userId, now);
      return this.group(groupId, userId)!;
    });
  }

  /** A group renamed and its description changed (an interest group's name stays unique within its topic: 'name-taken'). */
  updateGroup(groupId: string, name: string, description: string): 'name-taken' | undefined {
    return this.tx(() => {
      const key = name.toLowerCase();
      if (this.get("SELECT 1 FROM groups g WHERE g.kind = 'interest' AND g.id != ?1 AND g.name_key = ?2 AND g.topic = (SELECT topic FROM groups WHERE id = ?1)", groupId, key)) return 'name-taken';
      this.run('UPDATE groups SET name = ?, name_key = ?, description = ? WHERE id = ?', name, key, description || null, groupId);
      return undefined;
    });
  }

  /** A friend group's picture: the new one in, the old file away. */
  setGroupPicture(groupId: string, url: string | undefined) {
    const old = this.get('SELECT picture_url FROM groups WHERE id = ?', groupId)?.picture_url as string | null | undefined;
    this.run('UPDATE groups SET picture_url = ? WHERE id = ?', url, groupId);
    if (old && this.uploads) void remove(old, this.uploads);
  }

  /** A group's picture at its new address (moved to R2), if it is still the one in use. */
  moveGroupPicture(groupId: string, from: string, to: string) {
    return this.run('UPDATE groups SET picture_url = ? WHERE id = ? AND picture_url = ?', to, groupId, from).changes > 0;
  }

  /** A group deleted, in one transaction: its posts first (as deletePost deletes them, their files once
   * committed), then the group with its members, invitations and bans, and its picture once committed. */
  deleteGroup(groupId: string) {
    this.tx(() => {
      const r = this.get('SELECT picture_url FROM groups WHERE id = ?', groupId);
      if (!r) return;
      for (const p of this.all('SELECT id FROM posts WHERE group_id = ?', groupId)) this.deletePost(p.id as string);
      this.run('DELETE FROM groups WHERE id = ?', groupId);
      const picture = r.picture_url as string | null;
      if (picture && this.uploads) this.then(() => void remove(picture, this.uploads));
    });
  }

  /** A group's members: the admins first, then in the order they came. */
  groupMembers(groupId: string): GroupMember[] {
    return this.all("SELECT user_id, role, joined_at FROM group_members WHERE group_id = ? ORDER BY role = 'admin' DESC, joined_at, rowid", groupId).map((r) => ({
      userId: r.user_id as string,
      role: r.role as GroupRole,
      joinedAt: r.joined_at as number,
    }));
  }

  /** The member who came first, `except` aside (an interest group's next admin). */
  private oldestMember(groupId: string, except: string) {
    return (this.get('SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ? ORDER BY joined_at, rowid LIMIT 1', groupId, except)?.user_id as string | undefined) ?? undefined;
  }

  /** An invitation to a friend group: 'invited' (an admin's: it waits for the invitee) or 'suggested' (a
   * member's: it waits for an admin); an admin inviting someone suggested makes it 'invited'. False: they
   * are a member already. Who may invite whom is the caller's. */
  invite(groupId: string, userId: string, by: string, status: 'invited' | 'suggested') {
    return this.tx(() => {
      if (this.groupRole(groupId, userId)) return false;
      const had = this.get('SELECT status FROM group_invites WHERE group_id = ? AND user_id = ?', groupId, userId);
      if (!had) this.run('INSERT INTO group_invites (group_id, user_id, invited_by, status, created_at) VALUES (?, ?, ?, ?, ?)', groupId, userId, by, status, Date.now());
      else if (had.status === 'suggested' && status === 'invited') this.run("UPDATE group_invites SET status = 'invited', invited_by = ?, created_at = ? WHERE group_id = ? AND user_id = ?", by, Date.now(), groupId, userId);
      return true;
    });
  }

  /** A friend group's invitations waiting: for the invitees, and the members' suggestions for an admin; the oldest first. */
  groupInvites(groupId: string): GroupInvite[] {
    return this.all('SELECT * FROM group_invites WHERE group_id = ? ORDER BY created_at, rowid', groupId).map((r) => {
      const i: GroupInvite = { userId: r.user_id as string, status: r.status as GroupInvite['status'], createdAt: r.created_at as number };
      if (r.invited_by !== null) i.by = r.invited_by as string;
      return i;
    });
  }

  /** The invitations waiting for this user, the newest first: each group as they may see it before
   * joining (its name, description, picture and members count), and who invited them. */
  invitationsFor(userId: string): Invitation[] {
    return this.all("SELECT group_id, invited_by, created_at FROM group_invites WHERE user_id = ? AND status = 'invited' ORDER BY created_at DESC, rowid DESC", userId).flatMap((r) => {
      const group = this.group(r.group_id as string, userId);
      if (!group) return [];
      const inv: Invitation = { group, createdAt: r.created_at as number };
      if (r.invited_by !== null) inv.by = r.invited_by as string;
      return [inv];
    });
  }

  /** What waits for this user: invitations to them, and members' suggestions in the groups they are an admin of. */
  pendingFor(userId: string) {
    const r = this.get(
      `SELECT (SELECT count(*) FROM group_invites WHERE user_id = ?1 AND status = 'invited') AS invitations,
              (SELECT count(*) FROM group_invites i JOIN group_members m ON m.group_id = i.group_id AND m.user_id = ?1 AND m.role = 'admin' WHERE i.status = 'suggested') AS approve`,
      userId,
    )!;
    return { invitations: r.invitations as number, toApprove: r.approve as number };
  }

  /** A member's suggestion approved by an admin: now an invitation for the invitee. */
  approveInvite(groupId: string, userId: string) {
    return this.run("UPDATE group_invites SET status = 'invited', created_at = ? WHERE group_id = ? AND user_id = ? AND status = 'suggested'", Date.now(), groupId, userId).changes > 0;
  }

  /** An invitation gone: cancelled by an admin, a suggestion turned down, or (`invitedOnly`: what the
   * invitee knows of) declined by the invitee. */
  dropInvite(groupId: string, userId: string, invitedOnly = false) {
    return this.run(`DELETE FROM group_invites WHERE group_id = ? AND user_id = ?${invitedOnly ? " AND status = 'invited'" : ''}`, groupId, userId).changes > 0;
  }

  /** An invitation accepted, in one transaction: a member now. False: there was no invitation (a
   * suggestion not yet approved is none). */
  acceptInvite(groupId: string, userId: string) {
    return this.tx(() => {
      if (this.run("DELETE FROM group_invites WHERE group_id = ? AND user_id = ? AND status = 'invited'", groupId, userId).changes === 0) return false;
      this.run("INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", groupId, userId, Date.now());
      return true;
    });
  }

  /** Joining an interest group (the caller has checked it is one, and that they are not banned). */
  joinGroup(groupId: string, userId: string) {
    this.run("INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", groupId, userId, Date.now());
  }

  /** A member leaves, in one transaction. The last admin of a group names a member to follow them
   * (`successor`); an interest group's falls to its oldest member when they name no one. When there is
   * no one to follow (a friend group's last admin naming no one, or the last member), the group goes
   * with its posts, but only when they said so (`deleteGroup`); otherwise 'last-admin' and nothing is done. */
  leaveGroup(groupId: string, userId: string, successor?: string, deleteGroup = false): 'left' | 'deleted' | 'not-member' | 'last-admin' {
    return this.tx(() => {
      const role = this.groupRole(groupId, userId);
      if (!role) return 'not-member';
      const lastAdmin = role === 'admin' && !this.get("SELECT 1 FROM group_members WHERE group_id = ? AND role = 'admin' AND user_id != ?", groupId, userId);
      if (lastAdmin) {
        const kind = this.get('SELECT kind FROM groups WHERE id = ?', groupId)!.kind as GroupKind;
        const named = successor && successor !== userId && this.groupRole(groupId, successor) ? successor : undefined;
        const next = named ?? (kind === 'interest' && !successor ? this.oldestMember(groupId, userId) : undefined);
        if (next) this.run("UPDATE group_members SET role = 'admin' WHERE group_id = ? AND user_id = ?", groupId, next);
        else if (deleteGroup) {
          this.deleteGroup(groupId);
          return 'deleted';
        } else return 'last-admin';
      }
      this.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId);
      return 'left';
    });
  }

  /** A member (not an admin) taken out of a group by its admin. */
  removeMember(groupId: string, userId: string) {
    return this.run("DELETE FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'member'", groupId, userId).changes > 0;
  }

  /** A member made an admin. */
  makeAdmin(groupId: string, userId: string) {
    return this.run("UPDATE group_members SET role = 'admin' WHERE group_id = ? AND user_id = ? AND role = 'member'", groupId, userId).changes > 0;
  }

  /** Banned from an interest group, in one transaction: out of it (not an admin), and kept out. */
  banFromGroup(groupId: string, userId: string, by: string) {
    return this.tx(() => {
      if (this.groupRole(groupId, userId) === 'admin') return false;
      this.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId);
      this.run('INSERT OR REPLACE INTO group_bans (group_id, user_id, banned_by, created_at) VALUES (?, ?, ?, ?)', groupId, userId, by, Date.now());
      return true;
    });
  }

  unbanFromGroup(groupId: string, userId: string) {
    return this.run('DELETE FROM group_bans WHERE group_id = ? AND user_id = ?', groupId, userId).changes > 0;
  }

  /** The people banned from a group, the newest first. */
  groupBans(groupId: string) {
    return this.all('SELECT user_id FROM group_bans WHERE group_id = ? ORDER BY created_at DESC, rowid DESC', groupId).map((r) => r.user_id as string);
  }

  /** A group's live posts, newest first (GROUP_LIST_MAX at most): those moderation keeps from no one,
   * and your own; in an interest group not those reports took off (as For You leaves them out), your own aside. */
  groupPosts(groupId: string, userId: string): Post[] {
    return this.all(
      `SELECT p.* FROM posts p JOIN groups g ON g.id = p.group_id WHERE p.group_id = :group AND ${LIVE}
         AND (p.author_id = :me OR (${OPEN} AND (p.hidden = 0 OR g.kind = 'friends')))
       ORDER BY p.created_at DESC, p.n LIMIT ${GROUP_LIST_MAX}`,
      { group: groupId, me: userId, now: Date.now() },
    ).map(toPost);
  }

  /** For You's strip: the interest groups this user is not in nor banned from, matched to their
   * interests by shared/foryou.ts (none chosen: none). */
  groupSuggestions(userId: string): Group[] {
    const reader = this.interests(userId);
    if (reader.topics.length === 0 && reader.words.length === 0) return [];
    const groups = this.all(
      `SELECT ${GROUP_COLUMNS} FROM groups g WHERE g.kind = 'interest'
         AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = :me)
         AND NOT EXISTS (SELECT 1 FROM group_bans x WHERE x.group_id = g.id AND x.user_id = :me)`,
      { me: userId },
    ).map(toGroup);
    const byId = new Map(groups.map((g) => [g.id, g]));
    const cands = groups.flatMap((g) => (g.topic ? [{ id: g.id, topic: g.topic, name: g.name, description: g.description ?? '', members: g.members, createdAt: g.createdAt }] : []));
    return suggestGroups(cands, reader).map((s) => byId.get(s.id)!);
  }

  addNote(postId: string, authorId: string, text: string, recipients: string[]): Note {
    const note: Note = { id: id(), postId, authorId, text: text.trim().slice(0, 1000), recipients, seenBy: [], createdAt: Date.now() };
    this.run('INSERT INTO notes (id, post_id, author_id, text, recipients, seen_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', note.id, postId, authorId, note.text, JSON.stringify(recipients), '[]', note.createdAt);
    return note;
  }

  /** The BoVNotes inside a post waiting for this user, oldest first. */
  notesFor(userId: string, postId: string): Note[] {
    return this.all(
      'SELECT * FROM notes WHERE post_id = ?1 AND EXISTS (SELECT 1 FROM json_each(recipients) WHERE value = ?2) AND NOT EXISTS (SELECT 1 FROM json_each(seen_by) WHERE value = ?2) ORDER BY created_at, n',
      postId, userId,
    ).map(toNote);
  }

  seen(noteId: string, userId: string) {
    this.tx(() => {
      const r = this.get('SELECT * FROM notes WHERE id = ?', noteId);
      const note = r && toNote(r);
      if (note && note.recipients.includes(userId) && !note.seenBy.includes(userId)) this.run('UPDATE notes SET seen_by = ? WHERE id = ?', JSON.stringify([...note.seenBy, userId]), noteId);
    });
  }

  messages(postId: string) {
    return this.all('SELECT * FROM messages WHERE post_id = ? ORDER BY created_at, n', postId).map(toMessage);
  }

  /** How many messages a post's conversation has. */
  messageCount(postId: string) {
    return this.get('SELECT count(*) AS c FROM messages WHERE post_id = ?', postId)!.c as number;
  }

  addMessage(postId: string, userId: string, text: string): Message {
    const message = { id: id(), postId, userId, text: text.trim().slice(0, 2000), createdAt: Date.now() };
    this.run('INSERT INTO messages (id, post_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)', message.id, postId, userId, message.text, message.createdAt);
    return message;
  }
}

function toAccount(r: Row): Account {
  const a: Account = { email: r.email as string, password: r.password as string, createdAt: r.created_at as number };
  if (r.terms_at !== null) a.termsAt = r.terms_at as number;
  if (r.verified_at !== null && r.verified_at !== undefined) a.verifiedAt = r.verified_at as number;
  if (r.invite_code !== null && r.invite_code !== undefined) a.inviteCode = r.invite_code as string;
  return a;
}

/** db.json as the JSON store left it, its older formats too: sections missing, packs one number
 * (video) before storage was split into two spaces. */
function fromJson(d: Partial<Data>): Data {
  const e = empty();
  const pay = { ...e.pay, ...d.pay };
  pay.log ??= [];
  const users = (d.users ?? []).map((u) => (typeof u.packs === 'number' ? { ...u, packs: { video: u.packs as number } } : u));
  return { ...e, ...d, users, pay, auth: { ...e.auth, ...d.auth } } as Data;
}

export function colorFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** Public posts for the For You page: Leo's free one, Mira's paid one (for her subscribers), and
 * Eeva's on Exclusive: one free, one sold by itself. */
export function publicPosts(leo: string, mira: string, now: number, eeva: string): Post[] {
  const exclusive: Post[] = [
    {
      id: id(),
      authorId: eeva,
      kind: 'blog',
      title: 'Leipäjuuri, joka on elänyt 40 vuotta',
      body: [
        'Isoäitini juuri on vanhempi kuin minä. Tässä on se, miten se pysyy hengissä, ilmaiseksi kaikille.',
        'Ruoki se kerran viikossa, pidä se viileässä, äläkä koskaan pese purkkia saippualla.',
      ].join('\n\n'),
      imageUrl: '/seed/meri.jpg',
      audience: 'public',
      createdAt: now - 1000 * 60 * 60 * 2,
    },
    {
      id: id(),
      authorId: eeva,
      kind: 'blog',
      title: 'Ruisleivän koko resepti grammoilleen',
      body: [
        'Tämä on se resepti, jota on kysytty eniten. Jokainen gramma, jokainen tunti, ja miksi.',
        'Ensin juuri herätetään: 100 g juurta, 300 g vettä, 200 g ruisjauhoja, ja 12 tuntia huoneenlämmössä.',
        'Sitten taikina. Tässä kohtaa melkein kaikki menee pieleen, ja kerron miksi.',
      ].join('\n\n'),
      imageUrl: '/seed/miksi.jpg',
      audience: 'public',
      paid: true,
      price: 300,
      createdAt: now - 1000 * 60 * 60 * 4,
    },
  ];
  return [
    ...exclusive,
    {
      id: id(),
      authorId: leo,
      kind: 'blog',
      title: 'Kuusi yötä metsässä ilman puhelinta',
      body: [
        'Jätin puhelimen autoon ja kävelin metsään. Ensimmäisenä iltana kaivoin taskua kymmenen kertaa.',
        'Kolmantena päivänä huomasin kuulevani linnut eri tavalla. Kuudentena en halunnut lähteä.',
        'Kirjoitin kaiken vihkoon. Tässä se on, sellaisenaan.',
      ].join('\n\n'),
      imageUrl: '/seed/metsa.jpg',
      audience: 'public',
      createdAt: now - 1000 * 60 * 60 * 3,
      // Leo is on Pro and chose a week
      expiresAt: now - 1000 * 60 * 60 * 3 + 7 * 24 * 60 * 60 * 1000,
    },
    {
      id: id(),
      authorId: mira,
      kind: 'blog',
      title: 'Miten kirjoitan joka aamu 1000 sanaa',
      body: [
        'Olen kirjoittanut joka aamu kaksi vuotta. Kerron tässä tarkalleen miten, ja mikä melkein sai minut lopettamaan.',
        'Ensimmäinen sääntö: kirjoitan ennen kuin avaan yhtään viestiä. Toinen: en lue mitä kirjoitin ennen iltaa.',
        'Kolmas sääntö on se, joka muutti kaiken. Se on tylsä, ja juuri siksi se toimii.',
      ].join('\n\n'),
      imageUrl: '/seed/kahvi.jpg',
      audience: 'public',
      paid: true,
      createdAt: now - 1000 * 60 * 60 * 7,
    },
  ];
}

/** No one and nothing: a fresh start in production. */
function empty(): Data {
  return {
    users: [],
    friends: [],
    posts: [],
    messages: [],
    notes: [],
    subscriptions: [],
    purchases: [],
    reports: [],
    pay: { accounts: {}, plans: {}, packs: {}, readers: {}, sessions: [], log: [] },
    uploads: [],
    later: [],
    auth: { accounts: {}, sessions: [] },
  };
}

/** A small circle of friends and one post, so development is not empty on first start (D2M_DEMO=1). */
function seed(): Data {
  const users: User[] = DEMO_NAMES.map((name) => ({ id: id(), name, username: name.toLowerCase(), color: colorFor(name) }));
  const [joose, aino, mikko, sara, leo, mira, eeva] = users;
  eeva.plan = 'exclusive';
  eeva.publicProfile = true;
  eeva.bio = 'Leivon ruisleipää isoäidin juurella. Osa jutuista on ilmaisia, osan myyn yksitellen.';
  eeva.wallpaperUrl = '/seed/meri.jpg';
  mira.price = 499;
  leo.plan = 'pro';
  mira.plan = 'pro';
  leo.publicProfile = true;
  leo.bio = 'Kävelen metsissä ja kirjoitan siitä, mitä siellä kuulen.';
  leo.wallpaperUrl = '/seed/metsa.jpg';
  mira.wallpaperUrl = '/seed/kahvi.jpg';
  mira.publicProfile = true;
  mira.bio = 'Kirjoitan joka aamu. Tilaajat saavat kaiken, mitä opin matkalla.';
  const now = Date.now();
  const post: Post = {
    id: id(),
    authorId: aino.id,
    kind: 'blog',
    title: 'Kolme viikkoa Lofooteilla',
    body: [
      'Lupasin kirjoittaa kunnolla, joten tässä se on. Ei mitään kohokohtakoostetta, vaan miltä tämä oikeasti on tuntunut.',
      'Ensimmäinen viikko satoi joka päivä. Istuin vuokramökin ikkunassa ja mietin, miksi lähdin. Sitten neljäntenä päivänä taivas aukesi, ja ymmärsin.',
      'Olen oppinut perkaamaan turskan, kävelemään vuorelle ilman että jalat pettävät, ja olemaan hiljaa pitkiä aikoja. Kaipaan teitä silti. Kertokaa mitä sinne kuuluu.',
    ].join('\n\n'),
    imageUrl: '/seed/lofoten.jpg',
    audience: 'friends',
    createdAt: now - 1000 * 60 * 60 * 5,
    // Aino is on Lite: a blog lives 24 hours
    expiresAt: now - 1000 * 60 * 60 * 5 + 24 * 60 * 60 * 1000,
  };
  return {
    ...empty(),
    users,
    friends: [
      [joose.id, aino.id],
      [joose.id, mikko.id],
      [joose.id, sara.id],
      [aino.id, mikko.id],
      [aino.id, sara.id],
    ],
    posts: [post, ...publicPosts(leo.id, mira.id, now, eeva.id)],
    notes: [
      { id: id(), postId: post.id, authorId: aino.id, text: 'Joose, tämä juttu on vähän sullekin: muistatko kun sanoit että lähde vaan? Kiitos siitä. 🏔️', recipients: [joose.id], seenBy: [], createdAt: now - 1000 * 60 * 60 * 5 },
    ],
    messages: [
      { id: id(), postId: post.id, userId: mikko.id, text: 'Tuo neljäs päivä! Laita kuvia siitä vuoresta.', createdAt: now - 1000 * 60 * 60 * 4 },
      { id: id(), postId: post.id, userId: joose.id, text: 'Hyvä että kirjoitit. Milloin tuut takaisin?', createdAt: now - 1000 * 60 * 60 * 3 },
    ],
  };
}
