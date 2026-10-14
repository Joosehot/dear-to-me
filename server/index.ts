// Dear to Me, the prototype's server: the API, uploaded videos, and the live conversations.
//
// Who is asking is the session cookie and nothing else: an email and a password sign in, and the
// socket is signed in by the same cookie. Every API request that changes something carries the
// header x-d2m: 1, which another site's page cannot send without asking (CORS), so it cannot act
// for a signed-in visitor. Without a session only what is public may be read (`viewer`): a public
// profile and a live public post, as anyone sees them; nothing changes and no socket opens.
//
// D2M_DEMO=1 (npm run dev, the checks): the demo people and their posts on a fresh start, and they
// sign in as <name>@demo.d2m with one shared password. Without it a fresh start is empty.
// D2M_TRUST_PROXY=1: behind a proxy (the client's address and https from its headers); 2: behind two
// (Cloudflare's proxy in front of Caddy).
// D2M_ORIGIN=https://deartome.fi: the site's public address, for the canonical addresses, the sitemap,
// the link previews and the way back from Stripe (none: the request's own host).
// NODE_ENV=production (the Docker image): the demo is refused, and a missing D2M_ORIGIN is warned of.
// Email (server/mail.ts): MAIL_PROVIDER=cloudflare with CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_TOKEN and
// MAIL_FROM sends through Cloudflare Email Service; without them messages go to the log and an outbox,
// which D2M_DEMO=1 or D2M_MAIL=log lets GET /api/dev/outbox read (never in production).
// D2M_BETA=1: a closed beta (a slim banner says so); D2M_INVITE_CODES=a,b: sign-up then needs one of them.
// D2M_MODERATORS=joose,aino: the usernames that moderate (the queue at /mod, every /api/mod/* endpoint); in
// demo mode without it, @joose.

import express from 'express';
import multer from 'multer';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { DEMO_NAMES, DEMO_PASSWORD, Store, demoEmail, id, type LogRow } from './store.js';
import * as auth from './auth.js';
import { MAX_PRICE } from '../shared/pricing.js';
import { LIFE_CHOICES, PLANS, POST_PRICE, beyondLite, isLive, liteLife, sellsPosts, sellsSubscriptions, type PlanName, type Space } from '../shared/plans.js';
import { COMPLAINT_MONTHS, DAY, REFUND_DAYS, WITHDRAWAL_DAYS } from '../shared/terms.js';
import * as video from './video.js';
import * as media from './media.js';
import { offload, onR2, remove, signed } from './media.js';
import * as pay from './pay.js';
import * as mail from './mail.js';
import * as seo from './seo.js';
import { securityHeaders } from './security.js';
import type Stripe from 'stripe';
import { normalUsername, usernameProblem, type UsernameReason } from '../shared/usernames.js';
import type { ClientEvent, Config, Group, GroupKind, GroupPage, GroupsOverview, Post, PostSummary, Profile, ProfilePage, PurchaseEntry, ServerEvent, TopicPage, User, UsernameCheck } from '../shared/types.js';
import { GROUP_NAME_MAX, cleanGroupDescription, cleanGroupName } from '../shared/groups.js';
import { isTopic } from '../shared/topics.js';
import { MAX_POST_TOPICS } from '../shared/interests.js';
import { POST_ACTIONS, REPORT_REASONS, RESTRICTING, isRule, type ComplaintPage, type Decision, type PostAction, type ReportReason } from '../shared/moderation.js';
import { parseModerators } from './moderation.js';

const root = path.resolve(import.meta.dirname, '..');
// D2M_DATA: where the data lives (the checks run on a fresh folder of their own)
const dataDir = process.env.D2M_DATA ? path.resolve(process.env.D2M_DATA) : path.join(root, 'data');
const uploads = path.join(dataDir, 'uploads');
fs.mkdirSync(uploads, { recursive: true });
const demo = process.env.D2M_DEMO === '1';
const production = process.env.NODE_ENV === 'production';
// the demo people sign in with a published password: never on the real site (checked before the
// store, so not even the seed is written)
if (demo && production) {
  console.error('Refusing to start: D2M_DEMO=1 with NODE_ENV=production (the demo sign-in is public). Remove D2M_DEMO.');
  process.exit(1);
}
// the dev outbox shows the links that sign people in: never on the real site
if (mail.logOnly && production) {
  console.error('Refusing to start: D2M_MAIL=log with NODE_ENV=production (the dev outbox shows the links that reset passwords). Remove D2M_MAIL.');
  process.exit(1);
}
if (mail.problem) {
  console.error(`Refusing to start: ${mail.problem}.`);
  process.exit(1);
}
if (production && mail.provider === 'log' && !mail.consoleOnly) console.warn('warning: no email provider (MAIL_PROVIDER=cloudflare and its settings): verification and password reset emails are not sent, only logged');
const beta = process.env.D2M_BETA === '1';
/** The invite codes sign-up asks for in a closed beta (none: open sign-up). */
const inviteCodes = beta ? (process.env.D2M_INVITE_CODES ?? '').split(',').map((c) => c.trim()).filter(Boolean) : [];
if (!beta && process.env.D2M_INVITE_CODES?.trim()) console.warn('warning: D2M_INVITE_CODES is set without D2M_BETA=1: sign-up is open');
if (production && !process.env.D2M_ORIGIN) console.warn('warning: D2M_ORIGIN is not set: canonical addresses, the sitemap and the way back from Stripe use the request’s own host');
if (pay.stripe && !pay.webhookSecret) console.warn('warning: payments are on but STRIPE_WEBHOOK_SECRET is not set: the Stripe webhook is off');
const store = new Store(path.join(dataDir, 'db.sqlite'), uploads, demo);
/** The moderators' usernames (D2M_MODERATORS; in demo mode without it, joose). */
const moderators = parseModerators(process.env.D2M_MODERATORS, demo);
for (const u of moderators) if (!store.byUsername(u)) console.warn(`warning: D2M_MODERATORS names @${u}, who has no account: whoever signs up as @${u} will moderate`);

const app = express();
// one failing request (an async handler that throws, SQLite busy) must not take the server down
process.on('unhandledRejection', (e) => console.error('unhandled:', e));
// how many proxies in front ('1': Caddy; '2': Cloudflare's proxy and Caddy)
const proxies = Number(process.env.D2M_TRUST_PROXY) || 0;
if (proxies > 0) app.set('trust proxy', proxies);
app.disable('x-powered-by');
app.use(securityHeaders());
// Stripe's webhook: before the JSON parser (the signature is over the raw body), and outside the
// x-d2m rule and the session cookie (Stripe sends neither; its signature is what counts)
app.post('/api/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => void stripeWebhook(req, res));
app.use(express.json({ limit: '1mb' }));
// for uptime checks and the container's healthcheck: the server answers and the database reads
app.get('/api/health', (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json({ ok: store.ping() });
  } catch (e) {
    res.status(503).json({ ok: false, error: (e as Error).message });
  }
});
// a change through the API needs x-d2m: 1 (a form or a script on another site cannot send it)
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.header('x-d2m') === '1') return next();
  res.status(403).json({ error: 'x-d2m header missing' });
});
app.use('/uploads', express.static(uploads));
// media moved to R2: a redirect to a short-lived signed address (the bucket stays private)
app.get('/media/:name', async (req, res) => {
  const to = await signed(req.params.name).catch(() => null);
  if (!to) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=600').redirect(302, to);
});
// every request first lets the posts whose time is up go (Lite) or into the archive (the paid plans)
let lastUploadSweep = 0;
app.use('/api', (_req, _res, next) => {
  store.sweep();
  // now and then: videos uploaded a day ago and never put into a post go from the bucket, and
  // originals replaced by their smaller copies an hour ago
  if (Date.now() - lastUploadSweep > 10 * 60 * 1000) {
    lastUploadSweep = Date.now();
    for (const url of store.dueRemovals()) void remove(url, uploads);
    for (const u of store.staleUploads(24 * 60 * 60 * 1000)) {
      store.dropUpload(u.key);
      void (u.size === undefined ? media.abortParts(u.key, u.uploadId) : remove(`/media/${u.key}`, uploads));
    }
  }
  next();
});

/** Pictures and GIFs among a blog's text, at most. */
const MAX_PICTURES = 10;

const upload = multer({
  storage: multer.diskStorage({
    destination: uploads,
    filename: (_req, file, cb) => cb(null, id() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  // the video is a video; the cover and the pictures among the text are images (GIFs too)
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith(file.fieldname === 'video' ? 'video/' : 'image/')),
});

/** The session a cookie header carries: its token's hash and its user. */
function session(cookieHeader: string | undefined) {
  const token = auth.sessionToken(cookieHeader);
  if (!token) return undefined;
  const hash = auth.tokenHash(token);
  const user = store.sessionUser(hash);
  return user && { hash, user };
}

/** Who is asking: the user of the session cookie, or a 401. */
function me(req: express.Request, res: express.Response) {
  const user = session(req.headers.cookie)?.user;
  if (!user) res.status(401).json({ error: 'not signed in' });
  return user;
}

/** Who is asking, if anyone: the user of the session cookie, or null for a visitor who is not signed
 * in. Only the few reads open to anyone use it (a public profile, a live public post), and each says
 * exactly what a null viewer may have; everything else asks `me`. */
function viewer(req: express.Request): User | null {
  return session(req.headers.cookie)?.user ?? null;
}

/** Signed in before anything else (an upload is not written to disk for no one). */
const signedIn: express.RequestHandler = (req, res, next) => {
  if (me(req, res)) next();
};

// --- live presence: who is in each post's conversation right now ---
const rooms = new Map<string, Map<WebSocket, string>>();
const sockets = new Map<WebSocket, string>();
/** each socket's session (its token's hash): signing out closes them */
const socketSessions = new Map<WebSocket, string>();

function present(postId: string) {
  return [...new Set(rooms.get(postId)?.values() ?? [])];
}

function send(ws: WebSocket, e: ServerEvent) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(e));
}

/** To everyone who can see the post (so the feed shows who is talking), not only those in it. */
function toReaders(post: Post, e: ServerEvent) {
  for (const [ws, userId] of sockets) if (store.canSee(userId, post)) send(ws, e);
}

function toUsers(userIds: string[], e: ServerEvent) {
  for (const [ws, userId] of sockets) if (userIds.includes(userId)) send(ws, e);
}

function presenceChanged(postId: string) {
  const post = store.post(postId);
  if (post) toReaders(post, { type: 'presence', postId, present: present(postId) });
}

// --- signing up, in and out ---
// errors carry a code the client words in its own language

app.get('/api/config', (_req, res) => {
  const config: Config = demo ? { demo, demoEmails: DEMO_NAMES.map(demoEmail), demoPassword: DEMO_PASSWORD } : { demo };
  config.payments = pay.mode;
  if (beta) config.beta = true;
  if (inviteCodes.length) config.invite = true;
  res.json(config);
});

/** You as you see yourself: your user, with your email, whether it is confirmed, and an address you
 * asked to change to (never sent about anyone else). */
function self(userId: string): User | undefined {
  const user = store.user(userId);
  const account = store.authAccount(userId);
  if (!user || !account) return user;
  const pending = store.pendingEmail(userId);
  return { ...user, email: account.email, verified: !!account.verifiedAt, ...(pending ? { pendingEmail: pending } : {}), ...(isModerator(user) ? { moderator: true } : {}) };
}

/** Buying, subscribing, selling and a public profile wait for a confirmed email: true, or a 403 verify-email. */
function verifiedOr403(res: express.Response, userId: string) {
  if (store.verified(userId)) return true;
  res.status(403).json({ error: 'confirm your email address first', code: 'verify-email' });
  return false;
}

// ---------------- links by email: confirming an address, a new password ----------------

const VERIFY_MS = 24 * 60 * 60 * 1000;
const RESET_MS = 60 * 60 * 1000;

/** A link with a fresh token of a kind for the user and the address, mailed to that address (not
 * waited for: the answer does not hang on the provider). Only the token's hash is kept. */
function mailLink(req: express.Request, userId: string, kind: 'verify' | 'reset', email: string, change = false) {
  const token = auth.newToken();
  store.addEmailToken(auth.tokenHash(token), userId, kind, email, kind === 'verify' ? VERIFY_MS : RESET_MS);
  const url = `${siteOrigin(req)}/${kind}?token=${token}`;
  void mail.send({ to: email, ...(kind === 'verify' ? mail.verifyMessage(url, change) : mail.resetMessage(url)) });
}

/** A brake over a window: at most `max` in `windowMs` for each key (in memory). Whether this one is too many. */
function limiter(max: number, windowMs: number) {
  const seen = new Map<string, number[]>();
  setInterval(() => {
    const now = Date.now();
    for (const [key, list] of seen) if (list.every((at) => at <= now - windowMs)) seen.delete(key);
  }, Math.min(windowMs, 10 * 60 * 1000)).unref();
  return (key: string, now = Date.now()) => {
    const list = (seen.get(key) ?? []).filter((at) => at > now - windowMs);
    list.push(now);
    seen.set(key, list);
    return list.length > max;
  };
}

