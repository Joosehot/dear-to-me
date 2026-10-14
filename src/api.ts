// Talking to the server. Who is signed in is the server's session cookie (httpOnly: no script
// reads it); the user is kept in sessionStorage only so the page draws at once, and GET /api/me
// says who it really is. Two people on one machine use two browsers (or a private window).

import type { Config, Group, GroupKind, GroupPage, GroupsOverview, Interests, Message, Note, PlanState, Post, PostSummary, Profile, ProfilePage, PurchaseEntry, TopicPage, User, UsernameCheck } from '../shared/types';
import type { TopicId } from '../shared/interests';
import type { PlanName, Space } from '../shared/plans';
import type { ComplaintPage, Decision, LogEntry, ModQueue, PostAction, Rule } from '../shared/moderation';
import { t } from './text';

const KEY = 'd2m.user';

export function currentUser(): User | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function remember(user: User | null) {
  try {
    if (user) sessionStorage.setItem(KEY, JSON.stringify(user));
    else sessionStorage.removeItem(KEY);
  } catch {
    // private mode: the session lasts until the page is reloaded
  }
}

/** An error the server gave: its status, a code for the words (sign-in and sign-up), and whatever else it said (a suspension's reason). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly data: Record<string, unknown> = {}) {
    super(message);
  }
}

/** Fired when the server no longer knows us (the session ended): the app goes back to the start. */
export const SIGNED_OUT = 'd2m:signed-out';

/** Fired when the server refused something until the email is confirmed (403 verify-email). */
export const VERIFY_NEEDED = 'd2m:verify-needed';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // every change carries it: another site's page cannot (CSRF)
  if (init.method && init.method !== 'GET') headers.set('x-d2m', '1');
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, code } = data as { error?: string; code?: string };
    if (res.status === 401 && !code && currentUser()) window.dispatchEvent(new Event(SIGNED_OUT));
    // buying, selling or a public profile before the email is confirmed: said in the reader's words
    if (code === 'verify-email') {
      window.dispatchEvent(new Event(VERIFY_NEEDED));
      throw new ApiError(t.verifyFirst, res.status, code);
    }
    throw new ApiError(error ?? res.statusText, res.status, code, data as Record<string, unknown>);
  }
  // a payment: on to Stripe's Checkout page (the app comes back to confirm it)
  const checkout = (data as { checkout?: string }).checkout;
  if (checkout) {
    location.assign(checkout);
    return new Promise<T>(() => {});
  }
  return data as T;
}

/** Payments as the server has them: on or off, and an author's Stripe account for being paid. */
export interface Payouts {
  enabled: boolean;
  live: boolean;
  linked: boolean;
  ready: boolean;
}

import { mockApi } from './mock';

/** The mock (no server, scripted friends): `npm run mock`, or ?mock in the address. */
export const MOCK = import.meta.env.VITE_MOCK === '1' || new URLSearchParams(location.search).has('mock');

