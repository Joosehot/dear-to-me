// The data shared by the server and every client (the web prototype now, the app later).

import type { PlanName, Space } from './plans';
import type { UsernameReason } from './usernames';
import type { TopicId } from './interests';
import type { PostTopic } from './topics';
import type { Because } from './foryou';

export interface User {
  id: string;
  /** the display name (free: two people may share one) */
  name: string;
  /** the unique handle, shown as @username (public, like the name; shared/usernames.ts has the rule) */
  username: string;
  /** a colour for the avatar, picked from the name */
  color: string;
  /** the monthly subscription to their paid public posts, in cents (none: they sell nothing) */
  price?: number;
  /** their D2M plan (none: Lite); 'pro' is Unlimited */
  plan?: PlanName;
  /** storage packs bought, each space (the paid plans only) */
  packs?: Partial<Record<Space, number>>;
  /** they made a public profile (anyone may; without one, no one sees a profile of theirs) */
  publicProfile?: boolean;
  /** a few words about themselves, on the public profile */
  bio?: string;
  /** their profile picture (none: the initial on their colour) */
  avatarUrl?: string;
  /** the wide picture at the top of their profile */
  wallpaperUrl?: string;
  /** Only on your own user (GET /api/me, signing in and up), never on anyone else's: your email, whether
   * you have confirmed it, and a new address you asked to change to and have not confirmed yet. */
  email?: string;
  verified?: boolean;
  pendingEmail?: string;
  /** Only on your own user: you are a moderator (D2M_MODERATORS), and the moderation queue is yours to see. */
  moderator?: boolean;
}

export type PostKind = 'blog' | 'vlog';

export interface Post {
  id: string;
  authorId: string;
  kind: PostKind;
  title: string;
  /** the long text, paragraphs separated by blank lines */
  body: string;
  /** an uploaded video, served by the server */
  videoUrl?: string;
  /** the cover image (required for a blog) */
  imageUrl?: string;
  /** pictures and GIFs among a blog's paragraphs: a paragraph "[kuva 2]" shows the second */
  pictures?: string[];
  /** 'friends': every friend of the author; 'public': anyone (the For You page); 'group': the group in
   * `groupId` (a friend group: its members; an interest group: everyone signed in); otherwise the friends it was written for */
  audience: 'friends' | 'public' | 'group' | string[];
  /** the group it was written to (audience 'group') */
  groupId?: string;
  /** as served: that group's name and kind */
  group?: GroupRef;
  /** a paid public post: on Unlimited the author's subscribers read it whole; on Exclusive those who bought it */
  paid?: boolean;
  /** Exclusive: what the post costs, in cents, bought once (none: a subscription post) */
  price?: number;
  /** as served: a paid post this reader has not subscribed to or bought (the body is its opening only) */
  locked?: boolean;
  /** reported by enough readers: off the For You page until it is reviewed */
  hidden?: boolean;
  /** restricted by a moderator: only its author sees it, until a moderator lifts it */
  restricted?: boolean;
  /** when its time is up (null or none: it stays until its author ends it) */
  expiresAt?: number | null;
  /** its time is up and it is kept in its Pro author's archive (only they see it) */
  archived?: boolean;
  /** its text and picture, in bytes (what it takes of its author's text and pictures space) */
  size?: number;
  /** its video, in bytes (what it takes of its author's video space) */
  videoSize?: number;
  /** a vlog's length in seconds */
  duration?: number;
  /** a letter: written for one friend, with a conversation for the two of them */
  letter?: boolean;
  createdAt: number;
}

/** A BoVNote (blog or vlog note): left inside a post for chosen readers, shown to each when they open the post. */
export interface Note {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  recipients: string[];
  /** the recipients who have seen it */
  seenBy: string[];
  createdAt: number;
}

export interface Message {
  id: string;
  postId: string;
  userId: string;
  text: string;
  createdAt: number;
}

/** A post as a reader sees it in the feed. */
export interface PostSummary extends Post {
  messageCount: number;
  /** BoVNotes inside it waiting for the reader */
  notesForMe: number;
  /** who is in the post's conversation right now */
  present: string[];
  /** a public post's topics, chosen by its author or read from its words */
  topics?: PostTopic[];
  /** For You only: why it is there for this reader (their topics and words it carries, and the judges that carried it) */
  because?: Because;
}

/** A person's interests: private, only they ever get them (to order their For You). */
export interface Interests {
  topics: TopicId[];
  /** their own words, normalised */
  words: string[];
  /** they saved or skipped the step after sign-up (it is not shown again) */
  asked: boolean;
}

/** GET /api/topics/:topic: its public posts, newest first, and the people who write about it most. */
export interface TopicPage {
  topic: TopicId;
  posts: PostSummary[];
  writers: Profile[];
}

// The live channel (WebSocket), both ways.