// asking for a new password: 20 an hour from an address, 3 an hour for an email (counted whether it
// has an account or not, so a 429 tells nothing either)
const tooManyForgotFromIp = limiter(20, 60 * 60 * 1000);
const tooManyForgotForEmail = limiter(3, 60 * 60 * 1000);
// a verification sent again: one a minute, five an hour, for each user; an email change the same
const tooSoonToResend = limiter(1, 60 * 1000);
const tooManyResends = limiter(5, 60 * 60 * 1000);
const tooManyEmailChanges = limiter(5, 60 * 60 * 1000);

// "forgot your password?": the same answer whether the email has an account or not
app.post('/api/password/forgot', (req, res) => {
  const email = auth.normalEmail(req.body?.email);
  if (!auth.validEmail(email)) return res.status(400).json({ error: 'a valid email is needed', code: 'email' });
  // (both counted every time, so the address cannot ask on and on while one email is braked)
  const fromIp = tooManyForgotFromIp(req.ip ?? '');
  const forEmail = tooManyForgotForEmail(email);
  if (fromIp || forEmail) return res.status(429).json({ error: 'too many requests, try again later', code: 'too-many' });
  const account = store.account(email);
  if (account) mailLink(req, account.userId, 'reset', email);
  res.json({ ok: true });
});

// a new password through the link: every session of the account ends (its sockets too), and this
// browser is signed in afresh
app.post('/api/password/reset', async (req, res) => {
  const token = String(req.body?.token ?? '');
  const password = String(req.body?.password ?? '');
  if (password.length < auth.MIN_PASSWORD) return res.status(400).json({ error: `a password of at least ${auth.MIN_PASSWORD} characters is needed`, code: 'short-password' });
  if (password.length > auth.MAX_PASSWORD) return res.status(400).json({ error: `a password of at most ${auth.MAX_PASSWORD} characters`, code: 'long-password' });
  const hashed = await auth.hashPassword(password);
  const userId = token ? store.resetPassword(auth.tokenHash(token), hashed) : undefined;
  if (!userId) return res.status(400).json({ error: 'the link is not valid any more: ask for a new one', code: 'token' });
  for (const [ws, id] of sockets) if (id === userId) ws.close(4001, 'password changed');
  const account = store.authAccount(userId);
  if (account) auth.succeeded(account.email);
  // a suspended account gets a new password but no session
  if (store.suspension(userId)) return refuseSuspended(req, res, userId);
  // this browser's old session (if it had one) ended with the rest
  startSession(req, res, userId);
  res.json(self(userId));
});

// a verification link opened (signed in or not): the address confirmed, or the new one taken into use
app.post('/api/email/verify', (req, res) => {
  const token = String(req.body?.token ?? '');
  const done = token ? store.verifyEmail(auth.tokenHash(token)) : undefined;
  if (done === 'taken') return res.status(409).json({ error: 'that email already has an account', code: 'email-taken' });
  if (!done) return res.status(400).json({ error: 'the link is not valid any more', code: 'token' });
  if (done.changed) console.log(`email: a user changed their address (${done.userId})`);
  res.json({ ok: true, email: done.email, changed: done.changed });
});

// the verification sent again: to the address being changed to, if there is one; otherwise to your own
app.post('/api/email/resend', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const account = store.authAccount(user.id);
  const pending = store.pendingEmail(user.id);
  if (!account || (account.verifiedAt && !pending)) return res.status(400).json({ error: 'nothing to confirm', code: 'verified' });
  const soon = tooSoonToResend(user.id);
  const many = tooManyResends(user.id);
  if (soon || many) return res.status(429).json({ error: 'wait a minute before sending it again', code: 'too-many' });
  mailLink(req, user.id, 'verify', pending ?? account.email, !!pending);
  res.json({ ok: true });
});

// change your email, with your password: a link goes to the new address and the account changes once
// it is followed; the old address is told of it at once
app.post('/api/me/email', async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const account = store.authAccount(user.id);
  const email = auth.normalEmail(req.body?.email);
  const password = String(req.body?.password ?? '').slice(0, auth.MAX_PASSWORD + 1);
  if (!account || !(await auth.verifyPassword(password, account.password))) return res.status(403).json({ error: 'wrong password', code: 'wrong-password' });
  if (!auth.validEmail(email)) return res.status(400).json({ error: 'a valid email is needed', code: 'email' });
  if (email === account.email) return res.status(400).json({ error: 'that is your email already', code: 'same-email' });
  if (store.account(email)) return res.status(409).json({ error: 'that email already has an account', code: 'email-taken' });
  if (tooManyEmailChanges(user.id)) return res.status(429).json({ error: 'too many changes, try again later', code: 'too-many' });
  mailLink(req, user.id, 'verify', email, true);
  void mail.send({ to: account.email, ...mail.changeNoticeMessage(email) });
  res.json(self(user.id));
});

// development and the checks only: the mail that was not sent (D2M_DEMO=1 or D2M_MAIL=log, never in production)
if ((demo || mail.logOnly) && !production && mail.provider === 'log')
  app.get('/api/dev/outbox', (req, res) => {
    res.set('Cache-Control', 'no-store').json(mail.outbox(req.query.to ? String(req.query.to) : undefined));
  });

/** A new session for the user, in a cookie. */
function startSession(req: express.Request, res: express.Response, userId: string) {
  const token = auth.newToken();
  store.addSession(auth.tokenHash(token), userId, auth.SESSION_DAYS);
  auth.setSessionCookie(req, res, token);
}

/** A username refused: 400 username-invalid (against the rule), or 409 username-taken; the reason beside the code. */
function refuseUsername(res: express.Response, reason: UsernameReason) {
  if (reason === 'taken') return res.status(409).json({ error: 'that username is taken', code: 'username-taken', reason });
  res.status(400).json({ error: `that username cannot be had (${reason})`, code: 'username-invalid', reason });
}

app.post('/api/signup', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const username = normalUsername(req.body?.username);
  const email = auth.normalEmail(req.body?.email);
  const password = String(req.body?.password ?? '');
  const refuse = (code: string, error: string, status = 400) => res.status(status).json({ error, code });
  if (!name || name.length > 40) return refuse('name', 'a name of 1 to 40 characters is needed');
  const wrong = usernameProblem(username);
  if (wrong) return refuseUsername(res, wrong);
  if (!auth.validEmail(email)) return refuse('email', 'a valid email is needed');
  if (password.length < auth.MIN_PASSWORD) return refuse('short-password', `a password of at least ${auth.MIN_PASSWORD} characters is needed`);
  if (password.length > auth.MAX_PASSWORD) return refuse('long-password', `a password of at most ${auth.MAX_PASSWORD} characters`);
  if (req.body?.terms !== true) return refuse('terms', 'the terms of use and the privacy policy must be accepted');
  // a closed beta: one of the invite codes (any case), kept with the account as it is configured
  const code = String(req.body?.invite ?? '').trim().toLowerCase();
  const invite = inviteCodes.find((c) => c.toLowerCase() === code);
  if (inviteCodes.length && !invite) return refuse('invite', 'an invite code is needed', 403);
  const hashed = await auth.hashPassword(password);
  // checked after the hashing, so no one else took the username or the email meanwhile
  const taken = store.usernameRefused(username);
  if (taken) return refuseUsername(res, taken);
  if (store.account(email)) return refuse('email-taken', 'that email already has an account', 409);
  const user = store.signUp(name, username, email, hashed, invite, mail.consoleOnly);
  startSession(req, res, user.id);
  // the app is open at once; the link confirms the address (buying and selling wait for it)
  if (!mail.consoleOnly) mailLink(req, user.id, 'verify', email);
  res.json(self(user.id));
});

app.post('/api/login', async (req, res) => {
  const email = auth.normalEmail(req.body?.email);
  const password = String(req.body?.password ?? '').slice(0, auth.MAX_PASSWORD + 1);
  const ip = req.ip ?? '';
  if (auth.throttled(ip, email)) return res.status(429).json({ error: 'too many failed sign-ins, try again in 15 minutes', code: 'too-many' });
  const account = store.account(email);
  const right = account ? await auth.verifyPassword(password, account.password) : await auth.wasteTime(password);
  const user = right && account ? store.user(account.userId) : undefined;
  if (!user) {
    auth.failed(ip, email);
    return res.status(401).json({ error: 'wrong email or password', code: 'wrong-login' });
  }
  auth.succeeded(email);
  // suspended: told why (only after the right password), with a fresh link to complain while there is time
  if (store.suspension(user.id)) return refuseSuspended(req, res, user.id);
  startSession(req, res, user.id);
  res.json(self(user.id));
});

app.post('/api/logout', (req, res) => {
  const s = session(req.headers.cookie);
  if (s) {
    store.dropSession(s.hash);
    // the sockets of this session close too
    for (const [ws, hash] of socketSessions) if (hash === s.hash) ws.close(4001, 'signed out');
  }
  auth.clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const user = me(req, res);
  if (user) res.json(self(user.id));
});

// --- usernames ---

/** A brake on what is open before signing in: at most `perMinute` requests a minute from each
 * address (in memory). The brake says whether this request is one too many. */
function brake(perMinute: number) {
  const seen = new Map<string, number[]>();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, list] of seen) if (list.every((at) => at <= now - 60_000)) seen.delete(ip);
  }, 60_000).unref();
  return (ip: string, now = Date.now()) => {
    const list = (seen.get(ip) ?? []).filter((at) => at > now - 60_000);
    list.push(now);
    seen.set(ip, list);
    return list.length > perMinute;
  };
}

// the live check is open before signing in, so it is braked a little
const tooManyChecks = brake(60);
// the public pages' data, read without signing in: braked lightly, to slow scraping
const tooManyReads = brake(120);

/** A read by a visitor who is not signed in may go on (or it got a 429: too many from this address). */
function anonymousRead(req: express.Request, res: express.Response) {
  if (!tooManyReads(req.ip ?? '')) return true;
  res.status(429).json({ error: 'too many requests, wait a minute', code: 'too-many' });
  return false;
}

/** Someone as a visitor who is not signed in sees them: their name, @username, colour and picture;
 * with a public profile also their bio and wallpaper; the price of the subscription they sell, and a
 * paid plan (it tells how long their posts stay). Never their packs, an email or their friends. */
function publicUser(u: User): User {
  const shown: User = { id: u.id, name: u.name, username: u.username, color: u.color, avatarUrl: u.avatarUrl };
  if (u.publicProfile) Object.assign(shown, { publicProfile: true, bio: u.bio, wallpaperUrl: u.wallpaperUrl });
  if (u.price) shown.price = u.price;
  if (u.plan && u.plan !== 'lite') shown.plan = u.plan;
  return shown;
}

// can this username be had (signed in: by you, your own and your held ones too), and a free one like it if not
app.get('/api/username/:name', (req, res) => {
  if (tooManyChecks(req.ip ?? '')) return res.status(429).json({ error: 'too many checks, wait a minute', code: 'too-many' });
  const userId = session(req.headers.cookie)?.user.id;
  const username = normalUsername(req.params.name);
  const reason = store.usernameRefused(username, userId);
  const check: UsernameCheck = reason ? { available: false, reason } : { available: true };
  // a suggestion only for a name that is someone's (one against the rule is the person's to fix)
  if (reason === 'taken' || reason === 'reserved') check.suggestion = store.usernameLike(username, userId);
  res.json(check);
});

// change your username: the old one is held for you for 30 days (no one else may take it meanwhile)
app.post('/api/me/username', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  // a moderator is one by username (D2M_MODERATORS): theirs is not let go for someone else to take
  if (isModerator(user)) return res.status(403).json({ error: 'a moderator keeps their username (D2M_MODERATORS names it)', code: 'moderator-username' });
  const reason = store.setUsername(user.id, normalUsername(req.body?.username));
  if (reason) return refuseUsername(res, reason);
  res.json(store.user(user.id));
});

// --- the API ---
// names, usernames and pictures of everyone, for the signed-in (never an email or a password: those are not on a User)
app.get('/api/users', (req, res) => {
  if (me(req, res)) res.json(store.users());
});

app.get('/api/friends', (req, res) => {
  const user = me(req, res);
  if (user) res.json(store.friendsOf(user.id));
});

app.post('/api/friends', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  // by username (display names are not unique), @ or not
  const username = normalUsername(req.body?.username);
  const other = username ? store.byUsername(username) : undefined;
  if (!other) return res.status(404).json({ error: `no one is @${username}`, code: 'no-username' });
  store.befriend(user.id, other.id);
  res.json(store.friendsOf(user.id));
});

app.get('/api/feed', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  res.json(store.friendsFeed(user.id).map((p) => summary(p, user.id)));
});

// For You: public posts by anyone (paid ones locked for non-subscribers), ordered for your
// interests, each with why it is there
app.get('/api/fyp', (req, res) => {
  const user = me(req, res);
  if (user) res.json(store.forYou(user.id).map(({ post, ranked }) => ({ ...summary(post, user.id), because: ranked.because })));
});