const realApi = {
  config: () => call<Config>('/api/config'),
  me: () => call<User>('/api/me'),
  // (invite: the code a closed beta asks for, when it asks)
  signUp: (name: string, username: string, email: string, password: string, terms: boolean, invite?: string) =>
    call<User>('/api/signup', { method: 'POST', body: JSON.stringify({ name, username, email, password, terms, invite }) }),
  login: (email: string, password: string) => call<User>('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => call<{ ok: boolean }>('/api/logout', { method: 'POST' }),
  // a link by email: a new password (the same answer whether the email has an account or not), and confirming an address
  forgotPassword: (email: string) => call<{ ok: boolean }>('/api/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => call<User>('/api/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  verifyEmail: (token: string) => call<{ ok: boolean; email: string; changed: boolean }>('/api/email/verify', { method: 'POST', body: JSON.stringify({ token }) }),
  resendVerification: () => call<{ ok: boolean }>('/api/email/resend', { method: 'POST' }),
  changeEmail: (email: string, password: string) => call<User>('/api/me/email', { method: 'POST', body: JSON.stringify({ email, password }) }),
  users: () => call<User[]>('/api/users'),
  friends: () => call<User[]>('/api/friends'),
  addFriend: (username: string) => call<User[]>('/api/friends', { method: 'POST', body: JSON.stringify({ username }) }),
  checkUsername: (username: string) => call<UsernameCheck>(`/api/username/${encodeURIComponent(username)}`),
  setUsername: (username: string) => call<User>('/api/me/username', { method: 'POST', body: JSON.stringify({ username }) }),
  feed: () => call<PostSummary[]>('/api/feed'),
  myPosts: () => call<PostSummary[]>('/api/me/posts'),
  letters: () => call<PostSummary[]>('/api/letters'),
  forYou: () => call<PostSummary[]>('/api/fyp'),
  interests: () => call<Interests>('/api/me/interests'),
  setInterests: (topics: TopicId[], words: string[]) => call<Interests>('/api/me/interests', { method: 'POST', body: JSON.stringify({ topics, words }) }),
  skipInterests: () => call<Interests>('/api/me/interests', { method: 'POST', body: JSON.stringify({ skip: true }) }),
  topic: (topic: TopicId) => call<TopicPage>(`/api/topics/${topic}`),
  profiles: () => call<Profile[]>('/api/profiles'),
  profile: (userId: string) => call<ProfilePage>(`/api/users/${userId}/profile`),
  profileByUsername: (username: string) => call<ProfilePage>(`/api/users/by-username/${encodeURIComponent(username)}`),
  setPicture: (which: 'avatar' | 'wallpaper', file: File | null) => {
    const form = new FormData();
    if (file) form.set('image', file);
    return call<User>(`/api/me/${which}`, { method: 'POST', body: form });
  },
  setProfile: (publicProfile: boolean, bio: string) => call<User>('/api/me/profile', { method: 'POST', body: JSON.stringify({ publicProfile, bio }) }),
  plan: () => call<PlanState>('/api/me/plan'),
  // a purchase carries the buyer's express consent to access at once (asked in the app before Checkout)
  setPlan: (plan: PlanName, consent = false) => call<PlanState>('/api/me/plan', { method: 'POST', body: JSON.stringify({ plan, consent }) }),
  buyStorage: (space: Space, consent = false) => call<PlanState>('/api/me/storage', { method: 'POST', body: JSON.stringify({ space, consent }) }),
  archive: () => call<PostSummary[]>('/api/me/archive'),
  setLife: (postId: string, life: number | null | 'end') => call<Post>(`/api/posts/${postId}/life`, { method: 'POST', body: JSON.stringify({ life }) }),
  deletePost: (postId: string) => call<{ ok: boolean }>(`/api/posts/${postId}`, { method: 'DELETE' }),
  search: (q: string) => call<Profile[]>(`/api/search?q=${encodeURIComponent(q)}`),
  publicPosts: (userId: string) => call<PostSummary[]>(`/api/users/${userId}/public`),
  subscription: () => call<{ price: number; subscribers: number }>('/api/me/subscription'),
  setPrice: (euros: number) => call<{ price: number; subscribers: number }>('/api/me/price', { method: 'POST', body: JSON.stringify({ price: euros }) }),
  subscribe: (authorId: string, consent = false) => call<{ ok: boolean }>(`/api/subscribe/${authorId}`, { method: 'POST', body: JSON.stringify({ back: location.pathname, consent }) }),
  unsubscribe: (authorId: string) => call<{ ok: boolean; until?: number }>(`/api/unsubscribe/${authorId}`, { method: 'POST' }),
  purchases: () => call<PurchaseEntry[]>('/api/me/purchases'),
  withdraw: (purchaseId: string) => call<PurchaseEntry[]>(`/api/me/withdraw/${purchaseId}`, { method: 'POST' }),
  deleteAccount: (password: string) => call<{ ok: boolean }>('/api/me/delete', { method: 'POST', body: JSON.stringify({ password }) }),
  uploads: () => call<{ direct: boolean; partSize: number }>('/api/uploads'),
  uploadStart: (name: string, size: number, resume?: { key: string; uploadId: string }) =>
    call<{ key: string; uploadId: string; done: { PartNumber: number; ETag: string }[] }>('/api/uploads/start', { method: 'POST', body: JSON.stringify({ name, size, resume }) }),
  uploadParts: (key: string, uploadId: string, parts: number[]) => call<{ urls: string[] }>('/api/uploads/parts', { method: 'POST', body: JSON.stringify({ key, uploadId, parts }) }),
  uploadFinish: (key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) =>
    call<{ key: string; size: number }>('/api/uploads/finish', { method: 'POST', body: JSON.stringify({ key, uploadId, parts }) }),
  confirmPayment: (session: string) => call<{ ok: boolean; kind?: string; postId?: string }>('/api/pay/confirm', { method: 'POST', body: JSON.stringify({ session }) }),
  payouts: () => call<Payouts>('/api/me/payouts'),
  linkPayouts: () => call<{ checkout: string }>('/api/me/payouts', { method: 'POST' }),
  buy: (postId: string, consent = false) => call<{ ok: boolean }>(`/api/posts/${postId}/buy`, { method: 'POST', body: JSON.stringify({ consent }) }),
  report: (postId: string, reason: string) => call<{ ok: boolean }>(`/api/posts/${postId}/report`, { method: 'POST', body: JSON.stringify({ reason }) }),
  leaveNote: (postId: string, text: string, recipients: string[]) =>
    call<Note>(`/api/posts/${postId}/notes`, { method: 'POST', body: JSON.stringify({ text, recipients }) }),
  seenNote: (noteId: string) => call<{ ok: boolean }>(`/api/notes/${noteId}/seen`, { method: 'POST' }),
  // (a visitor who is not signed in also gets the people in it: they know no one else)
  post: (id: string) => call<{ post: Post; messages: Message[]; present: string[]; notes: Note[]; people?: User[] }>(`/api/posts/${id}`),
  publish: (form: FormData) => call<Post>('/api/posts', { method: 'POST', body: form }),
  // moderation: moderators only (the server checks every call)
  modQueue: () => call<ModQueue>('/api/mod/queue'),
  modLog: () => call<LogEntry[]>('/api/mod/log'),
  decidePost: (postId: string, action: PostAction, rule: Rule | undefined, reason: string) => call<Decision>(`/api/mod/posts/${postId}`, { method: 'POST', body: JSON.stringify({ action, rule, reason }) }),
  suspend: (username: string, rule: Rule, reason: string, until: number | null) => call<Decision>('/api/mod/suspend', { method: 'POST', body: JSON.stringify({ username, rule, reason, until }) }),
  unsuspend: (userId: string, reason: string) => call<Decision>('/api/mod/unsuspend', { method: 'POST', body: JSON.stringify({ userId, reason }) }),
  decideComplaint: (complaintId: string, outcome: 'upheld' | 'reversed', reason: string) => call<Decision>(`/api/mod/complaints/${complaintId}`, { method: 'POST', body: JSON.stringify({ outcome, reason }) }),
  closeNotice: (noticeId: string, reason: string) => call<{ ok: boolean }>(`/api/mod/notices/${noticeId}`, { method: 'POST', body: JSON.stringify({ reason }) }),
  // a complaint about a decision: its person signed in, or the link from the statement of reasons (token)
  complaint: (decisionId: string, token?: string) => call<ComplaintPage>(`/api/complaints/${decisionId}${token ? `?token=${encodeURIComponent(token)}` : ''}`),
  complain: (decisionId: string, text: string, token?: string) => call<ComplaintPage>(`/api/complaints/${decisionId}`, { method: 'POST', body: JSON.stringify({ text, token }) }),
  // a notice from anyone, an account or not (/report-content)
  sendNotice: (n: { email: string; url: string; reason: Rule; explanation: string; goodFaith: boolean }) => call<{ ok: boolean }>('/api/notices', { method: 'POST', body: JSON.stringify(n) }),
  // groups: friend groups (private, by invitation) and interest groups (open, around a topic)
  groups: () => call<GroupsOverview>('/api/groups'),
  groupsPending: () => call<{ invitations: number; toApprove: number }>('/api/groups/pending'),
  groupSuggestions: () => call<Group[]>('/api/groups/suggestions'),
  searchGroups: (q: string) => call<Group[]>(`/api/groups/search?q=${encodeURIComponent(q)}`),
  createGroup: (g: { kind: GroupKind; name: string; description: string; topic?: TopicId; picture?: File | null }) => {
    const form = new FormData();
    form.set('kind', g.kind);
    form.set('name', g.name);
    form.set('description', g.description);
    if (g.topic) form.set('topic', g.topic);
    if (g.picture) form.set('picture', g.picture);
    return call<Group>('/api/groups', { method: 'POST', body: form });
  },
  group: (id: string) => call<GroupPage>(`/api/groups/${id}`),
  updateGroup: (id: string, name: string, description: string) => call<GroupPage>(`/api/groups/${id}`, { method: 'POST', body: JSON.stringify({ name, description }) }),
  setGroupPicture: (id: string, file: File | null) => {
    const form = new FormData();
    if (file) form.set('picture', file);
    return call<GroupPage>(`/api/groups/${id}/picture`, { method: 'POST', body: form });
  },
  deleteGroup: (id: string) => call<{ ok: boolean }>(`/api/groups/${id}/delete`, { method: 'POST', body: JSON.stringify({ confirm: true }) }),
  inviteToGroup: (id: string, who: { username?: string; userId?: string }) => call<GroupPage>(`/api/groups/${id}/invite`, { method: 'POST', body: JSON.stringify(who) }),
  groupInvite: (id: string, userId: string, action: 'approve' | 'cancel') => call<GroupPage>(`/api/groups/${id}/invites/${userId}/${action}`, { method: 'POST' }),
  acceptInvite: (id: string) => call<GroupPage>(`/api/groups/${id}/accept`, { method: 'POST' }),
  declineInvite: (id: string) => call<{ ok: boolean }>(`/api/groups/${id}/decline`, { method: 'POST' }),
  joinGroup: (id: string) => call<GroupPage>(`/api/groups/${id}/join`, { method: 'POST' }),
  // the last admin names who follows them, or deletes the group (409 last-admin otherwise)
  leaveGroup: (id: string, opts: { successor?: string; delete?: boolean } = {}) => call<{ ok: boolean; deleted?: boolean }>(`/api/groups/${id}/leave`, { method: 'POST', body: JSON.stringify(opts) }),
  groupMember: (id: string, userId: string, action: 'remove' | 'admin' | 'ban' | 'unban') => call<GroupPage>(`/api/groups/${id}/members/${userId}/${action}`, { method: 'POST' }),
  removeGroupPost: (id: string, postId: string) => call<GroupPage>(`/api/groups/${id}/posts/${postId}/remove`, { method: 'POST' }),
};

export const api: typeof realApi = MOCK ? mockApi : realApi;