export type ClientEvent =
  | { type: 'join'; postId: string }
  | { type: 'leave'; postId: string }
  | { type: 'say'; postId: string; text: string };

export type ServerEvent =
  | { type: 'message'; message: Message }
  | { type: 'presence'; postId: string; present: string[] }
  | { type: 'posted'; post: Post }
  | { type: 'note'; note: Note }
  // something waits for you in your groups (an invitation, a member's suggestion to approve): the badge reloads
  | { type: 'groups' };

// Groups.

/** 'friends': a private group (only its members see it and its posts; one joins by accepting an
 * invitation from its admin); 'interest': an open group around a topic (anyone signed in reads it and joins). */
export type GroupKind = 'friends' | 'interest';
export type GroupRole = 'admin' | 'member';

export interface Group {
  id: string;
  kind: GroupKind;
  name: string;
  description?: string;
  /** an interest group's topic */
  topic?: TopicId;
  /** a friend group's picture */
  pictureUrl?: string;
  createdAt: number;
  /** how many members it has */
  members: number;
  /** your role in it (none: you are not a member) */
  role?: GroupRole;
  /** an interest group whose admins banned you: you cannot join it or talk in it */
  banned?: boolean;
}

/** The group a post was written to, as the post shows it. */
export interface GroupRef {
  id: string;
  name: string;
  kind: GroupKind;
}

export interface GroupMember {
  userId: string;
  role: GroupRole;
  joinedAt: number;
}

/** A friend group's invitation as its admins see it: waiting for the invitee to accept ('invited'), or
 * suggested by a member and waiting for an admin to approve ('suggested'). `by`: who asked. */
export interface GroupInvite {
  userId: string;
  status: 'invited' | 'suggested';
  by?: string;
  createdAt: number;
}

/** An invitation to you: the group (its name, description and picture), and who invited you. */
export interface Invitation {
  group: Group;
  by?: string;
  createdAt: number;
}

/** GET /api/groups/:id: the group, its posts (newest first), and its members as you may see them. */
export interface GroupPage {
  group: Group;
  posts: PostSummary[];
  /** a friend group: every member (its members see each other); an interest group: its admins, and to
   * its admins every member */
  members: GroupMember[];
  /** a friend group, to its members: the invitations waiting (to its admins also the suggestions) */
  invites?: GroupInvite[];
  /** an interest group, to its admins: the people banned from it */
  bans?: string[];
}

/** GET /api/groups: your groups, the invitations waiting for you, how many members' suggestions wait
 * for you as an admin, and every interest group (they are open). */
export interface GroupsOverview {
  mine: Group[];
  invitations: Invitation[];
  toApprove: number;
  interest: Group[];
}

/** Someone found by search: who they are to you, and what they make public. */
export interface Profile {
  user: User;
  friend: boolean;
  subscribed: boolean;
  /** the subscription was cancelled: it stays open until then */
  subscribedUntil?: number;
  publicPosts: number;
}

/** A purchase as its buyer sees it in My place, from the purchases log. */
export interface PurchaseEntry {
  id: string;
  kind: 'plan' | 'pack' | 'author' | 'post';
  /** the plan's name, the storage space, the author's name or the post's title */
  name: string;
  /** cents charged (0: payments were off) */
  amount: number;
  createdAt: number;
  /** when the buyer gave their express consent (access at once) */
  consentAt?: number;
  withdrawnAt?: number;
  /** cents refunded */
  refunded?: number;
  /** a monthly contract of the last 14 days, still running: it can be withdrawn from */
  withdrawable: boolean;
}

/** Your plan as the app shows it: what you may still post today, and your storage. */
export interface PlanState {
  plan: PlanName;
  packs: Record<Space, number>;
  /** bytes, each space */
  used: Record<Space, number>;
  quota: Record<Space, number>;
  /** Lite: how many blogs and vlogs you may still post in these 24 hours (paid plans: null, no limit) */
  blogsLeft: number | null;
  vlogsLeft: number | null;
}

/** A public profile as someone sees it. */
export interface ProfilePage extends Profile {
  posts: PostSummary[];
}

/** GET /api/username/:name, the live check in the forms: can this username be had (by you)?
 * Unavailable with a free one like it, when there is one. */
export interface UsernameCheck {
  available: boolean;
  reason?: UsernameReason;
  suggestion?: string;
}

/** What the server tells the client before anyone signs in. */
export interface Config {
  /** demo mode (D2M_DEMO=1): the demo people can sign in, with these emails and this password */
  demo: boolean;
  demoEmails?: string[];
  demoPassword?: string;
  /** a closed beta (D2M_BETA=1): a slim banner says so */
  beta?: boolean;
  /** payments: off (everything free), Stripe's test mode (a test card), or live */
  payments?: 'off' | 'test' | 'live';
  /** sign-up asks for an invite code (D2M_INVITE_CODES in beta) */
  invite?: boolean;
}