// your interests: private, only you ever get them (they order your For You)
app.get('/api/me/interests', (req, res) => {
  const user = me(req, res);
  if (user) res.json(store.interests(user.id));
});

// save them (known topics, your own words), or skip the step after sign-up (it is not shown again)
app.post('/api/me/interests', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  res.json(req.body?.skip === true ? store.skipInterests(user.id) : store.setInterests(user.id, req.body?.topics, req.body?.words));
});

// a topic: its public posts, newest first, and the people with a public profile who write about it most
app.get('/api/topics/:topic', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const topic = req.params.topic;
  if (!isTopic(topic)) return res.status(404).json({ error: 'no such topic' });
  const { posts, writers } = store.byTopic(user.id, topic);
  const page: TopicPage = { topic, posts: posts.map((p) => summary(p, user.id)), writers: writers.map((u) => profileOf(user.id, u)) };
  res.json(page);
});

// search people by name or @username: who they are to you, and what they make public
app.get('/api/search', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const found: Profile[] = store.search(user.id, String(req.query.q ?? '')).map((u) => profileOf(user.id, u));
  res.json(found);
});

/** Someone as this user sees them: a friend, subscribed (until when, if cancelled), their public posts. */
function profileOf(userId: string, u: User): Profile {
  return { user: u, friend: store.areFriends(userId, u.id), subscribed: store.subscribed(userId, u.id), subscribedUntil: store.subscribedUntil(userId, u.id), publicPosts: store.publicPosts(u.id).length };
}

// ---------------- plans ----------------
app.get('/api/me/plan', (req, res) => {
  const user = me(req, res);
  if (user) res.json(store.planState(user.id));
});

/** Where the buyer came from, to send them back after Checkout (the site's own address, if set). */
const origin = (req: express.Request) => (process.env.D2M_ORIGIN ? siteOrigin(req) : (req.get('origin') ?? siteOrigin(req)));

/** This site's address for links that leave the page (canonical, sitemap, Stripe): D2M_ORIGIN, or the request's host. */
const siteOrigin = (req: express.Request) => process.env.D2M_ORIGIN?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;

/** Answer with a Stripe Checkout page to go to, or the error Stripe gave. */
async function toCheckout(res: express.Response, run: () => Promise<string>) {
  try {
    res.json({ checkout: await run() });
  } catch (e) {
    res.status(502).json({ error: `Stripe: ${(e as Error).message}` });
  }
}

/** A purchase starts only with the buyer's express consent, given in the app before Checkout: access
 * at once (a single post: the right of withdrawal ends; a monthly contract: a withdrawal refunds
 * only the unused part). Its time, or a 400. */
function consented(req: express.Request, res: express.Response) {
  if (req.body?.consent === true) return Date.now();
  res.status(400).json({ error: 'express consent to access at once is needed', code: 'consent' });
}

/** With payments off, a purchase is granted free; the log has it all the same. */
function logFree(req: express.Request, userId: string, kind: LogRow['kind'], item: string) {
  store.logPurchase({ userId, kind, item, amount: 0, consentAt: req.body?.consent === true ? Date.now() : undefined });
}

/** Every reader's Stripe subscription to an author ends at once (they would go on being charged). */
async function cancelReaders(authorId: string) {
  await Promise.all(store.readerSubscriptions({ author: authorId }).map((s) => pay.cancel(s)));
}

/** An author stops selling their monthly subscription: at Stripe, and the readers' subscriptions here. */
async function stopSelling(authorId: string) {
  await cancelReaders(authorId);
  store.dropSubscribers(authorId);
}

/** Every plan change goes here: leaving Unlimited stops selling the subscription (setPlan ends the
 * readers' subscriptions here, once Stripe's are cancelled). */
async function changePlan(userId: string, plan: PlanName) {
  if (plan !== 'pro') await cancelReaders(userId);
  store.setPlan(userId, plan);
}

/** Back to Lite: the plan's and the packs' monthly payments end at once (setPlan forgets their ids). */
async function toLite(userId: string) {
  await Promise.all([pay.cancel(store.planSubscription(userId)), ...store.packSubscriptions(userId).map((s) => pay.cancel(s))]);
  await changePlan(userId, 'lite');
}

// change plan: to Lite at once (its monthly payments end); to a paid plan through Stripe Checkout
// (with payments off, at once and free)
app.post('/api/me/plan', async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const plan: PlanName = req.body?.plan === 'pro' || req.body?.plan === 'exclusive' ? req.body.plan : 'lite';
  const changed = plan !== store.planOf(user.id);
  if (plan !== 'lite' && changed && !verifiedOr403(res, user.id)) return;
  if (pay.stripe && plan !== 'lite' && changed) {
    const consentAt = consented(req, res);
    if (consentAt) return toCheckout(res, () => pay.checkout(origin(req), '/me', user.id, { kind: 'plan', plan }, consentAt));
    return;
  }
  if (plan === 'lite') await toLite(user.id);
  else {
    if (changed) logFree(req, user.id, 'plan', plan);
    await changePlan(user.id, plan);
  }
  res.json(store.planState(user.id));
});

// buy a storage pack, of video or of text and pictures: the paid plans only
app.post('/api/me/storage', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const space = req.body?.space === 'media' ? 'media' : 'video';
  if (!beyondLite(store.planOf(user.id))) return res.status(403).json({ error: 'more storage is for the paid plans' });
  if (!verifiedOr403(res, user.id)) return;
  if (pay.stripe) {
    const consentAt = consented(req, res);
    if (consentAt) return toCheckout(res, () => pay.checkout(origin(req), '/me', user.id, { kind: 'pack', space }, consentAt));
    return;
  }
  store.buyPack(user.id, space);
  logFree(req, user.id, 'pack', space);
  res.json(store.planState(user.id));
});

// back from Checkout: Stripe says what was paid; it is granted once
/** Checkout sessions being confirmed right now: a second confirm of one while it waits on Stripe grants nothing */
const confirming = new Set<string>();

/** A paid Checkout session granted, once, whichever comes first: the buyer back from Checkout, or
 * Stripe's webhook. `read`: the session as Stripe has it (null: nothing paid); `buyer`: it must be
 * theirs. 'busy': the other is granting it right now. */
async function grantSession(sessionId: string, read: () => Promise<pay.PaidSession | null>, buyer?: string): Promise<{ granted: pay.PaidSession } | 'already' | 'busy' | 'unpaid'> {
  if (store.granted(sessionId)) return 'already';
  if (confirming.has(sessionId)) return 'busy';
  confirming.add(sessionId);
  try {
    const done = await read().catch(() => null);
    if (!done || (buyer && done.userId !== buyer)) return 'unpaid';
    // (an account deleted before Stripe's word came: nothing to give; the payment is Stripe's to refund)
    if (!store.user(done.userId)) {
      console.error(`Stripe: Checkout session ${sessionId} was paid for a user no longer here (${done.userId}): refund it in the Dashboard`);
      return 'unpaid';
    }
    const { what, subscription, userId } = done;
    // Stripe's side first: the plan before, if it was paid, ends, and leaving Unlimited ends the readers' payments
    if (what.kind === 'plan') {
      const before = store.planSubscription(userId);
      if (before && before !== subscription) await pay.cancel(before);
      if (what.plan !== 'pro') await cancelReaders(userId);
    }
    // then ours, in one transaction: the session taken, D2M's own record of it (with the consent given
    // before Checkout), and what was paid for
    return store.grant(sessionId, userId, what, done) ? { granted: done } : 'already';
  } finally {
    confirming.delete(sessionId);
  }
}

app.post('/api/pay/confirm', async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const id = String(req.body?.session ?? '');
  const result = await grantSession(id, () => pay.paidSession(id), user.id);
  if (result === 'already' || result === 'busy') return res.json({ ok: true, already: true });
  if (result === 'unpaid') return res.status(402).json({ error: 'no payment to confirm' });
  const { what } = result.granted;
  res.json({ ok: true, kind: what.kind, postId: what.kind === 'post' ? what.postId : undefined });
});

// ---------------- Stripe's webhook ----------------
// Signed by Stripe (STRIPE_WEBHOOK_SECRET); each event applied once (stripe_events). Nothing here
// cancels at Stripe what Stripe itself ended. An answer other than 2xx makes Stripe send it again.

async function stripeWebhook(req: express.Request, res: express.Response) {
  if (!pay.stripe || !pay.webhookSecret) return res.status(404).json({ error: 'not found' });
  let event: Stripe.Event;
  try {
    event = pay.webhookEvent(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.header('stripe-signature') ?? '');
  } catch {
    return res.status(400).json({ error: 'bad signature' });
  }
  if (!store.claimEvent(event.id, event.type)) return res.json({ received: true, already: true });
  try {
    const later = await applyEvent(event);
    // a Checkout session being granted by the buyer's own confirm right now: Stripe tries again soon
    if (later) {
      store.releaseEvent(event.id);
      return res.status(409).json({ error: 'busy, send it again' });
    }
    res.json({ received: true });
  } catch (e) {
    store.releaseEvent(event.id);
    console.error(`Stripe webhook: ${event.type} ${event.id} failed:`, e);
    res.status(500).json({ error: 'could not apply the event' });
  }
}

/** Apply one event; true: not now (send it again later). */
async function applyEvent(event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    // paid (a card at once; a bank transfer later, as async_payment_succeeded): granted as the confirm grants it
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      const result = await grantSession(session.id, async () => pay.fromSession(session));
      if (result === 'busy') return true;
      if (typeof result === 'object') console.log(`Stripe: Checkout session ${session.id} granted by the webhook (${result.granted.what.kind})`);
      return false;
    }
    // a renewal: the plan, pack or subscription goes on as it is (Stripe keeps the invoice)
    case 'invoice.paid': {
      const invoice = event.data.object;
      const sub = pay.invoiceSubscription(invoice);
      if (invoice.billing_reason === 'subscription_cycle' && sub) console.log(`Stripe: ${sub} renewed (${store.subscriptionOf(sub)?.kind ?? 'not one of ours'}, ${invoice.amount_paid} cents)`);
      return false;
    }
    // Stripe tries again by itself; if it gives up, customer.subscription.deleted ends it
    case 'invoice.payment_failed': {
      const sub = pay.invoiceSubscription(event.data.object);
      console.warn(`Stripe: a payment failed for ${sub ?? 'an invoice'} (Stripe retries)`);
      return false;
    }
    case 'customer.subscription.deleted':
      await subscriptionEnded(event.data.object.id);
      return false;
    // a reader's subscription set to end (or to go on after all) at Stripe: open until then here too
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const of = store.subscriptionOf(sub.id);
      if (of?.kind === 'author' && sub.status !== 'canceled') store.readerEnds(of.readerId, of.authorId, pay.endsAt(sub) ?? null);
      return false;
    }
    default:
      return false;
  }
}

/** A subscription that ended at Stripe ends here the way the app ends it, without cancelling it again:
 * a plan goes back to Lite (its packs' and its readers' payments, which go on at Stripe, end there);
 * a pack is one fewer; a reader's subscription goes. One not known here (ended here first) is let be. */
async function subscriptionEnded(subscription: string) {
  const of = store.subscriptionOf(subscription);
  if (!of) return;
  console.log(`Stripe: ${subscription} ended at Stripe (${of.kind})`);
  if (of.kind === 'plan') {
    await Promise.all(store.packSubscriptions(of.userId).map((s) => pay.cancel(s)));
    await changePlan(of.userId, 'lite');
  } else if (of.kind === 'pack') store.packEnded(of.userId, subscription);
  else store.unsubscribe(of.readerId, of.authorId);
}

// an author's Stripe account for being paid: whether payments are on, linked, and ready
app.get('/api/me/payouts', async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const account = store.payAccount(user.id);
  res.json({ enabled: !!pay.stripe, live: pay.live, linked: !!account, ready: await pay.payoutReady(account).catch(() => false) });
});

// link (or finish linking) a Stripe account: the address of Stripe's own page for it
app.post('/api/me/payouts', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  if (!verifiedOr403(res, user.id)) return;
  if (!pay.stripe) return res.status(400).json({ error: 'payments are off' });
  return toCheckout(res, async () => {
    const { account, url } = await pay.payoutLink(origin(req), store.payAccount(user.id));
    store.setPayAccount(user.id, account);
    return url;
  });
});

/** Selling needs a Stripe account money can go to (with payments off, nothing is needed). */
async function canBePaid(userId: string) {
  return !pay.stripe || (await pay.payoutReady(store.payAccount(userId)).catch(() => false));
}

// ---------------- purchases, withdrawal, deleting the account ----------------

/** Can the buyer still withdraw from it: a monthly contract of the last 14 days, still running (a
 * single post cannot be: access began at once, with the buyer's consent). */
function withdrawable(userId: string, row: LogRow, log = store.purchaseLog(userId)) {
  if (row.kind === 'post' || !row.item || row.withdrawnAt || row.createdAt <= Date.now() - WITHDRAWAL_DAYS * DAY) return false;
  // granted with payments off: only the newest of its kind counts
  if (!row.subscription && log.filter((r) => r.kind === row.kind && r.item === row.item).pop()?.id !== row.id) return false;
  if (row.kind === 'plan') return row.subscription ? store.planSubscription(userId) === row.subscription : store.planOf(userId) === row.item;
  if (row.kind === 'pack') return row.subscription ? store.packSubscriptions(userId).includes(row.subscription) : store.planState(userId).packs[row.item as Space] > 0;
  return store.subscribed(userId, row.item) && !store.subscribedUntil(userId, row.item) && (!row.subscription || store.readerSubscription(userId, row.item) === row.subscription);
}

/** A user's purchases as they see them, newest first. */
function purchasesOf(userId: string): PurchaseEntry[] {
  const log = store.purchaseLog(userId);
  return log
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.kind === 'plan' ? PLANS[r.item as PlanName]?.name ?? '' : r.kind === 'pack' ? r.item ?? '' : r.kind === 'author' ? store.user(r.item ?? '')?.name ?? '' : store.post(r.item ?? '')?.title ?? '',
      amount: r.amount,
      createdAt: r.createdAt,
      consentAt: r.consentAt,
      withdrawnAt: r.withdrawnAt,
      refunded: r.refunded,
      withdrawable: withdrawable(userId, r, log),
    }))
    .reverse();
}

app.get('/api/me/purchases', (req, res) => {
  const user = me(req, res);
  if (user) res.json(purchasesOf(user.id));
});

// withdrawing from a monthly contract within 14 days: it ends at once and the unused part is refunded
// (with payments off it just ends); a plan withdrawn from goes back to Lite
app.post('/api/me/withdraw/:id', async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const row = store.logRow(req.params.id, user.id);
  if (!row?.item || !withdrawable(user.id, row)) return res.status(404).json({ error: 'nothing to withdraw from' });
  let refunded: number;
  try {
    refunded = await pay.withdraw(row.subscription, row.kind === 'author');
  } catch (e) {
    return res.status(502).json({ error: `Stripe: ${(e as Error).message}` });
  }
  // a plan withdrawn from goes back to Lite: the packs' and the readers' monthly payments end too (the plan's ended above)
  if (row.kind === 'plan') await Promise.all([...store.packSubscriptions(user.id).map((s) => pay.cancel(s)), cancelReaders(user.id)]);
  // ours in one transaction: marked in the log, and it ends here
  store.withdrawn(row.id, refunded);
  res.json(purchasesOf(user.id));
});

// deleting your account (GDPR), with your password: every monthly payment of yours ends at once, as a
// reader and as an author (your readers' too), your sold posts of the last 30 days are refunded, and
// everything of yours goes. The Connect account stays at Stripe: what you are owed is still paid out.
app.post('/api/me/delete', async (req, res) => {
  const s = session(req.headers.cookie);
  if (!s) return res.status(401).json({ error: 'not signed in' });
  const userId = s.user.id;
  const account = store.authAccount(userId);
  const password = String(req.body?.password ?? '').slice(0, auth.MAX_PASSWORD + 1);
  if (!account || !(await auth.verifyPassword(password, account.password))) return res.status(403).json({ error: 'wrong password', code: 'wrong-password' });
  await Promise.all(store.readerSubscriptions({ reader: userId }).map((s) => pay.cancel(s)));
  // the plan, the packs, and as an author every reader's subscription
  await toLite(userId);
  for (const post of store.postsOf(userId)) {
    await refundBuyers(post.id);
    store.deletePost(post.id);
  }
  store.deleteUser(userId);
  for (const [ws, id] of sockets) if (id === userId) ws.close(4001, 'account deleted');
  auth.clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/me/archive', (req, res) => {
  const user = me(req, res);
  if (user) res.json(store.archive(user.id).map((p) => summary(p, user.id)));
});

// ---------------- videos straight into R2, in parts ----------------
// The browser asks to begin (or to go on with a broken upload), gets signed addresses for the
// parts, PUTs them into the bucket itself, and asks to put them together. The video's key then
// goes with the post instead of the file.

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/i;

app.get('/api/uploads', (_req, res) => res.json({ direct: onR2, partSize: media.PART_SIZE }));

app.post('/api/uploads/start', async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  if (!onR2) return res.status(400).json({ error: 'uploads go with the post' });
  const resume = req.body?.resume as { key?: string; uploadId?: string } | undefined;
  if (resume?.key && resume.uploadId) {
    const u = store.upload(user.id, resume.key, resume.uploadId);
    if (u && u.size === undefined) {
      const done = await media.partsDone(u.key, u.uploadId).catch(() => null);
      if (done) return res.json({ key: u.key, uploadId: u.uploadId, done });
    }
  }
  const name = String(req.body?.name ?? '');
  const bytes = Number(req.body?.size);
  if (!VIDEO_EXT.test(name)) return res.status(400).json({ error: 'not a video file' });
  if (!Number.isFinite(bytes) || bytes <= 0) return res.status(400).json({ error: 'the size is needed' });
  const state = store.planState(user.id);
  if (state.used.video + bytes > state.quota.video) return res.status(413).json({ error: 'your video storage is full' });
  const key = id() + path.extname(name).toLowerCase();
  try {
    const uploadId = await media.startParts(key);
    store.addUpload({ key, uploadId, userId: user.id, createdAt: Date.now() });
    res.json({ key, uploadId, done: [] });
  } catch (e) {
    res.status(502).json({ error: `R2: ${(e as Error).message}` });
  }
});

app.post('/api/uploads/parts', async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const u = store.upload(user.id, String(req.body?.key ?? ''), String(req.body?.uploadId ?? ''));
  const parts: number[] = Array.isArray(req.body?.parts) ? req.body.parts.map(Number).filter((n: number) => n >= 1 && n <= 10000) : [];
  if (!u || u.size !== undefined) return res.status(404).json({ error: 'no such upload' });
  res.json({ urls: await media.partAddresses(u.key, u.uploadId, parts) });
});

app.post('/api/uploads/finish', async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const u = store.upload(user.id, String(req.body?.key ?? ''), String(req.body?.uploadId ?? ''));
  if (!u) return res.status(404).json({ error: 'no such upload' });
  try {
    const bytes = (await media.finishParts(u.key, u.uploadId, req.body?.parts ?? [])) ?? 0;
    store.uploadDone(u.key, bytes);
    res.json({ key: u.key, size: bytes });
  } catch (e) {
    res.status(400).json({ error: `R2: ${(e as Error).message}` });
  }
});

app.post('/api/uploads/abort', async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const u = store.upload(user.id, String(req.body?.key ?? ''));
  if (u) {
    store.dropUpload(u.key);
    await (u.size === undefined ? media.abortParts(u.key, u.uploadId) : remove(`/media/${u.key}`, uploads));
  }
  res.json({ ok: true });
});

// the paid plans: how long a post stays live, changed whenever you like (ms from now, null: until ended, 'end': into the archive)
app.post('/api/posts/:id/life', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const post = store.post(req.params.id);
  if (!post || post.authorId !== user.id) return res.status(404).json({ error: 'no such post of yours' });
  if (!beyondLite(store.planOf(user.id))) return res.status(403).json({ error: 'choosing how long a post stays is for the paid plans' });
  const life = req.body?.life;
  if (life === 'end') store.setLife(post.id, 'end');
  else if (life === null) store.setLife(post.id, null);
  else if (typeof life === 'number' && life > 0) store.setLife(post.id, Date.now() + life);
  else return res.status(400).json({ error: 'life: milliseconds, null or end' });
  res.json(store.post(post.id));
});

/** The author deletes a post they sold: its purchases of the last 30 days are refunded whole (a post
 * that ends at the time shown before buying is not). With payments off there is no money: only marked. */
async function refundBuyers(postId: string) {
  const since = Date.now() - REFUND_DAYS * DAY;
  for (const r of store.refundable(postId, since)) {
    try {
      const cents = await pay.refund(r.payment);
      // kept at once: the money is back already
      store.refunded(r.id, cents);
      console.log(`refund: purchase ${r.id} of post ${postId}: ${cents} cents${pay.stripe ? '' : ' (payments off)'}`);
    } catch (e) {
      console.error(`Stripe: could not refund purchase ${r.id} of post ${postId}: ${(e as Error).message}`);
    }
  }
}

// delete your own post (frees its storage; buyers of the last 30 days get their money back)
app.delete('/api/posts/:id', async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const post = store.post(req.params.id);
  if (!post || post.authorId !== user.id) return res.status(404).json({ error: 'no such post of yours' });
  await refundBuyers(post.id);
  store.deletePost(post.id);
  res.json({ ok: true });
});

// browse profiles: everyone else, those who write in public first
app.get('/api/profiles', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const all: Profile[] = store
    .users()
    .filter((u) => u.id !== user.id)
    .map((u) => profileOf(user.id, u))
    .sort((a, b) => b.publicPosts - a.publicPosts || a.user.name.localeCompare(b.user.name));
  res.json(all);
});

// your profile picture and wallpaper: an image each (none sent: take it away)
const pictures = multer({
  storage: multer.diskStorage({
    destination: uploads,
    filename: (_req, file, cb) => cb(null, id() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});
for (const [route, field] of [['avatar', 'avatarUrl'], ['wallpaper', 'wallpaperUrl']] as const) {
  app.post(`/api/me/${route}`, signedIn, pictures.single('image'), (req, res) => {
    const user = me(req, res);
    if (!user) return;
    const url = req.file ? `/uploads/${req.file.filename}` : undefined;
    store.setPicture(user.id, field, url);
    res.json(store.user(user.id));
    // then to R2 (if the picture was changed again meanwhile, the moved copy goes)
    if (url)
      offload(url, uploads).then((to) => {
        if (to !== url && !store.movePicture(user.id, field, url, to)) void remove(to, uploads);
      });
  });
}

// ---------------- groups ----------------
// A friend group is private: only its members see it, its posts and who is in it; anyone else (an
// invitee too, until they accept) gets the same 404 as for no group at all. One joins only by accepting
// an invitation, and is invited only by someone they are friends with (an admin's invitation, or a
// member's suggestion an admin approves). An interest group is open to everyone signed in, never to a
// visitor who is not signed in nor to search engines: anyone joins and leaves; its admins remove posts
// from it, take members out, ban them, and make others admins. D2M's reports and moderation apply to
// group posts as to any other.

/** The group as the asker may see it, or the same 404 as for no group at all. */
function groupFor(req: express.Request, res: express.Response, user: User): Group | undefined {
  const g = store.group(req.params.id, user.id);
  if (g && (g.kind === 'interest' || g.role)) return g;
  res.status(404).json({ error: 'no such group' });
}

/** The group, if the asker is its admin (otherwise its 404, or 403 not-admin to a member or reader). */
function adminOf(req: express.Request, res: express.Response, user: User) {
  const g = groupFor(req, res, user);
  if (!g) return undefined;
  if (g.role === 'admin') return g;
  res.status(403).json({ error: 'the group’s admins only', code: 'not-admin' });
}

/** A group's page as this member or reader may have it: its posts, newest first; a friend group's
 * members to its members (with the invitations waiting, and to its admins the members' suggestions too,
 * besides one's own); an interest group's admins (to its admins every member, and who is banned). */
function groupPage(g: Group, userId: string): GroupPage {
  const all = store.groupMembers(g.id);
  const admin = g.role === 'admin';
  const page: GroupPage = {
    group: g,
    posts: store.groupPosts(g.id, userId).map((p) => summary(p, userId)),
    members: g.kind === 'friends' || admin ? all : all.filter((m) => m.role === 'admin'),
  };
  if (g.kind === 'friends') page.invites = store.groupInvites(g.id).filter((i) => i.status === 'invited' || admin || i.by === userId);
  if (g.kind === 'interest' && admin) page.bans = store.groupBans(g.id);
  return page;
}

/** The group's page anew for the asker (after a change), or its 404 when they may no longer see it. */
function groupPageNow(res: express.Response, groupId: string, userId: string) {
  const g = store.group(groupId, userId);
  if (!g || (g.kind === 'friends' && !g.role)) return res.status(404).json({ error: 'no such group' });
  res.json(groupPage(g, userId));
}

/** Someone out of a group: out of the conversations of its posts they were in (they may no longer be there). */
function leaveGroupRooms(groupId: string, userId: string) {
  for (const [postId, room] of rooms) {
    if (store.post(postId)?.groupId !== groupId) continue;
    let changed = false;
    for (const [ws, id] of room)
      if (id === userId) {
        room.delete(ws);
        changed = true;
      }
    if (changed) presenceChanged(postId);
  }
}

// your groups, the invitations waiting for you, and every interest group
app.get('/api/groups', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const overview: GroupsOverview = { mine: store.groupsOf(user.id), invitations: store.invitationsFor(user.id), toApprove: store.pendingFor(user.id).toApprove, interest: store.interestGroups(user.id) };
  res.json(overview);
});

// the badge: invitations waiting for you, and members' suggestions waiting for you as an admin
app.get('/api/groups/pending', (req, res) => {
  const user = me(req, res);
  if (user) res.set('Cache-Control', 'no-store').json(store.pendingFor(user.id));
});

// For You's strip: interest groups that match your interests (shared/interests.ts has the numbers)
app.get('/api/groups/suggestions', (req, res) => {
  const user = me(req, res);
  if (user) res.json(store.groupSuggestions(user.id));
});

// groups by name: interest groups, and the friend groups you are in
app.get('/api/groups/search', (req, res) => {
  const user = me(req, res);
  if (user) res.json(store.searchGroups(user.id, String(req.query.q ?? '')));
});

// a new group, you its admin: a friend group (a name, a description and a picture if you like), or an
// interest group around a topic (a topic, a name unique within it, and a description)
app.post('/api/groups', signedIn, pictures.single('picture'), (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const file = req.file;
  const refuse = (status: number, code: string, error: string) => {
    if (file) fs.rmSync(file.path, { force: true });
    res.status(status).json({ error, code });
  };
  const kind = req.body?.kind === 'friends' || req.body?.kind === 'interest' ? (req.body.kind as GroupKind) : undefined;
  if (!kind) return refuse(400, 'kind', 'kind: friends or interest');
  const name = cleanGroupName(req.body?.name);
  if (!name) return refuse(400, 'group-name', `a name of 1 to ${GROUP_NAME_MAX} characters is needed`);
  const description = cleanGroupDescription(req.body?.description);
  const topic = req.body?.topic;
  if (kind === 'interest' && !isTopic(topic)) return refuse(400, 'topic', 'an interest group needs a topic');
  if (kind === 'interest' && !description) return refuse(400, 'group-description', 'an interest group needs a description');
  // a picture is a friend group's
  if (file && kind !== 'friends') fs.rmSync(file.path, { force: true });
  const pictureUrl = file && kind === 'friends' ? `/uploads/${file.filename}` : undefined;
  const g = store.createGroup(user.id, { kind, name, description, topic: kind === 'interest' ? topic : undefined, pictureUrl });
  if (g === 'name-taken') return refuse(409, 'group-name-taken', 'this topic has an interest group of that name already');
  res.json(g);
  if (pictureUrl)
    offload(pictureUrl, uploads).then((to) => {
      if (to !== pictureUrl && !store.moveGroupPicture(g.id, pictureUrl, to)) void remove(to, uploads);
    });
});

app.get('/api/groups/:id', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const g = groupFor(req, res, user);
  if (g) res.json(groupPage(g, user.id));
});

// its admins rename it and change its description
app.post('/api/groups/:id', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const g = adminOf(req, res, user);
  if (!g) return;
  const name = req.body?.name === undefined ? g.name : cleanGroupName(req.body.name);
  const description = req.body?.description === undefined ? g.description ?? '' : cleanGroupDescription(req.body.description);
  if (!name) return res.status(400).json({ error: `a name of 1 to ${GROUP_NAME_MAX} characters is needed`, code: 'group-name' });
  if (g.kind === 'interest' && !description) return res.status(400).json({ error: 'an interest group needs a description', code: 'group-description' });
  if (store.updateGroup(g.id, name, description) === 'name-taken') return res.status(409).json({ error: 'this topic has an interest group of that name already', code: 'group-name-taken' });
  groupPageNow(res, g.id, user.id);
});

// a friend group's picture, by its admins (none sent: take it away)
app.post('/api/groups/:id/picture', signedIn, pictures.single('picture'), (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const url = req.file ? `/uploads/${req.file.filename}` : undefined;
  const g = store.group(req.params.id, user.id);
  if (!g || !g.role || g.kind !== 'friends' || g.role !== 'admin') {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    return !g || !g.role ? res.status(404).json({ error: 'no such group' }) : res.status(403).json({ error: 'a friend group’s admins only', code: 'not-admin' });
  }
  store.setGroupPicture(g.id, url);
  groupPageNow(res, g.id, user.id);
  if (url)
    offload(url, uploads).then((to) => {
      if (to !== url && !store.moveGroupPicture(g.id, url, to)) void remove(to, uploads);
    });
});

// its admins delete it, with its posts: only when they confirm it
app.post('/api/groups/:id/delete', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const g = adminOf(req, res, user);
  if (!g) return;
  if (req.body?.confirm !== true) return res.status(400).json({ error: 'deleting a group deletes its posts: confirm it', code: 'confirm' });
  store.deleteGroup(g.id);
  res.json({ ok: true });
});

// a friend group's member invites a friend of theirs (by @username or id): an admin's invitation waits
// for the invitee to accept; a member's is a suggestion that waits for an admin
app.post('/api/groups/:id/invite', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const g = groupFor(req, res, user);
  if (!g) return;
  if (g.kind !== 'friends' || !g.role) return res.status(400).json({ error: 'only a friend group’s members invite', code: 'not-friend-group' });
  const other = req.body?.userId ? store.user(String(req.body.userId)) : store.byUsername(String(req.body?.username ?? ''));
  if (!other) return res.status(404).json({ error: 'no such person', code: 'no-username' });
  if (other.id === user.id || !store.areFriends(user.id, other.id)) return res.status(403).json({ error: 'you invite only your friends', code: 'not-friend' });
  if (store.groupRole(g.id, other.id)) return res.status(409).json({ error: 'they are a member already', code: 'member' });
  const status = g.role === 'admin' ? 'invited' : 'suggested';
  store.invite(g.id, other.id, user.id, status);
  toUsers(status === 'invited' ? [other.id] : store.groupMembers(g.id).filter((m) => m.role === 'admin').map((m) => m.userId), { type: 'groups' });
  groupPageNow(res, g.id, user.id);
});

// its admins approve a member's suggestion (the invitee is invited now), or cancel an invitation (a suggestion turned down)
app.post('/api/groups/:id/invites/:userId/:action', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const g = adminOf(req, res, user);
  if (!g) return;
  const done = req.params.action === 'approve' ? store.approveInvite(g.id, req.params.userId) : req.params.action === 'cancel' ? store.dropInvite(g.id, req.params.userId) : false;
  if (!done) return res.status(404).json({ error: 'no such invitation' });
  if (req.params.action === 'approve') toUsers([req.params.userId], { type: 'groups' });
  groupPageNow(res, g.id, user.id);
});

// the invitee accepts (a member now) or declines; until then the invitation is all they see of the group
app.post('/api/groups/:id/accept', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  if (!store.acceptInvite(req.params.id, user.id)) return res.status(404).json({ error: 'no such invitation' });
  groupPageNow(res, req.params.id, user.id);
});

app.post('/api/groups/:id/decline', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  if (!store.dropInvite(req.params.id, user.id, true)) return res.status(404).json({ error: 'no such invitation' });
  res.json({ ok: true });
});

// anyone signed in joins an interest group (not one they are banned from)
app.post('/api/groups/:id/join', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const g = groupFor(req, res, user);
  if (!g) return;
  if (g.kind !== 'interest') return res.status(400).json({ error: 'a friend group is joined by an invitation', code: 'not-interest-group' });
  if (g.banned) return res.status(403).json({ error: 'the group’s admins have banned you from it', code: 'banned' });
  store.joinGroup(g.id, user.id);
  groupPageNow(res, g.id, user.id);
});

// leave a group: its last admin names a member to follow them (an interest group's falls to its oldest
// member otherwise); with no one to follow, the group is deleted with its posts, but only with delete: true
app.post('/api/groups/:id/leave', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const g = groupFor(req, res, user);
  if (!g) return;
  const successor = typeof req.body?.successor === 'string' ? req.body.successor : undefined;
  const done = store.leaveGroup(g.id, user.id, successor, req.body?.delete === true);
  if (done === 'not-member') return res.status(400).json({ error: 'you are not a member', code: 'not-member' });
  if (done === 'last-admin') return res.status(409).json({ error: 'you are its last admin: name a member to follow you, or delete the group', code: 'last-admin', members: g.members - 1 });
  leaveGroupRooms(g.id, user.id);
  res.json({ ok: true, deleted: done === 'deleted' });
});

// its admins: take a member out (not another admin), make a member an admin, and in an interest group
// ban someone (out of it, and kept out) or lift a ban
app.post('/api/groups/:id/members/:userId/:action', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const g = adminOf(req, res, user);
  if (!g) return;
  const them = req.params.userId;
  const action = req.params.action;
  const role = store.groupRole(g.id, them);
  if (them === user.id) return res.status(400).json({ error: 'not yourself: leave the group instead', code: 'self' });
  if ((action === 'ban' || action === 'unban') && g.kind !== 'interest') return res.status(400).json({ error: 'bans are an interest group’s', code: 'not-interest-group' });
  if (role === 'admin' && (action === 'remove' || action === 'ban')) return res.status(403).json({ error: 'an admin cannot be taken out', code: 'admin' });
  let done = false;
  if (action === 'remove') done = store.removeMember(g.id, them);
  else if (action === 'admin') done = store.makeAdmin(g.id, them);
  else if (action === 'ban') done = !!store.user(them) && store.banFromGroup(g.id, them, user.id);
  else if (action === 'unban') done = store.unbanFromGroup(g.id, them);
  else return res.status(400).json({ error: 'action: remove, admin, ban or unban', code: 'action' });
  if (!done) return res.status(404).json({ error: 'no such member' });
  if (action === 'remove' || action === 'ban') leaveGroupRooms(g.id, them);
  groupPageNow(res, g.id, user.id);
});

// its admins remove a post from the group (it is deleted, its conversation and files with it)
app.post('/api/groups/:id/posts/:postId/remove', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const g = adminOf(req, res, user);
  if (!g) return;
  const post = store.post(req.params.postId);
  if (!post || post.groupId !== g.id) return res.status(404).json({ error: 'no such post in the group' });
  store.deletePost(post.id);
  groupPageNow(res, g.id, user.id);
});

// your public profile: anyone may make one
app.post('/api/me/profile', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  // making it public waits for a confirmed email (keeping it as it is, or private, does not)
  if (req.body?.publicProfile && !user.publicProfile && !verifiedOr403(res, user.id)) return;
  store.setProfile(user.id, !!req.body?.publicProfile, String(req.body?.bio ?? ''));
  res.json(store.user(user.id));
});

// someone's public profile (yours always; others only if they made it public), signed in or not
function profilePage(req: express.Request, res: express.Response, find: () => User | undefined) {
  const user = viewer(req);
  if (!user && !anonymousRead(req, res)) return;
  const them = find();
  // the same 404 for no one at all and for a profile that is not public
  // (a suspended person's profile is no one's to see meanwhile)
  if (!them || (them.id !== user?.id && (!them.publicProfile || store.suspension(them.id)))) return res.status(404).json({ error: 'no public profile' });
  if (!user) {
    // a visitor: who they are and their live public posts that are not hidden; nothing about the
    // visitor (no friend, no subscription), no one present
    const posts = store.indexedPosts(them.id);
    const page: ProfilePage = { user: publicUser(them), friend: false, subscribed: false, publicPosts: posts.length, posts: posts.map((p) => summary(p, null)) };
    return res.json(page);
  }
  const page: ProfilePage = {
    ...profileOf(user.id, them),
    posts: store.publicPosts(them.id).map((p) => summary(p, user.id)),
  };
  res.json(page);
}
app.get('/api/users/:id/profile', (req, res) => profilePage(req, res, () => store.user(req.params.id)));
// the same by username (/@username links)
app.get('/api/users/by-username/:username', (req, res) => profilePage(req, res, () => store.byUsername(req.params.username)));

// someone's public posts: the only part of anyone's profile that can be looked at (a visitor who is
// not signed in: only a public profile's, live and not hidden; otherwise the profile's 404)
app.get('/api/users/:id/public', (req, res) => {
  const user = viewer(req);
  if (user) return res.json(store.publicPosts(req.params.id).map((p) => summary(p, user.id)));
  if (!anonymousRead(req, res)) return;
  const them = store.user(req.params.id);
  if (!them?.publicProfile || store.suspension(them.id)) return res.status(404).json({ error: 'no public profile' });
  res.json(store.indexedPosts(them.id).map((p) => summary(p, null)));
});

// your subscription: its monthly price, and how many subscribe
app.get('/api/me/subscription', (req, res) => {
  const user = me(req, res);
  if (user) res.json({ price: user.price ?? 0, subscribers: store.subscribers(user.id) });
});

app.post('/api/me/price', async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const cents = Math.round(Number(req.body?.price ?? 0) * 100);
  if (cents > 0 && !verifiedOr403(res, user.id)) return;
  if (cents > 0 && !(await canBePaid(user.id))) return res.status(409).json({ error: 'link a Stripe account for payouts first' });
  // selling a subscription is Unlimited's (Exclusive sells single posts instead)
  if (cents > 0 && !sellsSubscriptions(store.planOf(user.id))) return res.status(403).json({ error: 'subscriptions are for Unlimited' });
  // capped against money laundering through subscriptions
  if (!Number.isFinite(cents) || cents < 0 || cents > MAX_PRICE) return res.status(400).json({ error: `a price from 0 to ${MAX_PRICE / 100} euros` });
  // no price: no subscription sold, so the readers' monthly payments end
  if (cents === 0) await stopSelling(user.id);
  store.setPrice(user.id, cents);
  res.json({ price: store.user(user.id)?.price ?? 0, subscribers: store.subscribers(user.id) });
});

// subscribing to an author: through Stripe Checkout (with payments off, at once and free)
app.post('/api/subscribe/:authorId', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const author = store.user(req.params.authorId);
  if (!author?.price || store.suspension(author.id)) return res.status(404).json({ error: 'they sell no subscription' });
  if (!store.subscribed(user.id, author.id) && !verifiedOr403(res, user.id)) return;
  if (pay.stripe && !store.subscribed(user.id, author.id)) {
    const consentAt = consented(req, res);
    if (!consentAt) return;
    const account = store.payAccount(author.id);
    if (!account) return res.status(409).json({ error: 'the author cannot be paid yet' });
    // back to the page they came from, on this site only
    const back = seo.validBack(req.body?.back) ? req.body.back : `/u/${author.id}`;
    return toCheckout(res, () => pay.checkout(origin(req), back, user.id, { kind: 'author', authorId: author.id }, consentAt, { name: `${author.name} on Dear to Me`, price: author.price!, account }));
  }
  if (!pay.stripe && !store.subscribed(user.id, author.id)) logFree(req, user.id, 'author', author.id);
  store.subscribe(user.id, author.id);
  res.json({ ok: true });
});

// a reader ends a subscription: with Stripe it renews no more and stays open to the end of the period
// paid for; with payments off it ends at once
app.post('/api/unsubscribe/:authorId', async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const authorId = req.params.authorId;
  if (!store.subscribed(user.id, authorId)) return res.status(404).json({ error: 'no such subscription' });
  const subscription = store.readerSubscription(user.id, authorId);
  let until: number | undefined;
  try {
    until = subscription ? await pay.endAtPeriodEnd(subscription) : undefined;
  } catch (e) {
    return res.status(502).json({ error: `Stripe: ${(e as Error).message}` });
  }
  if (!until) await pay.cancel(subscription);
  // without an end of period it ends at once, its Stripe id with it
  store.unsubscribe(user.id, authorId, until);
  res.json({ ok: true, until });
});

// buying one Exclusive post (the prototype charges nothing; no monthly payment)
app.post('/api/posts/:id/buy', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const post = store.post(req.params.id);
  if (!post || !store.canSee(user.id, post)) return res.status(404).json({ error: 'no such post' });
  if (!post.paid || !post.price) return res.status(400).json({ error: 'this post is not sold by itself' });
  if (!store.bought(user.id, post.id) && !verifiedOr403(res, user.id)) return;
  if (pay.stripe && !store.bought(user.id, post.id)) {
    const consentAt = consented(req, res);
    if (!consentAt) return;
    const account = store.payAccount(post.authorId);
    if (!account) return res.status(409).json({ error: 'the author cannot be paid yet' });
    const name = `${post.title} (${store.user(post.authorId)?.name ?? ''})`.slice(0, 200);
    return toCheckout(res, () => pay.checkout(origin(req), `/post/${post.id}`, user.id, { kind: 'post', postId: post.id }, consentAt, { name, price: post.price!, account }));
  }
  if (!pay.stripe && !store.bought(user.id, post.id)) logFree(req, user.id, 'post', post.id);
  store.buy(user.id, post.id);
  res.json({ ok: true });
});

// a report: sexual content, AI-made content, or something else (the content rules)
app.post('/api/posts/:id/report', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const post = store.post(req.params.id);
  if (!post || !store.canSee(user.id, post) || post.authorId === user.id) return res.status(404).json({ error: 'no such post' });
  const reason = req.body?.reason;
  if (!REPORT_REASONS.includes(reason as ReportReason)) return res.status(400).json({ error: `reason: one of ${REPORT_REASONS.join(', ')}` });
  store.report(post.id, user.id, reason);
  res.json({ ok: true });
});

// ---------------- moderation ----------------
// Moderators (D2M_MODERATORS) see the queue: posts with open reports or notices, whatever their audience
// (the privacy policy says so), complaints, the suspended, and the log. Every decision is theirs, with a
// written reason; one that restricts someone (remove, restrict, suspend) mails them a statement of reasons
// with a link to complain, and the reporters are told what was decided.

function isModerator(user: User) {
  return moderators.has(user.username.toLowerCase());
}

/** The moderator asking, or a 401 (not signed in) or 403 (not a moderator). */
function moderator(req: express.Request, res: express.Response) {
  const user = me(req, res);
  if (!user) return undefined;
  if (isModerator(user)) return user;
  res.status(403).json({ error: 'moderators only', code: 'not-moderator' });
}

const by = (u: User) => ({ id: u.id, username: u.username });

/** A moderator's written reason: trimmed, 3 to 2000 characters (none: not given). */
function writtenReason(x: unknown) {
  const r = String(x ?? '').trim();
  return r.length >= 3 ? r.slice(0, 2000) : undefined;
}

/** Until when a decision can be complained about. */
function complaintDeadline(d: Decision) {
  const at = new Date(d.createdAt);
  at.setMonth(at.getMonth() + COMPLAINT_MONTHS);
  return at.getTime();
}

/** Can a complaint about this decision still be made? */
const complainable = (d: Decision, now = Date.now()) => RESTRICTING.includes(d.action) && !d.complaint && !d.reversedAt && now < complaintDeadline(d);

/** A fresh link to complain about a decision (only the token's hash is kept; it works until the time is up). */
function complaintLink(req: express.Request, d: Decision) {
  const token = auth.newToken();
  store.addModToken(auth.tokenHash(token), d.id, complaintDeadline(d));
  return { path: `/complaint/${d.id}?token=${token}`, url: `${siteOrigin(req)}/complaint/${d.id}?token=${token}` };
}

/** The statement of reasons to the person a restricting decision is about, with the link to complain. */
function mailStatement(req: express.Request, d: Decision) {
  const email = d.userId ? store.authAccount(d.userId)?.email : undefined;
  if (!email) return;
  void mail.send({ to: email, ...mail.statementMessage(d, siteOrigin(req), complaintLink(req, d).url, complaintDeadline(d)) });
}

/** A suspended person who signed in (or set a new password): 403 with why, until when, and a link to complain if there is still time. */
function refuseSuspended(req: express.Request, res: express.Response, userId: string) {
  const s = store.suspension(userId)!;
  const d = store.decision(s.decisionId);
  res.status(403).json({ error: 'this account is suspended', code: 'suspended', reason: s.reason, rule: s.rule, until: s.until, complaint: d && complainable(d) ? complaintLink(req, d).path : undefined });
}

/** A suspended author is paid for by no one: their readers' subscriptions to them end at once (as when
 * they stop selling); their own monthly payments (plan, packs, subscriptions to others) do not renew, so
 * they are not charged for what they cannot use, and nothing of theirs is deleted. */
async function stopCharging(userId: string) {
  await stopSelling(userId);
  const own = [store.planSubscription(userId), ...store.packSubscriptions(userId)].filter((s): s is string => !!s);
  for (const s of own) await pay.endAtPeriodEnd(s).catch((e) => console.error(`Stripe: could not stop ${s} renewing: ${(e as Error).message}`));
  for (const s of store.readerSubscriptions({ reader: userId })) {
    const of = store.subscriptionOf(s);
    const until = await pay.endAtPeriodEnd(s).catch((e) => console.error(`Stripe: could not stop ${s} renewing: ${(e as Error).message}`));
    if (of?.kind === 'author' && until) store.readerEnds(of.readerId, of.authorId, until);
  }
}

app.get('/api/mod/queue', (req, res) => {
  if (moderator(req, res)) res.set('Cache-Control', 'no-store').json(store.modQueue());
});

app.get('/api/mod/log', (req, res) => {
  if (moderator(req, res)) res.set('Cache-Control', 'no-store').json(store.modLog());
});

// a decision on a post: keep, remove, restrict (to its author alone) or lift a restriction; a written
// reason always, and the rule broken for remove and restrict
app.post('/api/mod/posts/:id', (req, res) => {
  const mod = moderator(req, res);
  if (!mod) return;
  const action = req.body?.action as PostAction;
  if (!POST_ACTIONS.includes(action)) return res.status(400).json({ error: `action: one of ${POST_ACTIONS.join(', ')}`, code: 'action' });
  const reason = writtenReason(req.body?.reason);
  if (!reason) return res.status(400).json({ error: 'a written reason is needed', code: 'reason' });
  const rule = req.body?.rule;
  if ((action === 'remove' || action === 'restrict') && !isRule(rule)) return res.status(400).json({ error: 'the rule broken is needed', code: 'rule' });
  const post = store.post(req.params.id);
  if (!post) return res.status(404).json({ error: 'no such post' });
  if (post.authorId === mod.id) return res.status(403).json({ error: 'a moderator does not decide on their own post', code: 'own' });
  if (action === 'lift' && !post.restricted) return res.status(400).json({ error: 'the post is not restricted', code: 'action' });
  // removed for breaking the rules: its buyers are not refunded (the refunds page says so); its files go as deletePost's do
  const done = store.decidePost(post.id, action, by(mod), isRule(rule) ? rule : undefined, reason);
  if (!done) return res.status(404).json({ error: 'no such post' });
  const { decision, reporters, notices } = done;
  if (action === 'remove' || action === 'restrict') mailStatement(req, decision);
  const origin = siteOrigin(req);
  for (const to of store.emailsOf(reporters)) void mail.send({ to, ...mail.reportDecidedMessage(action, `"${post.title}"`, origin) });
  for (const n of notices) void mail.send({ to: n.email, ...mail.reportDecidedMessage(action, n.url, origin) });
  res.json(decision);
});

// suspending someone (by username): a rule, a written reason, and an end (none: until lifted)
app.post('/api/mod/suspend', async (req, res) => {
  const mod = moderator(req, res);
  if (!mod) return;
  const user = store.byUsername(String(req.body?.username ?? ''));
  if (!user) return res.status(404).json({ error: 'no such person', code: 'no-username' });
  if (user.id === mod.id || isModerator(user)) return res.status(403).json({ error: 'a moderator cannot be suspended here', code: 'moderator' });
  const rule = req.body?.rule;
  if (!isRule(rule)) return res.status(400).json({ error: 'the rule broken is needed', code: 'rule' });
  const reason = writtenReason(req.body?.reason);
  if (!reason) return res.status(400).json({ error: 'a written reason is needed', code: 'reason' });
  const until = req.body?.until == null ? null : Number(req.body.until);
  if (until !== null && (!Number.isFinite(until) || until <= Date.now())) return res.status(400).json({ error: 'until: a time to come, or none', code: 'until' });
  const decision = store.suspend(user.id, by(mod), rule, reason, until);
  if (!decision) return res.status(404).json({ error: 'no such person' });
  // signed out everywhere: the sessions ended with the suspension, the sockets now
  for (const [ws, id] of sockets) if (id === user.id) ws.close(4001, 'suspended');
  mailStatement(req, decision);
  await stopCharging(user.id);
  res.json(decision);
});

app.post('/api/mod/unsuspend', (req, res) => {
  const mod = moderator(req, res);
  if (!mod) return;
  const reason = writtenReason(req.body?.reason);
  if (!reason) return res.status(400).json({ error: 'a written reason is needed', code: 'reason' });
  const userId = String(req.body?.userId ?? '');
  const decision = store.unsuspend(userId, by(mod), reason);
  if (!decision) return res.status(404).json({ error: 'not suspended' });
  const email = store.authAccount(userId)?.email;
  if (email) void mail.send({ to: email, ...mail.unsuspendedMessage(reason) });
  res.json(decision);
});

// a complaint decided: upheld, or reversed (what can be undone is); the complainant is told
app.post('/api/mod/complaints/:id', (req, res) => {
  const mod = moderator(req, res);
  if (!mod) return;
  const outcome = req.body?.outcome;
  if (outcome !== 'upheld' && outcome !== 'reversed') return res.status(400).json({ error: 'outcome: upheld or reversed', code: 'outcome' });
  const reason = writtenReason(req.body?.reason);
  if (!reason) return res.status(400).json({ error: 'a written reason is needed', code: 'reason' });
  const done = store.decideComplaint(req.params.id, by(mod), outcome, reason);
  if (!done) return res.status(404).json({ error: 'no such open complaint' });
  void mail.send({ to: done.email, ...mail.complaintOutcomeMessage(done.decision, outcome, reason) });
  res.json(done.decision);
});

// a notice about no post here: answered with a written reason
app.post('/api/mod/notices/:id', (req, res) => {
  const mod = moderator(req, res);
  if (!mod) return;
  const reason = writtenReason(req.body?.reason);
  if (!reason) return res.status(400).json({ error: 'a written reason is needed', code: 'reason' });
  const n = store.closeNotice(req.params.id, by(mod), reason);
  if (!n) return res.status(404).json({ error: 'no such open notice' });
  void mail.send({ to: n.email, ...mail.reportDecidedMessage('closed', n.url, siteOrigin(req), reason) });
  res.json({ ok: true });
});

// ---------------- complaints: the person a decision restricted, signed in or by the link in its statement ----------------

/** The decision a complaint is about, if the asker may see it: its person signed in, or a live link
 * (?token= or in the body). Otherwise a 404 (no such decision) or 403 'token'. */
function complaintAccess(req: express.Request, res: express.Response) {
  const d = store.decision(req.params.id);
  if (!d || !RESTRICTING.includes(d.action)) {
    res.status(404).json({ error: 'no such decision' });
    return undefined;
  }
  const token = String(req.body?.token ?? req.query.token ?? '');
  const user = viewer(req);
  const theirs = !!user && !!d.userId && user.id === d.userId;
  if (theirs || (token && store.validModToken(auth.tokenHash(token), d.id))) return { d, token: theirs ? undefined : token };
  res.status(403).json({ error: 'the link is not valid any more', code: 'token' });
  return undefined;
}

const complaintPage = (d: Decision): ComplaintPage => ({ decision: d, deadline: complaintDeadline(d), canComplain: complainable(d), ...(d.complaint ? { complaint: d.complaint } : {}) });

app.get('/api/complaints/:id', (req, res) => {
  const ok = complaintAccess(req, res);
  if (ok) res.set('Cache-Control', 'no-store').json(complaintPage(ok.d));
});

app.post('/api/complaints/:id', (req, res) => {
  const ok = complaintAccess(req, res);
  if (!ok) return;
  const text = String(req.body?.text ?? '').trim();
  if (text.length < 10) return res.status(400).json({ error: 'tell why, in at least 10 characters', code: 'complaint-text' });
  if (!complainable(ok.d)) return res.status(409).json({ error: 'this decision can no longer be complained about', code: 'complaint-closed' });
  const email = ok.d.userId ? store.authAccount(ok.d.userId)?.email : undefined;
  if (!email) return res.status(410).json({ error: 'the account is gone', code: 'complaint-closed' });
  const c = store.complain(ok.d.id, text, email, ok.token ? auth.tokenHash(ok.token) : undefined);
  if (!c) return res.status(409).json({ error: 'this decision can no longer be complained about', code: 'complaint-closed' });
  res.json(complaintPage(store.decision(ok.d.id)!));
});

// ---------------- notices from anyone, without an account (/report-content) ----------------
// braked: 5 an hour from an address, 5 a day for an email (both counted every time)
const tooManyNoticesFromIp = limiter(5, 60 * 60 * 1000);
const tooManyNoticesForEmail = limiter(5, 24 * 60 * 60 * 1000);

app.post('/api/notices', (req, res) => {
  const email = auth.normalEmail(req.body?.email);
  const url = String(req.body?.url ?? '').trim();
  const reason = req.body?.reason;
  const explanation = String(req.body?.explanation ?? '').trim();
  if (!auth.validEmail(email)) return res.status(400).json({ error: 'a valid email is needed', code: 'email' });
  if (!url || url.length > 500) return res.status(400).json({ error: 'the address of the content is needed', code: 'notice-url' });
  if (!isRule(reason)) return res.status(400).json({ error: 'the reason is needed', code: 'notice-reason' });
  if (explanation.length < 10) return res.status(400).json({ error: 'tell why, in at least 10 characters', code: 'notice-explanation' });
  if (req.body?.goodFaith !== true) return res.status(400).json({ error: 'the statement of good faith is needed', code: 'notice-good-faith' });
  const fromIp = tooManyNoticesFromIp(req.ip ?? '');
  const forEmail = tooManyNoticesForEmail(email);
  if (fromIp || forEmail) return res.status(429).json({ error: 'too many notices, try again later', code: 'too-many' });
  // the post the address names, if it is one here (/post/<id>, on any host: the address may be copied from anywhere)
  const postId = /\/post\/([0-9a-f]{12})(?:[/?#]|$)/.exec(url)?.[1];
  store.addNotice(email, url, reason, explanation.slice(0, 4000), postId && store.post(postId) ? postId : undefined);
  void mail.send({ to: email, ...mail.noticeReceivedMessage(url) });
  res.json({ ok: true });
});

// your own place: your own posts (friends' profiles are not browsed)
app.get('/api/me/posts', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  res.json(store.ownPosts(user.id).map((p) => summary(p, user.id)));
});

// letters: one friend each, to you or from you
app.get('/api/letters', (req, res) => {
  const user = me(req, res);
  if (user) res.json(store.letters(user.id).map((p) => summary(p, user.id)));
});

// BoVNotes: the author leaves a note inside a post for chosen readers; each sees it when they open the post
app.post('/api/posts/:id/notes', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const post = store.post(req.params.id);
  if (!post || post.authorId !== user.id) return res.status(404).json({ error: 'only the author leaves a BoVNote in a post' });
  const text = String(req.body?.text ?? '').trim();
  const asked: string[] = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
  const recipients = asked.filter((r) => r !== user.id && store.canSee(r, post));
  if (!text) return res.status(400).json({ error: 'a BoVNote needs words' });
  if (recipients.length === 0) return res.status(400).json({ error: 'choose at least one reader of the post' });
  const note = store.addNote(post.id, user.id, text, recipients);
  toUsers(note.recipients, { type: 'note', note });
  res.json(note);
});

app.post('/api/notes/:id/seen', (req, res) => {
  const user = me(req, res);
  if (!user) return;
  store.seen(req.params.id, user.id);
  res.json({ ok: true });
});

/** A post as this reader may have it: a paid post they have not subscribed to or bought is its opening
 * only. A visitor who is not signed in (null) reads a free post whole and a paid one's opening. */
function view(p: Post, userId: string | null): Post {
  // a group's post carries the group's name and kind (only those who may see it get it at all)
  const g = p.groupId && userId ? store.group(p.groupId, userId) : undefined;
  const q = g ? { ...p, group: { id: g.id, name: g.name, kind: g.kind } } : p;
  if (userId ? store.canRead(userId, p) : !p.paid) return q;
  return { ...q, body: p.body.split(/\n\s*\n/)[0], videoUrl: undefined, pictures: undefined, locked: true };
}

/** A post in a list. A visitor who is not signed in (null) is never told who is present, nor of BoVNotes. */
function summary(p: Post, userId: string | null): PostSummary {
  const s: PostSummary = { ...view(p, userId), messageCount: store.messageCount(p.id), present: userId ? present(p.id) : [], notesForMe: userId ? store.notesFor(userId, p.id).length : 0 };
  const topics = p.audience === 'public' ? store.topicsOf([p.id]).get(p.id) : undefined;
  if (topics) s.topics = topics;
  return s;
}

app.get('/api/posts/:id', (req, res) => {
  const user = viewer(req);
  if (!user) return anonymousPost(req, res);
  const post = store.post(req.params.id);
  if (!post || !store.canSee(user.id, post)) return res.status(404).json({ error: 'no such post' });
  const whole = store.canRead(user.id, post);
  res.json({ post: view(post, user.id), messages: whole ? store.messages(post.id) : [], present: present(post.id), notes: whole ? store.notesFor(user.id, post.id) : [] });
});

/** A post for a visitor who is not signed in: only one anyone may see (live, public, not a letter, not
 * hidden), as someone who has not paid sees it. Its conversation is public with it, read-only (none
 * under a locked one, as for a signed-in reader), with the people in it by name and picture. Never
 * who is present, never a BoVNote. Anything else gets the same 404 as no post at all. */
function anonymousPost(req: express.Request, res: express.Response) {
  if (!anonymousRead(req, res)) return;
  const post = store.post(req.params.id);
  if (!indexed(post)) return res.status(404).json({ error: 'no such post' });
  const shown = view(post, null);
  const messages = shown.locked ? [] : store.messages(post.id);
  const people = [...new Set([post.authorId, ...messages.map((m) => m.userId)])].flatMap((id) => {
    const u = store.user(id);
    return u ? [publicUser(u)] : [];
  });
  res.json({ post: shown, messages, messageCount: store.messageCount(post.id), present: [], notes: [], people });
}

app.post('/api/posts', signedIn, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'image', maxCount: 1 }, { name: 'pictures', maxCount: MAX_PICTURES }]), async (req, res) => {
  const user = me(req, res);
  if (!user) return;
  const title = String(req.body.title ?? '').trim();
  const body = String(req.body.body ?? '').trim();
  const kind = req.body.kind === 'vlog' ? 'vlog' : 'blog';
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const video = files.video?.[0];
  const image = files.image?.[0];
  const pictures = files.pictures ?? [];
  // or the video uploaded straight into R2, by its key
  const sent = kind === 'vlog' && !video && req.body.videoKey ? store.upload(user.id, String(req.body.videoKey)) : undefined;
  const remote = sent?.size !== undefined ? sent : undefined;
  // a refused post leaves no files behind
  const refuse = (error: string, status = 400, code?: string) => {
    for (const f of [video, image, ...pictures]) if (f) fs.rmSync(f.path, { force: true });
    if (remote) {
      store.dropUpload(remote.key);
      void remove(`/media/${remote.key}`, uploads);
    }
    return res.status(status).json(code ? { error, code } : { error });
  };
  if (!title) return refuse('a title is needed');
  const plan = store.planOf(user.id);
  // text and pictures take one space, video the other
  const size = (image?.size ?? 0) + pictures.reduce((sum, f) => sum + f.size, 0) + Buffer.byteLength(title + body);
  const videoSize = video?.size ?? remote?.size ?? 0;
  // the length read from the file itself (FFmpeg, from the bucket for a straight upload); only without it, the one the browser read
  const measured = video ? await videoLength(video.path) : remote ? await signed(remote.key).then((u) => (u ? videoLength(u) : undefined)) : undefined;
  const duration = measured ?? (Number(req.body.duration) || undefined);
  const isLetter = req.body.letter === '1';
  if (plan === 'lite' && !isLetter) {
    if (kind === 'blog' && store.postedLastDay(user.id, 'blog') >= PLANS.lite.blogsPer24h)
      return refuse(`Lite: at most ${PLANS.lite.blogsPer24h} blogs in 24 hours`, 429);
    if (kind === 'vlog' && store.postedLastDay(user.id, 'vlog') >= PLANS.lite.vlogsPer24h)
      return refuse(`Lite: at most ${PLANS.lite.vlogsPer24h} vlog in 24 hours`, 429);
  }
  if (kind === 'vlog' && plan === 'lite' && duration && duration > PLANS.lite.vlogMaxSeconds)
    return refuse(`Lite: a vlog is at most ${PLANS.lite.vlogMaxSeconds / 60} minutes`);
  const state = store.planState(user.id);
  if (state.used.video + videoSize > state.quota.video) return refuse('your video storage is full', 413);
  if (state.used.media + size > state.quota.media) return refuse('your text and pictures storage is full', 413);
  // how long it stays live: Lite by its kind; the paid plans as chosen (none chosen: until ended)
  let expiresAt: number | null;
  if (plan === 'lite') expiresAt = Date.now() + liteLife({ kind, letter: isLetter });
  else {
    const life = req.body.life === 'forever' || req.body.life === undefined ? null : Number(req.body.life);
    if (life !== null && !LIFE_CHOICES.some((c) => c.ms === life)) return refuse('choose how long it stays');
    expiresAt = life === null ? null : Date.now() + life;
  }
  if (kind === 'vlog' && !video && !remote) return refuse('a vlog needs a video');
  if (kind === 'blog' && !body) return refuse('a blog needs text');
  if (kind === 'blog' && !image) return refuse('a blog needs a picture');
  let audience: Post['audience'] = 'friends';
  const letter = req.body.letter === '1';
  const open = req.body.audience === 'public' && !letter;
  const paid = open && req.body.paid === '1';
  // to a group: one the author is a member of (and not banned from); never public, paid or with topics
  const group = req.body.audience === 'group' && !letter ? store.group(String(req.body.group ?? ''), user.id) : undefined;
  if (req.body.audience === 'group' && !letter && (!group?.role || group.banned)) return refuse('no such group of yours', 404, 'no-group');
  // no sexual content and nothing made with AI, anywhere; publishing publicly (or to an interest group,
  // which everyone signed in reads), the author confirms both
  if ((open || group?.kind === 'interest') && req.body.confirm !== '1') return refuse('confirm that the post is your own work, not made with AI, and has no sexual content');
  if (paid && !beyondLite(plan)) return refuse('paid posts are for Unlimited and Exclusive', 403);
  if (paid && !store.verified(user.id)) return refuse('confirm your email address first', 403, 'verify-email');
  if (paid && sellsSubscriptions(plan) && !user.price) return refuse('set a subscription price first');
  if (paid && !(await canBePaid(user.id))) return refuse('link a Stripe account for payouts first', 409);
  // Exclusive sells the post by itself: a blog at most 5 euros, a vlog at most 50 and at least 30 minutes long
  let price: number | undefined;
  if (paid && sellsPosts(plan)) {
    price = Math.round(Number(String(req.body.price ?? '').replace(',', '.')) * 100);
    const max = kind === 'vlog' ? POST_PRICE.vlogMax : POST_PRICE.blogMax;
    if (!Number.isFinite(price) || price <= 0 || price > max) return refuse(`a paid ${kind} costs from 0,01 to ${max / 100} euros`);
    // the length the server read from the file, never the one the browser sent (money rides on it)
    if (kind === 'vlog' && (measured ?? 0) < POST_PRICE.vlogMinSeconds) return refuse(`a paid vlog is at least ${POST_PRICE.vlogMinSeconds / 60} minutes long`);
  }
  // a public post's topics, as its author chose them (1 to MAX_POST_TOPICS, optional; none: read from its words)
  let topics: string[] | undefined;
  try {
    topics = open && req.body.topics ? JSON.parse(String(req.body.topics)) : undefined;
  } catch {
    return refuse('topics: a JSON array');
  }
  if (topics && (!Array.isArray(topics) || !topics.every(isTopic) || topics.length > MAX_POST_TOPICS)) return refuse(`topics: at most ${MAX_POST_TOPICS} known ones`);
  if (open) audience = 'public';
  else if (group) audience = 'group';
  else if (letter || (req.body.audience && req.body.audience !== 'friends')) {
    const chosen: string[] = JSON.parse(req.body.audience);
    audience = chosen.filter((f) => store.areFriends(user.id, f));
    if (audience.length === 0) return refuse('choose at least one friend');
    if (letter && audience.length !== 1) return refuse('a letter is for one friend');
  }
  const post = store.addPost({ authorId: user.id, kind, title, body, audience, groupId: group?.id, paid: paid || undefined, price, letter: letter || undefined, expiresAt, size, videoSize: videoSize || undefined, duration, videoUrl: video ? `/uploads/${video.filename}` : remote ? `/media/${remote.key}` : undefined, imageUrl: image ? `/uploads/${image.filename}` : undefined, pictures: pictures.length ? pictures.map((f) => `/uploads/${f.filename}`) : undefined }, topics?.filter(isTopic));
  if (remote) store.dropUpload(remote.key);
  // a group's post is news to its members (an interest group is read by everyone, but not everyone is told)
  if (group) toUsers(store.groupMembers(group.id).map((m) => m.userId), { type: 'posted', post });
  else toReaders(post, { type: 'posted', post });
  res.json(post);
  // then, in the background, a smaller copy for streaming replaces the upload, and the files go to R2
  (video ? shrink(post.id, video.path) : remote ? shrinkInR2(post.id, remote.key) : Promise.resolve()).then(() => toR2(post.id));
});

/** Move a post's files from the server's disk to R2 (nothing happens without R2). */
async function toR2(postId: string) {
  const post = store.post(postId);
  if (!onR2 || !post) return;
  const [videoUrl, imageUrl, ...pictures] = await Promise.all(
    [post.videoUrl, post.imageUrl, ...(post.pictures ?? [])].map((u) => (u ? offload(u, uploads) : Promise.resolve(undefined))),
  );
  if (!store.post(postId)) return void [videoUrl, imageUrl, ...pictures].forEach((u) => remove(u, uploads));
  store.moveFiles(postId, { videoUrl, imageUrl, pictures: post.pictures ? (pictures as string[]) : undefined });
}

function videoLength(file: string) {
  return video.duration(file);
}

/** Replace a vlog's upload with FFmpeg's smaller copy (when it is smaller), and count the new size. */
async function shrink(postId: string, file: string) {
  const out = file.replace(/\.[^.]+$/, '') + '.web.mp4';
  if (!(await video.compress(file, out))) return fs.rmSync(out, { force: true });
  const before = fs.statSync(file).size;
  const after = fs.statSync(out).size;
  if (after >= before) return fs.rmSync(out, { force: true });
  const post = store.post(postId);
  if (!post) return fs.rmSync(out, { force: true });
  store.replaceVideo(postId, `/uploads/${path.basename(out)}`, (post.videoSize ?? 0) - before + after);
  // the original goes in an hour: someone may be watching it right now
  store.removeLater(`/uploads/${path.basename(file)}`, 60 * 60 * 1000);
}

/** The same for a video in the bucket: FFmpeg reads it from there, the smaller copy goes back, the original away. */
async function shrinkInR2(postId: string, key: string) {
  const from = await signed(key);
  if (!from) return;
  const out = path.join(uploads, key.replace(/\.[^.]+$/, '') + '.web.mp4');
  if (!(await video.compress(from, out))) return fs.rmSync(out, { force: true });
  const post = store.post(postId);
  const after = fs.statSync(out).size;
  if (!post || after >= (post.videoSize ?? 0)) return fs.rmSync(out, { force: true });
  const to = await offload(`/uploads/${path.basename(out)}`, uploads);
  if (!store.post(postId)) return void remove(to, uploads);
  store.replaceVideo(postId, to, after);
  // the original goes in an hour: someone may be watching it right now
  store.removeLater(`/media/${key}`, 60 * 60 * 1000);
}

// --- the live channel ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** A page of this site, or no browser at all (another site's page must not use a visitor's cookie here). */
function sameOrigin(req: http.IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

wss.on('connection', (ws, req) => {
  // signed in by the session cookie the upgrade request carries
  const s = sameOrigin(req) ? session(req.headers.cookie) : undefined;
  if (!s) return ws.close(4001, 'not signed in');
  const userId = s.user.id;
  sockets.set(ws, userId);
  socketSessions.set(ws, s.hash);
  const joined = new Set<string>();

  ws.on('message', (raw) => {
    // a session that ended (expired) ends its socket
    if (store.sessionUser(s.hash)?.id !== userId) return ws.close(4001, 'not signed in');
    let e: ClientEvent;
    try {
      e = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!e || typeof e !== 'object' || typeof e.postId !== 'string') return;
    const post = store.post(e.postId);
    if (!post || !store.canRead(userId, post)) return;
    if (e.type === 'join') {
      if (!rooms.has(post.id)) rooms.set(post.id, new Map());
      rooms.get(post.id)!.set(ws, userId);
      joined.add(post.id);
      presenceChanged(post.id);
    } else if (e.type === 'leave') {
      rooms.get(post.id)?.delete(ws);
      joined.delete(post.id);
      presenceChanged(post.id);
    } else if (e.type === 'say' && typeof e.text === 'string' && e.text.trim()) {
      // banned from the post's group: they may read it (as anyone signed in), not talk in it
      if (post.groupId && store.bannedFrom(post.groupId, userId)) return;
      const message = store.addMessage(post.id, userId, e.text);
      toReaders(post, { type: 'message', message });
    }
  });

  ws.on('close', () => {
    sockets.delete(ws);
    socketSessions.delete(ws);
    for (const postId of joined) {
      rooms.get(postId)?.delete(ws);
      presenceChanged(postId);
    }
  });
});

// --- the pages, for people and search engines ---

/** What search engines may know of someone: only what a public profile shows. */
const person = (u: User): seo.PublicPerson => ({ id: u.id, name: u.name, username: u.username, bio: u.bio, avatarUrl: u.avatarUrl, wallpaperUrl: u.wallpaperUrl, publicProfile: u.publicProfile });

/** A post as anyone may see it: a paid one's opening only, never its video. */
const publicPost = (p: Post): seo.PublicPost => ({
  id: p.id,
  kind: p.kind,
  title: p.title,
  body: p.paid ? seo.opening(p.body) : p.body,
  paid: p.paid,
  imageUrl: p.imageUrl,
  videoUrl: p.paid ? undefined : p.videoUrl,
  duration: p.duration,
  createdAt: p.createdAt,
});

/** A post anyone may see (search engines, and visitors who are not signed in): live, public, not a
 * letter, not hidden by reports, not restricted by a moderator, its author not suspended. */
const indexed = (p: Post | undefined): p is Post => !!p && p.audience === 'public' && !p.letter && !p.hidden && !p.restricted && isLive(p) && !store.suspension(p.authorId);

/** The head (and, for a public page, the body) of a page of the app. Whatever is not public gets
 * the same generic, unindexed page whether it exists or not, so nothing is told about it. */
function metaFor(pathname: string): seo.Meta {
  let parts: string[];
  try {
    parts = pathname.split('/').map(decodeURIComponent);
  } catch {
    return seo.hidden();
  }
  const [, first, second, extra] = parts;
  if (!first) return seo.landing();
  if (second === undefined && first in seo.LEGAL_TITLES) return seo.legalPage(first as keyof typeof seo.LEGAL_TITLES);
  if (first.startsWith('@') && second === undefined) {
    const u = store.byUsername(first.slice(1));
    return u?.publicProfile && !store.suspension(u.id) ? seo.profile(person(u), store.indexedPosts(u.id).map(publicPost)) : seo.hidden();
  }
  if (first === 'post' && second && extra === undefined) {
    const p = store.post(second);
    const author = indexed(p) ? store.user(p.authorId) : undefined;
    return indexed(p) && author ? seo.post(publicPost(p), person(author)) : seo.hidden();
  }
  // a profile by id: its address is /@username
  if (first === 'u' && second) {
    const u = store.user(second);
    return u?.publicProfile && !store.suspension(u.id) ? { ...seo.hidden(), canonical: `/@${u.username}` } : seo.hidden();
  }
  // the groups and a group's page: never indexed, nothing of the group in the head (a friend group is its
  // members', an interest group is for those signed in), whether it exists or not
  if (first === 'groups' || first === 'g') return seo.hidden();
  return seo.hidden();
}

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(seo.robots(siteOrigin(req)));
});

// made from the store on each request; search engines may keep it ten minutes
app.get('/sitemap.xml', (req, res) => {
  const pages: { path: string; lastmod?: number }[] = [{ path: '/' }, ...Object.keys(seo.LEGAL_TITLES).map((d) => ({ path: `/${d}` }))];
  for (const u of store.publicProfiles()) pages.push({ path: `/@${u.username}`, lastmod: store.indexedPosts(u.id)[0]?.createdAt });
  for (const p of store.indexedPosts()) pages.push({ path: `/post/${p.id}`, lastmod: p.createdAt });
  res.type('application/xml').set('Cache-Control', 'public, max-age=600').send(seo.sitemap(siteOrigin(req), pages));
});

// the built site, when there is one (npm run build; npm start); without it (the checks, development
// beside Vite) the source index.html stands in, so the pages' heads are the same either way
const dist = path.join(root, 'dist');
const built = fs.existsSync(path.join(dist, 'index.html'));
// (index: false: "/" is a page with its own head, not the bare index.html)
if (built) app.use(express.static(dist, { index: false }));
let template: string | undefined;
const page = () => (template ??= fs.readFileSync(built ? path.join(dist, 'index.html') : path.join(root, 'index.html'), 'utf8'));

// every page of the app is index.html; the server's own paths and missing files are not (a username
// may have a dot: /@veera.k is a page)
app.get('*', (req, res, next) => {
  if (/^\/(api|media|uploads|ws)(\/|$)/.test(req.path) || /^\/(?!@).*\.[a-z0-9]+$/i.test(req.path)) return next();
  res
    .type('html')
    .set('Cache-Control', 'no-cache')
    .send(seo.render(page(), metaFor(req.path), siteOrigin(req)));
});

// a handler that threw: the request gets a 500, the server goes on
app.use((e: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('request failed:', e);
  if (!res.headersSent) res.status(500).json({ error: 'something went wrong' });
});

const port = Number(process.env.PORT ?? 5174);
server.listen(port, () => {
  console.log(`Dear to Me server on http://localhost:${port} (${demo ? 'demo people on; ' : ''}media: ${onR2 ? 'Cloudflare R2' : 'this disk'}; payments: ${pay.stripe ? (pay.live ? 'Stripe LIVE' : 'Stripe test') : 'off'})`);
  const features = [
    `mode: ${production ? 'production' : 'development'}`,
    `data: ${dataDir}`,
    `origin: ${process.env.D2M_ORIGIN || '(the request’s host)'}`,
    `proxies trusted: ${proxies}`,
    `Stripe webhook: ${pay.stripe && pay.webhookSecret ? 'on' : 'off'}`,
    `email: ${mail.provider === 'cloudflare' ? 'Cloudflare Email Service' : mail.consoleOnly ? 'this window only (D2M_MAIL=console: links shown here, accounts count as verified)' : 'the log (not sent)'}`,
    `beta: ${beta ? (inviteCodes.length ? `on, ${inviteCodes.length} invite codes` : 'on, open sign-up') : 'off'}`,
    `site: ${built ? 'dist/ (built)' : 'index.html (not built)'}`,
  ];
  console.log(`  ${features.join('; ')}`);
});

// SIGTERM (docker stop, systemd) and Ctrl+C: no new connections, the sockets told and closed, the
// requests under way finished, the database closed; then out. Ten seconds at most.
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: shutting down`);
  const done = () => {
    try {
      store.close();
    } catch {}
    process.exit(0);
  };
  setTimeout(() => {
    console.error('shutdown took too long: exiting');
    process.exit(1);
  }, 10_000).unref();
  for (const ws of wss.clients) ws.close(1001, 'server shutting down');
  wss.close();
  server.close(done);
  server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
