// End-to-end checks of the server: BoVNotes, letters, For You, paid posts, search, reports, the three
// plans (Lite, Unlimited, Exclusive), the two storage spaces, pictures among a blog's text, cancelling and
// withdrawing, the express consent before a payment, deleting an account, usernames, interests (topics, For You
// judged by them, topic search), what search engines see (each page's head, robots.txt, the sitemap), what a visitor who is not signed in may read, and the storage: data that survives a restart, a backup, a transaction that
// rolls back, the import of an older db.json, and the migration of schema version 1, 2, 3, 4 and 5 databases. Email:
// verifying an address, a forgotten password and its reset link, changing the email (read from the dev outbox),
// the request made to Cloudflare Email Service (a fake API of our own on port 5194), a closed beta and its
// invite codes. And for production: Stripe's webhook (signed test events, no call to Stripe), the security
// headers, the health check, and the demo and the dev outbox refused with NODE_ENV=production. Moderation: the
// queue (moderators only, D2M_MODERATORS), keep, remove, restrict, suspend, statements of reasons, complaints (signed in
// and by the link), notices without an account and their brake, the log, and the migration to version 6. Groups: friend groups (private, by
// invitation) and interest groups (open, around a topic), who sees and does what, their posts never public, reports and
// suspensions in them, account deletion, the For You suggestions, search, and the migration to version 7.
// `npm run check` starts a server of its own on a fresh, temporary data folder (the real data is
// not touched) and stops it afterwards. D2M=<url> checks a server that is already running instead
// (it must run with D2M_DEMO=1). Everyone signs in through the API, a cookie jar of their own each.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';
import Stripe from 'stripe';

const up = (port) => fetch(`http://127.0.0.1:${port}/api/config`).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A server of our own on a fresh data folder (or on `data`); the extra env on top. `log`: a file its
 * output goes to (none: nowhere). */
async function start(port, env, data = fs.mkdtempSync(path.join(os.tmpdir(), 'd2m-check-')), log) {
  const out = log ? fs.openSync(log, 'a') : 'ignore';
  const proc = spawn('npx tsx server/index.ts', { env: { ...process.env, D2M_MEDIA: 'disk', D2M_PAY: 'off', D2M_DATA: data, PORT: String(port), ...env }, shell: true, stdio: ['ignore', out, out] });
  if (log) fs.closeSync(out);
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    if (await up(port)) break;
  }
  return { proc, data, port };
}

/** Stop a server of ours, wait until its port is free, and remove its data (unless `keep`). */
async function stop({ proc, data, port }, keep = false) {
  const exited = proc.exitCode !== null ? Promise.resolve() : new Promise((r) => proc.once('exit', r));
  // the server runs under a shell: stop the whole tree
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
  else proc.kill();
  await exited;
  for (let i = 0; i < 50 && (await up(port)); i++) await sleep(100);
  if (!keep) {
    try {
      fs.rmSync(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {}
  }
}

const server = process.env.D2M ? null : await start(5199, { D2M_DEMO: '1' });
const B = process.env.D2M ?? 'http://127.0.0.1:5199';
const PASSWORD = 'dear-to-me-demo';
/** A query on a data folder's database as it is on disk now (read only, beside the running server). */
const sqlOn = (data, query, ...args) => {
  const d = new DatabaseSync(path.join(data, 'db.sqlite'), { readOnly: true });
  try {
    d.exec('PRAGMA busy_timeout = 5000');
    return d.prepare(query).all(...args);
  } finally {
    d.close();
  }
};
/** The same on our own server's data (not with D2M=<url>). */
const sql = (query, ...args) => sqlOn(server.data, query, ...args);
/** A change to our own server's data, beside it (only to move time on: a held username's 30 days). */
const sqlWrite = (query) => {
  const d = new DatabaseSync(path.join(server.data, 'db.sqlite'));
  try {
    d.exec('PRAGMA busy_timeout = 5000');
    d.exec(query);
  } finally {
    d.close();
  }
};
/** Every row of every table, as one text (to look for what should not be there). */
const dump = () => JSON.stringify(sql("SELECT name FROM sqlite_master WHERE type = 'table'").map(({ name }) => sql(`SELECT * FROM "${name}"`)));
const json = (r) => r.json();
/** The session cookie a response sets ("d2m_session=..."), or ''. */
const cookieOf = (res) => (res.headers.getSetCookie().find((c) => c.startsWith('d2m_session=')) ?? '').split(';')[0];
const signIn = (email, password) => fetch(B + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email, password }) });
/** A demo person, signed in: their user and their cookie. */
const login = async (name) => {
  const res = await signIn(`${name.toLowerCase()}@demo.d2m`, PASSWORD);
  return { ...(await res.json()), cookie: cookieOf(res) };
};
/** A signed-in person's headers: their cookie, and the header every change carries. */
const h = (u) => ({ cookie: u.cookie, 'x-d2m': '1' });
const get = (u, path) => fetch(B + path, { headers: h(u) }).then(json);
const post = (u, path, body) => fetch(B + path, { method: 'POST', headers: { ...h(u), 'content-type': 'application/json' }, body: JSON.stringify(body) });

const [joose, aino, mikko] = await Promise.all(['Joose', 'Aino', 'Mikko'].map(login));
let ok = true;
const check = (what, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  ok &&= cond;
};

// --- signing in: the session cookie is the only way to be someone ---
check('a demo person signs in with email and password', joose.name === 'Joose' && joose.cookie.length > 20);
const firstLogin = await signIn('aino@demo.d2m', PASSWORD);
check('the session cookie is HttpOnly and SameSite=Lax', ((c) => /;\s*HttpOnly/i.test(c) && /;\s*SameSite=Lax/i.test(c) && /;\s*Path=\//.test(c))(firstLogin.headers.getSetCookie().join('\n')));
check('no cookie: 401', (await fetch(B + '/api/feed')).status === 401 && (await fetch(B + '/api/me')).status === 401);
check('an x-user header alone: 401', (await fetch(B + '/api/feed', { headers: { 'x-user': joose.id } })).status === 401);
check('an x-user header beside a cookie changes nothing', (await fetch(B + '/api/me', { headers: { cookie: aino.cookie, 'x-user': joose.id } }).then(json)).id === aino.id);
check('a made-up cookie: 401', (await fetch(B + '/api/me', { headers: { cookie: 'd2m_session=AAAA' } })).status === 401);
check('/api/me is the signed-in person', (await get(joose, '/api/me')).id === joose.id);
check('a change without x-d2m: 403', (await fetch(B + '/api/me/profile', { method: 'POST', headers: { cookie: joose.cookie, 'content-type': 'application/json' }, body: '{}' })).status === 403);
check('a sign-in without x-d2m: 403', (await fetch(B + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'joose@demo.d2m', password: PASSWORD }) })).status === 403);
const everyone = await fetch(B + '/api/users', { headers: h(joose) }).then((r) => r.text());
check('/api/users has no email or password data', !/@|password|scrypt|email|salt/i.test(everyone) && JSON.parse(everyone).length >= 7);
check('/api/users carries each person’s username; the demo people are @joose, @aino, …', JSON.parse(everyone).every((u) => /^[a-z0-9][a-z0-9._]{2,19}$/.test(u.username)) && ['Joose', 'Aino', 'Mikko', 'Sara', 'Leo', 'Mira', 'Eeva'].every((n) => JSON.parse(everyone).find((u) => u.name === n)?.username === n.toLowerCase()));
check('/api/users needs a session', (await fetch(B + '/api/users')).status === 401);

// sign-up: a new person, signed in at once
const signUp = (body) => fetch(B + '/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ terms: true, ...body }) });
const upRes = await signUp({ name: 'Veera', username: ' @Veera ', email: '  Veera@Example.com ', password: 'a-long-password' });
const veera = { ...(await upRes.json()), cookie: cookieOf(upRes) };
check('sign-up makes an account and signs in', upRes.status === 200 && veera.name === 'Veera' && (await get(veera, '/api/me')).id === veera.id);
check('the username is normalised (trimmed, the @ off, lowercase)', veera.username === 'veera');
check('the email is normalised (trimmed, lowercase)', (await signIn('veera@example.com', 'a-long-password')).status === 200);
const taken = await signUp({ name: 'Veera', username: 'VEERA', email: 'other@example.com', password: 'a-long-password' });
check('sign-up refuses a username taken, whatever its case: 409 username-taken', taken.status === 409 && (await taken.json()).code === 'username-taken');
check('sign-up needs a username', (await signUp({ name: 'Ville', email: 'ville@example.com', password: 'a-long-password' })).status === 400);
const badUsername = async (username) => {
  const r = await signUp({ name: 'Ville', username, email: 'ville@example.com', password: 'a-long-password' });
  return r.status === 400 && (await r.json()).code === 'username-invalid';
};
check('sign-up refuses a username too short, too long, reserved, or against the rule: 400 username-invalid', (await Promise.all(['ab', 'a'.repeat(21), 'support', 'äiti', '_ville', 'vi..lle', 'ville.'].map(badUsername))).every(Boolean));
check('sign-up refuses an email taken', (await signUp({ name: 'Veera Two', username: 'veera.two', email: 'VEERA@example.com', password: 'a-long-password' }).then(json)).code === 'email-taken');
check('sign-up refuses a password under 10 characters', ((r) => r.code === 'short-password')(await signUp({ name: 'Ville', username: 'ville', email: 'ville@example.com', password: 'short-pw1' }).then(json)));
check('sign-up refuses without the terms accepted', (await signUp({ name: 'Ville', username: 'ville', email: 'ville@example.com', password: 'a-long-password', terms: false })).status === 400);
check('a demo username cannot be taken again', (await signUp({ name: 'Joose', username: 'Joose', email: 'joose2@example.com', password: 'a-long-password' })).status === 409);
// the display name is free: a second Veera, with a username of her own
const twoRes = await signUp({ name: 'Veera', username: 'veera.two', email: 'veera2@example.com', password: 'a-long-password' });
const veera2 = { ...(await twoRes.json()), cookie: cookieOf(twoRes) };
check('a second person may have the same display name', twoRes.status === 200 && veera2.name === 'Veera' && veera2.username === 'veera.two' && veera2.id !== veera.id);

// --- usernames: the live check, changing one, friends and search by it ---
const avail = (name, u) => fetch(B + `/api/username/${encodeURIComponent(name)}`, u ? { headers: h(u) } : {}).then(json);
const why = async (name) => (await avail(name)).reason;
check('the live check: free', (await avail('veera.free')).available === true);
check('the live check: too short, too long, characters, start, two dots, a dot at the end', JSON.stringify(await Promise.all(['ab', 'a'.repeat(21), 'ab c', '.abc', 'a..b', 'abc.'].map(why))) === JSON.stringify(['short', 'long', 'chars', 'start', 'dots', 'end']));
check('the live check: uppercase and a leading @ are read as lowercase', (await avail('@MIRA')).reason === 'taken' && (await avail('Veera.Free')).available === true);
check('the live check: reserved and taken, each with a free one like it', ((r) => r.reason === 'reserved' && r.suggestion === 'admin2')(await avail('admin')) && ((r) => r.reason === 'taken' && r.suggestion === 'mira2')(await avail('mira')));
check('the live check: your own username is free for you', (await avail('veera', veera)).available === true && (await avail('veera', veera2)).available === false);
const rename = (u, username) => post(u, '/api/me/username', { username });
const renamed = await rename(veera, 'Veera.K');
check('a username is changed (normalised)', renamed.status === 200 && (await renamed.json()).username === 'veera.k' && (await get(veera, '/api/me')).username === 'veera.k');
check('a bad new username: 400 username-invalid', (await rename(veera, 'x')).status === 400 && (await rename(veera, 'd2m').then(json)).code === 'username-invalid');
check('the old one is held: no one else may take it (409), sign up with it, or see it free', (await rename(veera2, 'veera')).status === 409 && (await signUp({ name: 'V', username: 'veera', email: 'v3@example.com', password: 'a-long-password' })).status === 409 && (await avail('veera', veera2)).available === false && (await avail('veera')).available === false);
check('its previous owner sees it free, and takes it back', (await avail('veera', veera)).available === true && (await rename(veera, 'veera')).status === 200 && (await get(veera, '/api/me')).username === 'veera');
check('and now the one changed away from is held for her', (await rename(veera2, 'veera.k')).status === 409);
if (server) {
  // 30 days on, the held name is anyone's
  sqlWrite("UPDATE released_usernames SET released_at = released_at - 31 * 24 * 60 * 60 * 1000 WHERE username = 'veera.k'");
  check('after 30 days someone else may take it', (await rename(veera2, 'veera.k')).status === 200 && (await rename(veera2, 'veera.two')).status === 200);
}
check('a username taken is refused on change too: 409 username-taken', (await rename(veera2, 'mira').then(json)).code === 'username-taken');
const byHandle = await post(joose, '/api/friends', { username: '@veera.two' });
check('a friend is added by @username (the one of two Veeras meant)', byHandle.status === 200 && ((fs) => fs.some((f) => f.id === veera2.id) && !fs.some((f) => f.id === veera.id))(await byHandle.json()));
check('adding by an unknown username: 404, and by a display name no more', (await post(joose, '/api/friends', { username: 'nobody.here' })).status === 404 && (await post(joose, '/api/friends', { name: 'Veera' })).status === 404);
const veeras = await get(joose, '/api/search?q=veera');
check('search by name finds both Veeras', veeras.some((x) => x.user.id === veera.id) && veeras.some((x) => x.user.id === veera2.id));
check('search by @username puts the exact one first', (await get(joose, '/api/search?q=%40veera.two'))[0]?.user.id === veera2.id && (await get(joose, '/api/search?q=%40veera'))[0]?.user.id === veera.id && (await get(joose, '/api/search?q=veera.t'))[0]?.user.id === veera2.id);
check('search by username alone finds one whose display name does not have it', ((r) => r.length === 1 && r[0].user.id === veera2.id)(await get(joose, '/api/search?q=two')));
check('a profile by username, like by id; none for a private one', ((p) => p.user?.username === 'mira' && p.posts.length >= 1)(await get(joose, '/api/users/by-username/mira')) && (await fetch(B + '/api/users/by-username/%40Mira', { headers: h(joose) })).status === 200 && (await fetch(B + '/api/users/by-username/aino', { headers: h(joose) })).status === 404 && (await fetch(B + '/api/users/by-username/nobody.here', { headers: h(joose) })).status === 404);

// signing out ends the session: the old cookie is worth nothing
const out = await post(veera, '/api/logout', {});
check('sign-out clears the cookie', out.status === 200 && /d2m_session=;.*Max-Age=0/i.test(out.headers.getSetCookie().join('\n')));
check('after sign-out the old cookie gives 401', (await fetch(B + '/api/me', { headers: h(veera) })).status === 401);

// the live channel: the cookie of the upgrade request, nothing else
const socket = (headers, url = B.replace('http', 'ws') + '/ws') =>
  new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    const seen = [];
    ws.on('message', (m) => seen.push(JSON.parse(String(m))));
    ws.on('close', (code) => resolve({ closed: code, seen }));
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', postId: 'none' }));
      setTimeout(() => (ws.close(), resolve({ open: true, seen })), 400);
    });
    ws.on('error', () => resolve({ closed: -1, seen }));
  });
check('a socket without a cookie is closed (4001)', (await socket({})).closed === 4001);
check('a socket with ?me= and no cookie is closed (4001)', (await socket({}, B.replace('http', 'ws') + `/ws?me=${joose.id}`)).closed === 4001);
check('a socket with a signed-out cookie is closed (4001)', (await socket({ cookie: veera.cookie })).closed === 4001);
check('a socket with a session cookie stays open', (await socket({ cookie: joose.cookie })).open === true);
check('a socket from another site’s page is closed', (await socket({ cookie: joose.cookie, origin: 'https://evil.example' })).closed === 4001);

// Aino's post holds a BoVNote for Joose
let feed = await get(joose, '/api/feed');
const lofoten = feed[0];
check('the feed shows a BoVNote waiting for Joose', lofoten.notesForMe === 1);
let open = await get(joose, `/api/posts/${lofoten.id}`);
check('opening the post gives Joose the note', open.notes.length === 1 && open.notes[0].text.includes('lähde vaan'));
check('Mikko gets no note in it', (await get(mikko, `/api/posts/${lofoten.id}`)).notes.length === 0);
await post(joose, `/api/notes/${open.notes[0].id}/seen`, {});
check('once seen, it is not shown again', (await get(joose, `/api/posts/${lofoten.id}`)).notes.length === 0);

// only the author leaves a BoVNote in a post
check('a reader cannot leave a BoVNote in someone else’s post', (await post(joose, `/api/posts/${lofoten.id}/notes`, { text: 'x', recipients: [mikko.id] })).status === 404);

// a letter from Joose to Aino, with a BoVNote inside
const form = new FormData();
form.set('kind', 'blog');
form.set('title', 'Kirje Ainolle');
form.set('body', 'Hei Aino.');
form.set('audience', JSON.stringify([aino.id]));
form.set('letter', '1');
form.set('image', new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }), 'c.jpg');
const letter = await fetch(B + '/api/posts', { method: 'POST', headers: h(joose), body: form }).then(json);
check('the letter is published', letter.letter === true);
const note = await post(joose, `/api/posts/${letter.id}/notes`, { text: 'Lue loppuun asti 😊', recipients: [aino.id, mikko.id] }).then(json);
check('a BoVNote goes only to readers of the post (not Mikko)', note.recipients.length === 1 && note.recipients[0] === aino.id);
check('Aino has the letter in her letters', (await get(aino, '/api/letters')).some((p) => p.id === letter.id));
check('the letter is not in Aino’s friends feed', !(await get(aino, '/api/feed')).some((p) => p.id === letter.id));
check('Mikko cannot see the letter', (await get(mikko, '/api/letters')).every((p) => p.id !== letter.id) && (await fetch(B + `/api/posts/${letter.id}`, { headers: h(mikko) })).status === 404);
check('Aino gets the BoVNote when she opens the letter', (await get(aino, `/api/posts/${letter.id}`)).notes.length === 1);
check('the letter is not in Joose’s own place (it is in his letters)', !(await get(joose, '/api/me/posts')).some((p) => p.id === letter.id));

const two = new FormData();
two.set('kind', 'blog');
two.set('title', 'x');
two.set('body', 'x');
two.set('audience', JSON.stringify([aino.id, mikko.id]));
two.set('letter', '1');
two.set('image', new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }), 'c.jpg');
check('a letter for two is refused', (await fetch(B + '/api/posts', { method: 'POST', headers: h(joose), body: two })).status === 400);

// --- For You, paid posts, search, reports ---
const [leo, mira, sara] = await Promise.all(['Leo', 'Mira', 'Sara'].map(login));
const fyp = await get(joose, '/api/fyp');
check('For You has Leo’s and Mira’s public posts', fyp.some((p) => p.authorId === leo.id) && fyp.some((p) => p.authorId === mira.id));
check('the friends feed has no strangers’ public posts', (await get(joose, '/api/feed')).every((p) => p.authorId !== leo.id && p.authorId !== mira.id));

// --- email: verifying an address, a forgotten password, changing the email (the dev outbox: D2M_DEMO=1) ---
const outbox = (to) => fetch(B + `/api/dev/outbox?to=${encodeURIComponent(to)}`).then(json);
/** The token of the newest link of a kind ('verify' or 'reset') mailed to an address. */
const lastToken = async (to, kind) => {
  const box = await outbox(to);
  for (let i = box.length - 1; i >= 0; i--) {
    const m = box[i].text.match(new RegExp(`/${kind}\\?token=([A-Za-z0-9_-]+)`));
    if (m) return m[1];
  }
};
const postAnon = (path, body) => fetch(B + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify(body) });
const verifyLink = (token) => postAnon('/api/email/verify', { token });
const forgot = (email) => postAnon('/api/password/forgot', { email });
const reset = (token, password) => postAnon('/api/password/reset', { token, password });
/** A new person's email confirmed through the link mailed to it. */
const confirmEmail = async (email) => (await verifyLink(await lastToken(email, 'verify'))).status === 200;
const code403 = async (res) => res.status === 403 && (await res.json()).code === 'verify-email';

const selmaRes = await signUp({ name: 'Selma', username: 'selma', email: 'selma@example.com', password: 'a-long-password' });
const selma = { ...(await selmaRes.json()), cookie: cookieOf(selmaRes) };
check('sign-up: the new person is unverified, and only they are told their email', selma.verified === false && selma.email === 'selma@example.com' && (await get(selma, '/api/me')).verified === false && !(await get(joose, '/api/users')).some((u) => 'email' in u || 'verified' in u));
const welcome = (await outbox('selma@example.com')).at(-1);
check('sign-up mails a verification link (/verify?token=, 43 characters of base64url), Finnish first and English below', !!welcome && /^Vahvista sähköpostiosoitteesi \/ Confirm your email address$/.test(welcome.subject) && /\/verify\?token=[A-Za-z0-9_-]{43}\b/.test(welcome.text) && welcome.text.indexOf('Vahvista') < welcome.text.indexOf('Confirm') && /<a href="http:\/\/127\.0\.0\.1:5199\/verify\?token=/.test(welcome.html));
const firstLink = welcome.text.match(/token=([A-Za-z0-9_-]+)/)[1];
if (server) check('only the token’s SHA-256 is kept, for 24 hours', ((r) => r?.hash === crypto.createHash('sha256').update(firstLink).digest('hex') && Math.abs(r.expires_at - r.created_at - 86400000) < 1000)(sql("SELECT * FROM email_tokens WHERE user_id = ? AND kind = 'verify'", selma.id)[0]) && !dump().includes(firstLink));
check('the demo people are verified', (await get(joose, '/api/me')).verified === true);
const miraForSale = (await get(joose, `/api/users/${mira.id}/public`)).find((p) => p.paid);
const eevaForSale = (await get(joose, `/api/users/${JSON.parse(everyone).find((x) => x.name === 'Eeva').id}/public`)).find((p) => p.price);
check('unverified: a paid plan, a subscription, a bought post, a price, payouts and a public profile are 403 verify-email', (await code403(await post(selma, '/api/me/plan', { plan: 'pro' }))) && (await code403(await post(selma, `/api/subscribe/${mira.id}`, {}))) && (await code403(await post(selma, `/api/posts/${eevaForSale.id}/buy`, {}))) && (await code403(await post(selma, '/api/me/price', { price: 3 }))) && (await code403(await post(selma, '/api/me/payouts', {}))) && (await code403(await post(selma, '/api/me/profile', { publicProfile: true, bio: '' }))));
check('…and nothing of it happened', (await get(selma, '/api/me/plan')).plan === 'lite' && (await get(selma, `/api/posts/${miraForSale.id}`)).post?.locked === true && !(await get(selma, '/api/me')).publicProfile);
check('unverified, the app is open: a private profile is saved, the feed reads', (await post(selma, '/api/me/profile', { publicProfile: false, bio: 'Hei' })).status === 200 && (await fetch(B + '/api/feed', { headers: h(selma) })).status === 200);
check('the link sent again: 200, and at once once more: 429 (one a minute)', (await post(selma, '/api/email/resend', {})).status === 200 && (await post(selma, '/api/email/resend', {})).status === 429);
check('a link sent again replaces the one before (the old one: 400)', (await verifyLink(firstLink)).status === 400 && (await lastToken('selma@example.com', 'verify')) !== firstLink);
const secondLink = await lastToken('selma@example.com', 'verify');
const verified = await verifyLink(secondLink);
check('opening the link verifies the address (no session needed)', verified.status === 200 && (await verified.json()).changed === false && (await get(selma, '/api/me')).verified === true);
check('the link works once (opened again: 400 token)', (await verifyLink(secondLink).then(json)).code === 'token');
check('verified: resend has nothing to do (400)', (await post(selma, '/api/email/resend', {})).status === 400);
check('verified: a public profile is saved', (await post(selma, '/api/me/profile', { publicProfile: true, bio: '' })).status === 200 && (await post(selma, '/api/me/profile', { publicProfile: false, bio: '' })).status === 200);

// a forgotten password: the same answer for an email with an account and one without
const known = await forgot('Selma@Example.com ');
const unknown = await forgot('nobody@example.com');
check('forgot: the same answer whether the email has an account or not', known.status === 200 && unknown.status === 200 && JSON.stringify(await known.json()) === JSON.stringify(await unknown.json()));
check('forgot: a link to the account’s address only (none to an address without one)', /\/reset\?token=[A-Za-z0-9_-]{43}\b/.test((await outbox('selma@example.com')).at(-1).text) && (await outbox('nobody@example.com')).length === 0);
check('forgot: not an email: 400', (await forgot('not-an-email')).status === 400);
const oldReset = await lastToken('selma@example.com', 'reset');
await forgot('selma@example.com');
await forgot('selma@example.com');
const newReset = await lastToken('selma@example.com', 'reset');
if (server) check('a reset link lasts an hour', ((r) => r && Math.abs(r.expires_at - r.created_at - 3600000) < 1000)(sql("SELECT * FROM email_tokens WHERE user_id = ? AND kind = 'reset'", selma.id)[0]));
check('forgot is braked for an email: the fourth in an hour is 429 (with an account or not)', (await forgot('selma@example.com')).status === 429);
const selmaAgain = { cookie: cookieOf(await signIn('selma@example.com', 'a-long-password')) };
// a socket of the old session, open while the password changes
const oldSocket = new Promise((resolve) => {
  const ws = new WebSocket(B.replace('http', 'ws') + '/ws', { headers: { cookie: selma.cookie } });
  ws.on('close', (code) => resolve(code));
  ws.on('error', () => resolve(-1));
  setTimeout(() => resolve('still open'), 5000);
});
await sleep(300);
check('reset: the older link is replaced by the newer (400 token)', (await reset(oldReset, 'a-new-password-1').then(json)).code === 'token');
check('reset: a password under 10 characters is refused (and the link not used)', (await reset(newReset, 'short').then(json)).code === 'short-password');
const resetRes = await reset(newReset, 'a-new-password-1');
const selmaNew = { ...(await resetRes.json()), cookie: cookieOf(resetRes) };
check('reset: the new password is set and the browser signed in with a fresh session', resetRes.status === 200 && selmaNew.id === selma.id && selmaNew.cookie.length > 20 && (await get(selmaNew, '/api/me')).id === selma.id);
check('reset: every other session of the account ended', (await fetch(B + '/api/me', { headers: h(selma) })).status === 401 && (await fetch(B + '/api/me', { headers: h(selmaAgain) })).status === 401);
check('reset: their sockets are closed (4001)', (await oldSocket) === 4001);
// (one failed sign-in from this address: counted in the brake on guessing below)
check('reset: the old password no longer signs in, the new one does', (await signIn('selma@example.com', 'a-long-password')).status === 401 && (await signIn('selma@example.com', 'a-new-password-1')).status === 200);
check('reset: the link works once (again: 400)', (await reset(newReset, 'a-new-password-2')).status === 400);
if (server) check('the links of hers are gone with the reset', sql('SELECT 1 FROM email_tokens WHERE user_id = ?', selma.id).length === 0);
const tuuliRes = await signUp({ name: 'Tuuli', username: 'tuuli', email: 'tuuli@example.com', password: 'a-long-password' });
const tuuli = { ...(await tuuliRes.json()), cookie: cookieOf(tuuliRes) };
await forgot('tuuli@example.com');
const tuuliReset = await lastToken('tuuli@example.com', 'reset');
if (server) {
  sqlWrite(`UPDATE email_tokens SET expires_at = ${Date.now() - 1} WHERE user_id = '${tuuli.id}' AND kind = 'reset'`);
  check('reset: an expired link gives 400 token, and the password and the session stay', (await reset(tuuliReset, 'a-new-password-1').then(json)).code === 'token' && (await get(tuuli, '/api/me')).id === tuuli.id && (await signIn('tuuli@example.com', 'a-long-password')).status === 200);
}
check('reset: following a reset link proves the address, so an unverified account is verified by it', await (async () => {
  await forgot('tuuli@example.com');
  const r = await reset(await lastToken('tuuli@example.com', 'reset'), 'a-long-password-2');
  return r.status === 200 && (await r.json()).verified === true;
})());

// changing the email: with the password, a link to the new address, a notice to the old
const change = (u, email, password) => post(u, '/api/me/email', { email, password });
check('email change: a wrong password is 403', (await change(selmaNew, 'selma.new@example.com', 'a-long-password')).status === 403);
check('email change: an address with an account is 409, the same one 400, not an email 400', (await change(selmaNew, 'aino@demo.d2m', 'a-new-password-1').then(json)).code === 'email-taken' && (await change(selmaNew, 'selma@example.com', 'a-new-password-1').then(json)).code === 'same-email' && (await change(selmaNew, 'nope', 'a-new-password-1')).status === 400);
const changed = await change(selmaNew, ' Selma.New@Example.com', 'a-new-password-1').then(json);
check('email change: asked, still the old address until confirmed; the new one is pending', changed.email === 'selma@example.com' && changed.pendingEmail === 'selma.new@example.com' && (await get(selmaNew, '/api/me')).pendingEmail === 'selma.new@example.com');
const notice = (await outbox('selma@example.com')).at(-1);
check('email change: the old address gets a notice naming the new one (no link); the new one a link', /vaihto/i.test(notice.subject) && notice.text.includes('selma.new@example.com') && !/token=/.test(notice.text) && /\/verify\?token=/.test((await outbox('selma.new@example.com')).at(-1)?.text ?? ''));
const switched = await verifyLink(await lastToken('selma.new@example.com', 'verify')).then(json);
check('email change: the link switches the address', switched.changed === true && switched.email === 'selma.new@example.com' && ((m) => m.email === 'selma.new@example.com' && m.verified === true && !m.pendingEmail)(await get(selmaNew, '/api/me')));
// (a second failed sign-in from this address)
check('email change: the new address signs in, the old one does not', (await signIn('selma.new@example.com', 'a-new-password-1')).status === 200 && (await signIn('selma@example.com', 'a-new-password-1')).status === 401);
await change(selmaNew, '<b>x</b>@example.com', 'a-new-password-1');
const marked = (await outbox('selma.new@example.com')).at(-1);
check('the mail escapes what it quotes (an address with markup in it stays text in the HTML)', marked.text.includes('<b>x</b>@example.com') && marked.html.includes('&lt;b&gt;x&lt;/b&gt;@example.com') && !marked.html.includes('<b>x</b>'));

// --- interests: topics on public posts, a person's interests, For You judged by them, topic search ---
// the words to topics, and the judges and the beam, by themselves (shared/topics.ts, shared/foryou.ts)
const unitCode = `import { matchTopics, words, postTopics } from './shared/topics.ts';
import { rank } from './shared/foryou.ts';
const table = [['leivoin ruisleipää', 'food'], ['metsässä', 'nature'], ['kirjaston', 'books'], ['Kesämatkalla', 'travel'], ['ÄITINI', 'family'], ['puhelimella', 'technology']];
const now = Date.now(), H = 3600e3;
const c = (id, authorId, hours, topics = []) => ({ id, authorId, createdAt: now - hours * H, title: id, body: '', messages: 0, topics, friend: false });
const cands = [c('a1', 'A', 1, [{ id: 'food', how: 'chosen' }]), c('a2', 'A', 2, [{ id: 'food', how: 'read' }]), c('a3', 'A', 3, [{ id: 'food', how: 'chosen' }]), c('a4', 'A', 4, [{ id: 'food', how: 'chosen' }]), c('b1', 'B', 5), c('b2', 'B', 6)];
const order = (r) => rank(cands, r, now).map((x) => x.id);
console.log(JSON.stringify({
  table: table.map(([text, want]) => matchTopics(text).length === 1 && matchTopics(text)[0] === want),
  keeps: JSON.stringify(words('Sää, säe; SAA! [kuva 2]')) === JSON.stringify(['sää', 'säe', 'saa']),
  chosen: postTopics(['art', 'nope', 'art'], 'Ruisleivän resepti', ''),
  read: postTopics(undefined, 'Ruisleivän resepti', 'Leivoin taas.'),
  food: order({ topics: ['food'], words: [] }), again: order({ topics: ['food'], words: [] }), none: order({ topics: [], words: [] }),
}));`;
const unit = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.resolve('node_modules/tsx/dist/cli.mjs'), '-e', unitCode], { encoding: 'utf8' });
const u = JSON.parse(unit.stdout.trim().split('\n').pop() || '{}');
check('the normaliser and the stems on Finnish inflections: leivoin ruisleipää → food, metsässä → nature, kirjaston → books, …', u.table?.length === 6 && u.table.every(Boolean));
check('the normaliser keeps ä and ö (sää is not saa) and leaves out picture markers', u.keeps === true);
check('topics chosen by the author are kept as chosen (known ones, once); none chosen: read from the words', JSON.stringify(u.chosen) === JSON.stringify([{ id: 'art', how: 'chosen' }]) && JSON.stringify(u.read) === JSON.stringify([{ id: 'food', how: 'read' }]));
const adjacent = (ids) => ids.some((id, i) => i > 0 && id[0] === ids[i - 1][0]);
check('the beam: never the same author twice in a row, at most 3 by one author while others are left', u.food?.length === 6 && !adjacent(u.food.slice(0, 5)) && u.food.slice(0, 5).filter((id) => id[0] === 'A').length <= 3);
check('the beam is deterministic (the same order twice)', JSON.stringify(u.food) === JSON.stringify(u.again));
check('no interests: the freshest first (the diversity rules aside)', u.none?.[0] === 'a1' && u.none?.[1] === 'b1');

// the server: For You for someone with no interests is the freshness order (the seed's posts have no messages)
const noInterests = await get(joose, '/api/fyp');
const fresh = [...noInterests].sort((a, b) => b.createdAt - a.createdAt).map((p) => p.id);
check('no interests: For You in freshness order, carried by freshness and conversation only', noInterests.length >= 4 && JSON.stringify(noInterests.map((p) => p.id)) === JSON.stringify(fresh) && noInterests.every((p) => p.because && p.because.topics.length === 0 && p.because.judges.every((j) => j === 'freshness' || j === 'conversation')));
check('two calls give the same order', JSON.stringify((await get(joose, '/api/fyp')).map((p) => p.id)) === JSON.stringify(noInterests.map((p) => p.id)));
const leoFresh = noInterests.find((p) => p.authorId === leo.id);
check('a seed post carries topics read from its words (Leo’s forest: nature, read)', !!leoFresh?.topics?.some((t) => t.id === 'nature' && t.how === 'read'));
const eevaId = JSON.parse(everyone).find((x) => x.name === 'Eeva').id;
const iidaRes = await signUp({ name: 'Iida', username: 'iida', email: 'iida@example.com', password: 'a-long-password' });
const iida = { ...(await iidaRes.json()), cookie: cookieOf(iidaRes) };
check('someone new has no interests and has not been asked', ((i) => i.asked === false && i.topics.length === 0 && i.words.length === 0)(await get(iida, '/api/me/interests')));
check('skipping the step after sign-up: asked, nothing chosen', ((i) => i.asked === true && i.topics.length === 0)(await post(iida, '/api/me/interests', { skip: true }).then(json)));
const saved = await post(iida, '/api/me/interests', { topics: ['nature', 'nope', 'nature'], words: [' Linnut ', 'x', 'LINNUT', 'hapanjuuri'] }).then(json);
check('interests are saved cleaned: known topics once, own words normalised (too short and doubles out)', JSON.stringify(saved) === JSON.stringify({ topics: ['nature'], words: ['linnut', 'hapanjuuri'], asked: true }));
let iidaFyp = await get(iida, '/api/fyp');
check('For You honours interests: Leo’s forest first for nature, because of nature', iidaFyp[0]?.authorId === leo.id && iidaFyp[0].because.topics.includes('nature') && iidaFyp[0].because.judges.includes('interest'));
check('her own words show in the trace (linnut in Leo’s post)', !!iidaFyp[0]?.because.words.includes('linnut'));
await post(iida, '/api/me/interests', { topics: ['food'], words: [] });
iidaFyp = await get(iida, '/api/fyp');
const eevaIds = iidaFyp.filter((p) => p.because.topics.includes('food')).map((p) => p.id);
check('for food, Eeva’s two posts come first and third: never the same author twice in a row', eevaIds.length === 2 && iidaFyp[0].id === eevaIds[0] && iidaFyp[2].id === eevaIds[1] && iidaFyp.every((p, i) => i === 0 || p.authorId !== iidaFyp[i - 1].authorId));
const peopleNow = await fetch(B + '/api/users', { headers: h(joose) }).then((r) => r.text());
check('interests are private: not in /api/users, not in anyone else’s interests', !/hapanjuuri|linnut|interests|"topics"/.test(peopleNow) && (await get(joose, '/api/me/interests')).topics.length === 0);
const publicBlog = (who, title, body, topics) => {
  const f = new FormData();
  f.set('kind', 'blog'); f.set('title', title); f.set('body', body); f.set('audience', 'public'); f.set('confirm', '1');
  if (topics !== undefined) f.set('topics', JSON.stringify(topics));
  f.set('image', new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }), 'c.jpg');
  return fetch(B + '/api/posts', { method: 'POST', headers: h(who), body: f });
};
check('a post with an unknown topic, or more than 3, is refused', (await publicBlog(iida, 'x', 'x', ['nope'])).status === 400 && (await publicBlog(iida, 'x', 'x', ['art', 'music', 'film', 'games'])).status === 400);
const artPost = await (await publicBlog(iida, 'Iltapäivä', 'Kävin katsomassa.', ['art', 'music'])).json();
const readPost = await (await publicBlog(iida, 'Linnut järvellä', 'Kävelin metsässä koko päivän.')).json();
const iidaPosts = await get(iida, `/api/users/${iida.id}/public`);
check('the author’s topics are kept as chosen', JSON.stringify(iidaPosts.find((p) => p.id === artPost.id)?.topics) === JSON.stringify([{ id: 'art', how: 'chosen' }, { id: 'music', how: 'chosen' }]));
check('without chosen topics they are read from the title and text', JSON.stringify(iidaPosts.find((p) => p.id === readPost.id)?.topics) === JSON.stringify([{ id: 'nature', how: 'read' }]));
const foodPage = await get(iida, '/api/topics/food');
check('topic search: food gives Eeva’s posts, newest first, and Eeva as the one who writes about it most', foodPage.posts.length === 2 && foodPage.posts.every((p) => p.authorId === eevaId) && foodPage.posts[0].createdAt > foodPage.posts[1].createdAt && foodPage.writers[0]?.user.id === eevaId);
check('topic search: a writer without a public profile is not listed; an unknown topic is 404', ((p) => p.posts.some((x) => x.id === artPost.id) && p.writers.length === 0)(await get(joose, '/api/topics/art')) && (await fetch(B + '/api/topics/nope', { headers: h(joose) })).status === 404);
if (server) check('a person’s interests are kept in a table of their own (one row)', sql('SELECT topics FROM interests WHERE user_id = ?', iida.id)[0]?.topics === '["food"]');
await post(iida, '/api/me/delete', { password: 'a-long-password' });
if (server) check('interests and post topics go with the account', sql('SELECT 1 FROM interests WHERE user_id = ?', iida.id).length === 0 && sql('SELECT 1 FROM post_topics WHERE post_id IN (?, ?)', artPost.id, readPost.id).length === 0 && sql('SELECT 1 FROM users WHERE id = ?', iida.id).length === 0);
const paid = fyp.find((p) => p.authorId === mira.id);
check('a paid post is locked for a non-subscriber (opening only)', paid.locked === true && !paid.body.includes('Kolmas'));
const lockedOpen = await get(joose, `/api/posts/${paid.id}`);
check('a locked post gives no conversation', lockedOpen.messages.length === 0 && lockedOpen.post.locked);
await post(joose, `/api/subscribe/${mira.id}`, {});
const unlocked = await get(joose, `/api/posts/${paid.id}`);
check('after subscribing it reads whole', !unlocked.post.locked && unlocked.post.body.includes('Kolmas'));
// a reader cancels: with payments off it ends at once, and the post locks again
await post(aino, `/api/subscribe/${mira.id}`, {});
check('Aino subscribes to Mira', (await get(aino, `/api/posts/${paid.id}`)).post.locked !== true);
const unsub = await post(aino, `/api/unsubscribe/${mira.id}`, {});
check('a reader cancels a subscription (payments off: at once)', unsub.status === 200 && (await get(aino, `/api/posts/${paid.id}`)).post.locked === true);
check('and Mira shows as not subscribed to', !(await get(aino, '/api/search?q=mira')).find((x) => x.user.id === mira.id).subscribed);
check('cancelling a subscription one does not have: 404', (await post(aino, `/api/unsubscribe/${mira.id}`, {})).status === 404);
const found = await get(joose, '/api/search?q=mi');
check('search finds Mira and Mikko, with who they are to Joose', found.some((x) => x.user.id === mira.id && x.subscribed && !x.friend) && found.some((x) => x.user.id === mikko.id && x.friend));
check('a profile shows only public posts', (await get(joose, `/api/users/${aino.id}/public`)).length === 0 && (await get(joose, `/api/users/${leo.id}/public`)).length === 1);
const pub = new FormData();
pub.set('kind', 'blog'); pub.set('title', 'Julkinen'); pub.set('body', 'x'); pub.set('audience', 'public');
pub.set('image', new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }), 'c.jpg');
check('a public post without the rule confirmed is refused', (await fetch(B + '/api/posts', { method: 'POST', headers: h(joose), body: pub })).status === 400);
pub.set('confirm', '1'); pub.set('paid', '1');
check('a paid post on Lite is refused', (await fetch(B + '/api/posts', { method: 'POST', headers: h(joose), body: pub })).status === 403);
const leoPost = fyp.find((p) => p.authorId === leo.id);
check('a report needs a known reason (sexual, ai or other)', (await post(joose, `/api/posts/${leoPost.id}/report`, { reason: 'intimate' })).status === 400 && (await post(joose, `/api/posts/${leoPost.id}/report`, { reason: 'whatever' })).status === 400);
for (const [u, reason] of [[joose, 'sexual'], [aino, 'ai'], [sara, 'sexual']]) await post(u, `/api/posts/${leoPost.id}/report`, { reason });
if (server) check('the reasons sexual and ai are kept as given', JSON.stringify(sql('SELECT reason FROM reports WHERE post_id = ? ORDER BY reason', leoPost.id).map((r) => r.reason)) === JSON.stringify(['ai', 'sexual', 'sexual']));
check('three reports take a post off For You', !(await get(mikko, '/api/fyp')).some((p) => p.id === leoPost.id));

const profiles = await get(joose, '/api/profiles');
check('browsing profiles lists everyone but you, public writers first', profiles.length >= 5 && !profiles.some((x) => x.user.id === joose.id) && profiles[0].publicPosts >= profiles[profiles.length - 1].publicPosts);

check('Lite cannot sell a subscription', (await post(joose, '/api/me/price', { price: 4.99 })).status === 403);
await post(joose, '/api/me/plan', { plan: 'pro' });
check('a price over 50 euros a month is refused', (await post(joose, '/api/me/price', { price: 50.01 })).status === 400);
check('50 euros a month is allowed on Unlimited', (await post(joose, '/api/me/price', { price: 50 })).status === 200);
check('with a subscription price set, Unlimited publishes a paid post', (await fetch(B + '/api/posts', { method: 'POST', headers: h(joose), body: pub })).status === 200);
await post(joose, '/api/me/plan', { plan: 'lite' });
check('back on Lite the subscription is no longer offered', (await get(joose, '/api/users')).find((u) => u.id === joose.id).price === undefined);

// --- public profiles: anyone may make one ---
check('no public profile: 404', (await fetch(B + `/api/users/${aino.id}/profile`, { headers: h(joose) })).status === 404);
check('Leo’s public profile: bio and public posts', ((p) => p.user.bio && p.posts.every((x) => x.audience === 'public'))(await get(joose, `/api/users/${leo.id}/profile`)));
await post(aino, '/api/me/profile', { publicProfile: true, bio: 'Matkalla.' });
const ainoPage = await get(joose, `/api/users/${aino.id}/profile`);
check('a Lite user makes a public profile; it shows no friends-only post', ainoPage.user.bio === 'Matkalla.' && ainoPage.posts.length === 0);

// --- plans: Lite and Unlimited ('pro') ---
const blog = (u, title) => {
  const f = new FormData();
  f.set('kind', 'blog'); f.set('title', title); f.set('body', 'x'); f.set('audience', 'friends');
  f.set('image', new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }), 'c.jpg');
  return fetch(B + '/api/posts', { method: 'POST', headers: h(u), body: f });
};
let plan = await get(sara, '/api/me/plan');
check('everyone starts on Lite, 3 blogs and 1 vlog a day', plan.plan === 'lite' && plan.blogsLeft === 3 && plan.vlogsLeft === 1);
const first = await (await blog(sara, 'Lite 1')).json();
check('a Lite blog disappears in 24 hours', Math.abs(first.expiresAt - first.createdAt - 24 * 3600e3) < 5000);
await blog(sara, 'Lite 2');
await blog(sara, 'Lite 3');
check('a fourth Lite blog in 24 hours is refused', (await blog(sara, 'Lite 4')).status === 429);
check('Lite cannot buy storage', (await post(sara, '/api/me/storage', {})).status === 403);
check('Lite cannot choose how long a post stays', (await post(sara, `/api/posts/${first.id}/life`, { life: null })).status === 403);
plan = await (await post(sara, '/api/me/plan', { plan: 'pro' })).json();
check('on Unlimited there is no daily limit', plan.plan === 'pro' && plan.blogsLeft === null && (await blog(sara, 'Pro 1')).status === 200);
const before = plan.quota;
plan = await (await post(sara, '/api/me/storage', { space: 'video' })).json();
check('Unlimited buys more video storage; text and pictures stay as they were', plan.quota.video > before.video && plan.quota.media === before.media);
plan = await (await post(sara, '/api/me/storage', { space: 'media' })).json();
check('and more text and pictures storage', plan.quota.media > before.media && plan.packs.video === 1 && plan.packs.media === 1);
check('a blog takes text and pictures space, not video space', plan.used.media > 0 && plan.used.video === 0);
await post(sara, `/api/posts/${first.id}/life`, { life: 'end' });
check('Unlimited ends a post: it goes to the archive, off the feeds', (await get(sara, '/api/me/archive')).some((p) => p.id === first.id) && !(await get(aino, '/api/feed')).some((p) => p.id === first.id));
await post(sara, `/api/posts/${first.id}/life`, { life: null });
check('and brings it back, permanent', (await get(aino, '/api/feed')).some((p) => p.id === first.id && p.expiresAt === null));

// --- the purchases log and the right of withdrawal (14 days, monthly contracts) ---
let bought = await get(sara, '/api/me/purchases');
check('the purchases log lists the plan and both packs, newest first', bought.length === 3 && bought[2].kind === 'plan' && bought[2].name === 'Unlimited' && bought[0].kind === 'pack');
check('all three can be withdrawn from (bought today)', bought.every((p) => p.withdrawable));
const videoPack = bought.find((p) => p.kind === 'pack' && p.name === 'video');
bought = await (await post(sara, `/api/me/withdraw/${videoPack.id}`, {})).json();
plan = await get(sara, '/api/me/plan');
check('withdrawing from the video pack ends it at once', plan.packs.video === 0 && plan.packs.media === 1 && bought.find((p) => p.id === videoPack.id).withdrawnAt > 0);
check('a contract withdrawn from cannot be withdrawn from again', (await post(sara, `/api/me/withdraw/${videoPack.id}`, {})).status === 404);
const saraPlan = bought.find((p) => p.kind === 'plan');
check('another person cannot withdraw from Sara’s contract', (await post(aino, `/api/me/withdraw/${saraPlan.id}`, {})).status === 404);
await post(sara, `/api/me/withdraw/${saraPlan.id}`, {});
plan = await get(sara, '/api/me/plan');
check('withdrawing from Unlimited goes back to Lite, and the packs go with it', plan.plan === 'lite' && plan.packs.media === 0 && (await get(sara, '/api/me/purchases')).every((p) => !p.withdrawable));

// --- vlogs through FFmpeg (skipped without it) ---
const tmpv = fs.mkdtempSync(path.join(os.tmpdir(), 'd2m-video-'));
const ff = spawnSync('ffmpeg', ['-version']).status === 0;
if (ff) {
  const long = path.join(tmpv, 'long.mp4');
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=1', '-t', '601', long]);
  const heavy = path.join(tmpv, 'heavy.mp4');
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=1920x1080:r=30', '-t', '3', '-c:v', 'libx264', '-b:v', '20M', heavy]);
  const vlog = (u, file, extra = {}) => {
    const f = new FormData();
    f.set('kind', 'vlog'); f.set('title', 'v'); f.set('body', ''); f.set('audience', 'friends');
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    f.set('video', new Blob([fs.readFileSync(file)], { type: 'video/mp4' }), path.basename(file));
    return fetch(B + '/api/posts', { method: 'POST', headers: h(u), body: f });
  };
  // the browser claims it is short; the server reads the file
  check('a Lite vlog over 10 minutes is refused (length read from the file)', (await vlog(mikko, long, { duration: '30' })).status === 400);
  const v = await (await vlog(mikko, heavy)).json();
  check('a Lite vlog lives two days', Math.abs(v.expiresAt - v.createdAt - 48 * 3600e3) < 5000 && Math.round(v.duration) === 3);
  let shrunk = null;
  for (let i = 0; i < 40 && !shrunk; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const p = (await get(mikko, `/api/posts/${v.id}`)).post;
    if (p.videoUrl.endsWith('.web.mp4')) shrunk = p;
  }
  check('the vlog takes video space, is compressed for streaming, and takes less of it', v.videoSize > 0 && !!shrunk && shrunk.videoSize < v.videoSize);
  check('a second Lite vlog the same day is refused', (await vlog(mikko, heavy)).status === 429);
  // Exclusive: a paid vlog is at least 30 minutes, read from the file
  await post(mikko, '/api/me/plan', { plan: 'exclusive' });
  const half = path.join(tmpv, 'half.mp4');
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=1', '-t', '1801', half]);
  const sell = { audience: 'public', confirm: '1', paid: '1' };
  check('Exclusive: a paid vlog under 30 minutes is refused, whatever the browser says', (await vlog(mikko, heavy, { ...sell, price: '10', duration: '2000' })).status === 400);
  check('a paid vlog over 50 euros is refused', (await vlog(mikko, half, { ...sell, price: '50,01' })).status === 400);
  const sold = await (await vlog(mikko, half, { ...sell, price: '50' })).json();
  check('a 30-minute vlog sells for 50 euros', sold.price === 5000 && sold.paid === true);
  await post(mikko, '/api/me/plan', { plan: 'lite' });
} else console.log('skip FFmpeg not found: the vlog checks did not run');
fs.rmSync(tmpv, { recursive: true, force: true });

// --- Exclusive: single posts sold, free ones among them, no monthly payment ---
const eeva = await login('Eeva');
const eevas = await get(aino, `/api/users/${eeva.id}/public`);
const recipe = eevas.find((p) => p.price);
check('Eeva (Exclusive) has a free post and one sold by itself', eevas.some((p) => !p.paid) && recipe?.price === 300 && recipe.locked);
check('Eeva sells no monthly subscription', (await post(aino, `/api/subscribe/${eeva.id}`, {})).status === 404);
check('buying a free post is refused', (await post(aino, `/api/posts/${eevas.find((p) => !p.paid).id}/buy`, {})).status === 400);
await post(aino, `/api/posts/${recipe.id}/buy`, {});
const boughtOpen = await get(aino, `/api/posts/${recipe.id}`);
check('bought once, it reads whole', !boughtOpen.post.locked && boughtOpen.post.body.includes('taikina'));
check('buying it opens it for the buyer only', (await get(mikko, `/api/posts/${recipe.id}`)).post.locked === true);
check('a single post bought is in the log, and cannot be withdrawn from', ((p) => p?.name === recipe.title && !p.withdrawable)((await get(aino, '/api/me/purchases')).find((p) => p.kind === 'post')));
await post(joose, '/api/me/plan', { plan: 'pro' });
await post(joose, '/api/me/price', { price: 3 });
await post(joose, '/api/me/plan', { plan: 'exclusive' });
check('going Exclusive ends the monthly subscription', (await get(joose, '/api/me/subscription')).price === 0);
check('Exclusive cannot sell a subscription', (await post(joose, '/api/me/price', { price: 3 })).status === 403);
const sellBlog = (price, pics = 0) => {
  const f = new FormData();
  f.set('kind', 'blog'); f.set('title', 'Myyty'); f.set('body', 'Alku.\n\n[kuva 1]\n\nLoppu.'); f.set('audience', 'public'); f.set('confirm', '1');
  if (price !== null) { f.set('paid', '1'); f.set('price', price); }
  f.set('image', new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }), 'c.jpg');
  for (let i = 0; i < pics; i++) f.append('pictures', new Blob([new Uint8Array([71, 73, 70, 56, 57, 97])], { type: 'image/gif' }), `p${i}.gif`);
  return fetch(B + '/api/posts', { method: 'POST', headers: h(joose), body: f });
};
check('a paid Exclusive blog needs its own price', (await sellBlog('')).status === 400);
check('a blog over 5 euros is refused', (await sellBlog('5,01')).status === 400);
const sold5 = await (await sellBlog('5', 2)).json();
check('a blog sells for 5 euros, with a picture and a GIF among its text', sold5.price === 500 && sold5.pictures?.length === 2);
check('a free post on Exclusive, no price', ((p) => !p.paid && !p.price)(await (await sellBlog(null)).json()));
const lockedSold = await get(aino, `/api/posts/${sold5.id}`);
check('locked, the pictures among the text are not given', lockedSold.post.locked && !lockedSold.post.pictures);
// its author deletes a post bought within 30 days: the purchase is refunded (payments off: only marked)
await post(aino, `/api/posts/${sold5.id}/buy`, {});
await fetch(B + `/api/posts/${sold5.id}`, { method: 'DELETE', headers: h(joose) });
if (server) check('a bought post deleted by its author: the purchase is marked refunded', sql("SELECT 1 FROM purchase_log WHERE kind = 'post' AND item = ? AND refunded_at > 0", sold5.id).length === 1);
await post(joose, '/api/me/plan', { plan: 'lite' });

// --- profile picture and wallpaper ---
const pic = (which, u) => {
  const f = new FormData();
  f.set('image', new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }), 'p.jpg');
  return fetch(B + `/api/me/${which}`, { method: 'POST', headers: h(u), body: f }).then(json);
};
const withPic = await pic('avatar', aino);
const withWall = await pic('wallpaper', aino);
check('a profile picture and a wallpaper are set', withPic.avatarUrl?.startsWith('/uploads/') && withWall.wallpaperUrl?.startsWith('/uploads/'));
check('the public profile shows them', ((p) => p.user.avatarUrl && p.user.wallpaperUrl)(await get(joose, `/api/users/${aino.id}/profile`)));
const cleared = await fetch(B + '/api/me/avatar', { method: 'POST', headers: h(aino), body: new FormData() }).then(json);
check('a profile picture is taken away', !cleared.avatarUrl);
const anon = new FormData();
anon.set('image', new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }), 'p.jpg');
check('an upload without a session: 401', (await fetch(B + '/api/me/avatar', { method: 'POST', headers: { 'x-d2m': '1' }, body: anon })).status === 401);

// --- an author stops selling: every reader's subscription to them ends ---
const kalleRes = await signUp({ name: 'Kalle', username: 'kalle', email: 'kalle@example.com', password: 'a-long-password' });
const kalle = { ...(await kalleRes.json()), cookie: cookieOf(kalleRes) };
// (selling waits for a confirmed email)
check('Kalle confirms his email', await confirmEmail('kalle@example.com'));
const sell = async () => {
  await post(kalle, '/api/me/plan', { plan: 'pro' });
  await post(kalle, '/api/me/price', { price: 3 });
  await post(aino, `/api/subscribe/${kalle.id}`, {});
  return (await get(kalle, '/api/me/subscription')).subscribers === 1;
};
const noReaders = async () => (await get(kalle, '/api/me/subscription')).subscribers === 0 && !(await get(aino, '/api/profiles')).find((x) => x.user.id === kalle.id).subscribed;
check('Kalle sells a subscription on Unlimited, and Aino subscribes', await sell());
await post(kalle, '/api/me/plan', { plan: 'exclusive' });
check('Kalle goes Exclusive: Aino’s subscription to him ends', await noReaders());
check('back on Unlimited, Aino subscribes again', await sell());
await post(kalle, '/api/me/plan', { plan: 'lite' });
check('Kalle goes back to Lite: Aino’s subscription to him ends', await noReaders());
check('on Unlimited once more, Aino subscribes again', await sell());
await post(kalle, '/api/me/price', { price: 0 });
check('Kalle takes his price away: Aino’s subscription to him ends', await noReaders());
// the Stripe side, without Stripe, on a store of its own: which ids would be cancelled, what a
// withdrawal refunds, a Checkout session granted once, and a transaction that fails halfway leaving nothing done
const storeData = fs.mkdtempSync(path.join(os.tmpdir(), 'd2m-store-'));
const code = `import { Store } from './server/store.ts';
import { unusedPart } from './server/pay.ts';
const s = new Store(process.env.CHECK_DB, '', true);
const [a, b, k, c] = ['Joose', 'Mikko', 'Mira', 'Leo'].map((n) => s.byUsername(n));
const author = (sub, reader, authorId) => s.grant(sub, reader.id, { kind: 'author', authorId }, { amount: 300, subscription: 'sub_' + sub });
const granted = [author('1', a, k.id), author('2', b, k.id), author('3', k, c.id), author('1', a, k.id)];
const aino = s.byUsername('aino');
const before = [s.postsOf(aino.id).length, s.messages(s.postsOf(aino.id)[0].id).length];
const deletePost = s.deletePost.bind(s);
s.deletePost = (id) => { deletePost(id); throw new Error('a crash halfway'); };
let threw = false;
try { s.deleteUser(aino.id); } catch { threw = true; }
const after = [s.postsOf(aino.id).length, s.messages(s.postsOf(aino.id)[0]?.id ?? '').length];
const kept = threw && !!s.user(aino.id) && JSON.stringify(before) === JSON.stringify(after);
s.deletePost = deletePost;
s.deleteUser(aino.id);
console.log(JSON.stringify([s.readerSubscriptions({ author: k.id }).sort(), s.readerSubscriptions({ reader: k.id }), unusedPart(999, 0, 30, 15), unusedPart(999, 0, 30, 40), granted, kept && !s.user(aino.id)]));
s.close();`;
const picked = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.resolve('node_modules/tsx/dist/cli.mjs'), '-e', code], { env: { ...process.env, D2M_PAY: 'off', CHECK_DB: path.join(storeData, 'db.sqlite') }, encoding: 'utf8' });
const [readers, ofReader, half, none, granted, rolledBack] = JSON.parse(picked.stdout.trim().split('\n').pop() || '[]');
check('an author’s readers’ Stripe subscriptions are the ones cancelled; a withdrawal refunds the unused part', JSON.stringify([readers, ofReader, half, none]) === JSON.stringify([['sub_1', 'sub_2'], ['sub_3'], 500, 0]));
check('a Checkout session is granted once', JSON.stringify(granted) === JSON.stringify([true, true, true, false]));
check('deleting an account that fails halfway rolls back whole (her post and its messages are still there)', rolledBack === true);
fs.rmSync(storeData, { recursive: true, force: true });

// --- deleting an account: everything of theirs goes, and they cannot sign in ---
const pirjoRes = await signUp({ name: 'Pirjo', username: 'pirjo', email: 'pirjo@example.com', password: 'a-long-password' });
const pirjo = { ...(await pirjoRes.json()), cookie: cookieOf(pirjoRes) };
// (subscribing waits for a confirmed email)
await confirmEmail('pirjo@example.com');
await post(pirjo, '/api/friends', { username: '@aino' });
const reported = await (await blog(pirjo, 'Ilmoitettu')).json();
await post(aino, `/api/posts/${reported.id}/report`, { reason: 'other' });
if (server) check('a report is kept with its post', sql('SELECT 1 FROM reports WHERE post_id = ?', reported.id).length === 1);
await fetch(B + `/api/posts/${reported.id}`, { method: 'DELETE', headers: h(pirjo) });
if (server) check('deleting a post removes its reports', sql('SELECT 1 FROM reports WHERE post_id = ?', reported.id).length === 0);
const pirjoPost = await (await blog(pirjo, 'Pirjon juttu')).json();
await post(pirjo, `/api/posts/${pirjoPost.id}/notes`, { text: 'Ainolle', recipients: [aino.id] });
await post(pirjo, `/api/subscribe/${mira.id}`, {});
await post(pirjo, `/api/posts/${leoPost.id}/report`, { reason: 'other' });
const say = (u, postId, text) =>
  new Promise((resolve) => {
    const ws = new WebSocket(B.replace('http', 'ws') + '/ws', { headers: { cookie: u.cookie } });
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', postId }));
      ws.send(JSON.stringify({ type: 'say', postId, text }));
      setTimeout(() => (ws.close(), resolve()), 300);
    });
    ws.on('error', resolve);
  });
await post(aino, '/api/friends', { username: 'pirjo' });
await say(pirjo, pirjoPost.id, 'Pirjon viesti');
const pirjoOpen = await get(aino, `/api/posts/${pirjoPost.id}`);
check('Pirjo’s post, her BoVNote and her message are there for Aino', pirjoOpen.messages.some((m) => m.text === 'Pirjon viesti') && pirjoOpen.notes.length === 1);
await say(pirjo, lofoten.id, 'Pirjo Ainon jutussa');
check('deleting an account needs the right password', (await post(pirjo, '/api/me/delete', { password: 'not-the-password' })).status === 403);
const gone = await post(pirjo, '/api/me/delete', { password: 'a-long-password' });
check('Pirjo deletes her account; the cookie is cleared', gone.status === 200 && /d2m_session=;.*Max-Age=0/i.test(gone.headers.getSetCookie().join('\n')));
check('her session is gone, and she cannot sign in again', (await fetch(B + '/api/me', { headers: h(pirjo) })).status === 401 && (await signIn('pirjo@example.com', 'a-long-password')).status === 401);
check('another person no longer sees her post or her messages', !(await get(aino, '/api/feed')).some((p) => p.id === pirjoPost.id) && (await fetch(B + `/api/posts/${pirjoPost.id}`, { headers: h(aino) })).status === 404 && !(await get(aino, `/api/posts/${lofoten.id}`)).messages.some((m) => m.userId === pirjo.id));
check('nor her among the people or friends', !(await get(aino, '/api/users')).some((u) => u.id === pirjo.id) && !(await get(aino, '/api/friends')).some((u) => u.id === pirjo.id));
if (server) {
  const after = dump();
  check('nothing in the data names her any more', !after.includes(pirjo.id) && !after.includes('pirjo@example.com'));
  check('the purchases log keeps her subscription, without her', sql("SELECT 1 FROM purchase_log WHERE kind = 'author' AND item = ? AND user_id IS NULL", mira.id).length === 1);
}

// --- search engines: path addresses, each page's head, robots.txt, the sitemap ---
// The server fills the head of index.html: the built one in dist/, or without a build the source
// index.html (the same head), so these run without building the site.
const seo = await import(new URL('../server/seo.ts', import.meta.url).href);
check('the escape helper escapes < > & " \'', seo.esc(`<script>alert("x")</script> & 'y'`) === '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
check('a Stripe way back is a path of this site: /me, /post/x, /@mira', ['/me', '/post/abc123', '/@mira', '/u/abc'].every((b) => seo.validBack(b)));
check('…never another site, a hash route, a query or not a text', !['//evil.example', '/\\evil.example', 'https://evil.example/me', '#/me', 'me', '/me?x=1', '/me#x', '/ me', '', null, 42, '/' + 'a'.repeat(300)].some((b) => seo.validBack(b)));
const pageOf = async (p) => {
  const r = await fetch(B + p);
  return { status: r.status, type: r.headers.get('content-type') ?? '', html: await r.text() };
};
const headOf = (html) => html.slice(0, html.indexOf('</head>'));
const metaOf = (html, attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];
const titleOf = (html) => html.match(/<title>([^<]*)<\/title>/)?.[1];
const canonicalOf = (html) => html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
const ldOf = (html) => ((m) => m && JSON.parse(m[1]))(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/));
const indexable = (html) => metaOf(html, 'name', 'robots') === 'index, follow';
const noindex = (html) => metaOf(html, 'name', 'robots') === 'noindex, nofollow';

const home = await pageOf('/');
check('the landing page: Finnish, its title and description, canonical, indexed', home.status === 200 && home.html.includes('<html lang="fi">') && titleOf(home.html).startsWith('Dear to Me') && metaOf(home.html, 'name', 'description').startsWith('Some ystävillesi') && canonicalOf(home.html) === B + '/' && indexable(home.html) && ldOf(home.html)['@type'] === 'WebSite');
check('…one title and one description (the defaults of index.html give way), og and twitter tags, the app’s script kept', (headOf(home.html).match(/<title>/g) ?? []).length === 1 && (home.html.match(/<meta name="description"/g) ?? []).length === 1 && metaOf(home.html, 'property', 'og:title') && metaOf(home.html, 'property', 'og:image')?.startsWith(B) && metaOf(home.html, 'name', 'twitter:card') && /<script type="module"[^>]*src="[^"]+"/.test(home.html) && home.html.includes('<div id="root"></div>'));
const terms = await pageOf('/terms');
check('a legal page: its title, indexed', titleOf(terms.html) === 'Käyttöehdot · Dear to Me' && indexable(terms.html) && canonicalOf(terms.html) === B + '/terms');
check('the private pages are not indexed: /me, /write, /letters, /friends, /search, /fyp, /login, /signup, /welcome, /write/letter', (await Promise.all(['/me', '/write', '/letters', '/friends', '/search', '/fyp', '/login', '/signup', '/welcome', '/write/letter'].map(pageOf))).every((p) => p.status === 200 && noindex(p.html) && !canonicalOf(p.html)));

// a public profile: name, bio, picture, its public posts (not the hidden one)
// (and "$'", "$&": what a careless string replace would turn into the rest of the page)
const xssTitle = `<script>alert("x")</script> & kahvi $' $&`;
const xssPost = await (await publicBlog(mira, xssTitle, 'Aamun ensimmäinen kappale.\n\nToinen kappale.')).json();
const endedPost = await (await publicBlog(mira, 'Loppunut juttu', 'Tämä loppui.')).json();
check('Mira ends a public post of hers (it goes to her archive)', (await post(mira, `/api/posts/${endedPost.id}/life`, { life: 'end' })).status === 200);
const miraPage = await pageOf('/@mira');
const miraLd = ldOf(miraPage.html);
check('a public profile: “Mira (@mira) · Dear to Me”, the bio, indexed, canonical /@mira, og:type profile', miraPage.status === 200 && titleOf(miraPage.html) === 'Mira (@mira) · Dear to Me' && metaOf(miraPage.html, 'name', 'description').startsWith('Kirjoitan joka aamu') && indexable(miraPage.html) && canonicalOf(miraPage.html) === B + '/@mira' && metaOf(miraPage.html, 'property', 'og:type') === 'profile');
check('…its wallpaper as og:image, and JSON-LD ProfilePage with a Person', metaOf(miraPage.html, 'property', 'og:image') === B + '/seed/kahvi.jpg' && miraLd['@type'] === 'ProfilePage' && miraLd.mainEntity['@type'] === 'Person' && miraLd.mainEntity.name === 'Mira' && miraLd.mainEntity.url === B + '/@mira');
check('…and a readable version in the root element: name, bio, links to her public posts (not the ended one)', miraPage.html.includes('<div id="root"><article class="prerender"><h1>Mira</h1>') && miraPage.html.includes(`<a href="/post/${xssPost.id}">`) && miraPage.html.includes(`<a href="/post/${paid.id}">`) && !miraPage.html.includes(endedPost.id));
check('the profile is the same at /@MIRA', titleOf((await pageOf('/@MIRA')).html) === 'Mira (@mira) · Dear to Me');
const saraPage = await pageOf('/@sara');
const nobodyPage = await pageOf('/@nobody.here');
check('no public profile: not indexed, a generic title, her name nowhere', saraPage.status === 200 && noindex(saraPage.html) && titleOf(saraPage.html) === 'Dear to Me' && !/sara/i.test(saraPage.html) && saraPage.html.includes('<div id="root"></div>'));
check('…the very same page as for no one at all (nothing tells she exists)', saraPage.html === nobodyPage.html);
const byId = await pageOf(`/u/${mira.id}`);
check('/u/<id>: not indexed, its canonical is /@username', noindex(byId.html) && canonicalOf(byId.html) === B + '/@mira');
check('/u/<id> of no public profile: no canonical, nothing told', noindex((await pageOf(`/u/${sara.id}`)).html) && !canonicalOf((await pageOf(`/u/${sara.id}`)).html));

// posts
const xssPage = await pageOf(`/post/${xssPost.id}`);
const xssLd = ldOf(xssPage.html);
check('a deep link to a post is the app’s page: 200, HTML', xssPage.status === 200 && xssPage.type.startsWith('text/html') && /<script type="module"/.test(xssPage.html));
check('a public post: its title (escaped), the first paragraph, indexed, canonical, og:type article', titleOf(xssPage.html) === `${seo.esc(xssTitle)} · Mira · Dear to Me` && metaOf(xssPage.html, 'name', 'description') === 'Aamun ensimmäinen kappale.' && indexable(xssPage.html) && canonicalOf(xssPage.html) === B + `/post/${xssPost.id}` && metaOf(xssPage.html, 'property', 'og:type') === 'article');
check('…a <script> in a title is never markup: not in the head, the body or the JSON-LD', !xssPage.html.includes('<script>alert') && !xssPage.html.includes('</script> &') && xssLd.headline === xssTitle);
check('…its cover as og:image (large card), JSON-LD BlogPosting with the author’s name and address and datePublished', metaOf(xssPage.html, 'property', 'og:image')?.startsWith(B + '/') && metaOf(xssPage.html, 'name', 'twitter:card') === 'summary_large_image' && xssLd['@type'] === 'BlogPosting' && xssLd.author.name === 'Mira' && xssLd.author.url === B + '/@mira' && xssLd.datePublished === new Date(xssPost.createdAt).toISOString());
check('…a readable version: title, author linked, opening', xssPage.html.includes(`<div id="root"><article class="prerender"><h1>${seo.esc(xssTitle)}</h1>`) && xssPage.html.includes('<a href="/@mira">Mira</a>') && xssPage.html.includes('<p>Aamun ensimmäinen kappale.</p>'));
const paidPage = await pageOf(`/post/${paid.id}`);
check('a paid post: indexed with its opening only (nothing after the first paragraph, in the head, the body or the JSON-LD)', indexable(paidPage.html) && paidPage.html.includes(seo.esc(paid.body.split(/\n\s*\n/)[0]).slice(0, 40)) && !paidPage.html.includes('Kolmas') && ldOf(paidPage.html).isAccessibleForFree === false);
const privatePage = await pageOf(`/post/${lofoten.id}`);
const unknownPage = await pageOf('/post/nosuchpost');
check('a friends-only post: not indexed, its title nowhere, the same page as no post at all', privatePage.status === 200 && noindex(privatePage.html) && !privatePage.html.includes('Lofooteilla') && privatePage.html === unknownPage.html);
check('a letter, a hidden (reported) post and an ended one: not indexed, their titles nowhere', (await Promise.all([[letter.id, 'Kirje'], [leoPost.id, leoPost.title], [endedPost.id, 'Loppunut']].map(async ([id, title]) => ((p) => noindex(p.html) && !p.html.includes(title))(await pageOf(`/post/${id}`)))) ).every(Boolean));
check('the server’s own paths and missing files are not pages: /api/nope, /media/x, /nope.png are 404', (await Promise.all(['/api/nope', '/media/nope', '/nope.png'].map((p) => fetch(B + p).then((r) => r.status)))).every((s) => s === 404));

// robots.txt and the sitemap
const robots = await fetch(B + '/robots.txt');
const robotsText = await robots.text();
check('robots.txt: allows the public pages and their pictures, disallows the private ones and the API, names the sitemap', robots.status === 200 && robots.headers.get('content-type').startsWith('text/plain') && ['Allow: /@', 'Allow: /post/', 'Allow: /terms', 'Disallow: /api/', 'Disallow: /me', 'Disallow: /u/', 'Allow: /uploads/', 'Allow: /media/', 'Disallow: /login'].every((l) => robotsText.split('\n').includes(l)) && robotsText.includes(`Sitemap: ${B}/sitemap.xml`));
const sitemapRes = await fetch(B + '/sitemap.xml');
const sitemap = await sitemapRes.text();
const inMap = (p) => sitemap.includes(`<loc>${B}${p}</loc>`);
check('the sitemap: XML, the landing page and the legal pages, with a short cache', sitemapRes.status === 200 && sitemapRes.headers.get('content-type').includes('xml') && sitemap.startsWith('<?xml') && ['/', '/terms', '/privacy', '/refunds', '/rules', '/contact'].every(inMap) && /max-age=\d{1,4}\b/.test(sitemapRes.headers.get('cache-control')));
check('…every public profile (with lastmod) and live public post, the paid one too', ['/@mira', '/@leo', '/@eeva', '/@aino', `/post/${xssPost.id}`, `/post/${paid.id}`].every(inMap) && sitemap.includes(`<loc>${B}/post/${xssPost.id}</loc><lastmod>${new Date(xssPost.createdAt).toISOString()}</lastmod>`));
check('…but no private profile, private post, letter, hidden or ended post', !['/@sara', '/@joose', `/post/${lofoten.id}`, `/post/${letter.id}`, `/post/${leoPost.id}`, `/post/${endedPost.id}`].some(inMap));

// --- moderation: the queue (moderators only), decisions with statements of reasons, complaints, suspensions, notices, the log ---
{
  // D2M_MODERATORS: usernames, an @ and any case fine, the rest left out; in demo mode without it, @joose
  const parsed = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.resolve('node_modules/tsx/dist/cli.mjs'), '-e', `import { parseModerators } from './server/moderation.ts';
console.log(JSON.stringify([[...parseModerators(' @Joose, aino ,, @@bad, MIRA, ab', false)], [...parseModerators('', true)], [...parseModerators(undefined, false)], [...parseModerators('aino', true)], [...parseModerators(' , ', false)]]));`], { encoding: 'utf8' });
  check('D2M_MODERATORS: usernames (an @, spaces and case fine; not usernames left out); demo without it: joose; none otherwise', parsed.stdout.trim().split('\n').pop() === JSON.stringify([['joose', 'aino', 'mira'], ['joose'], [], ['aino'], []]));

  const mod = (u, p, body) => post(u, p, body);
  check('a moderator’s /api/me says so (D2M_DEMO: @joose), another’s does not', (await get(joose, '/api/me')).moderator === true && (await get(aino, '/api/me')).moderator === undefined);
  const queueRes = await fetch(B + '/api/mod/queue', { headers: h(joose) });
  check('a moderator sees the queue; others get 403, and no session 401', queueRes.status === 200 && Array.isArray((await queueRes.json()).posts) && (await fetch(B + '/api/mod/queue', { headers: h(aino) })).status === 403 && (await fetch(B + '/api/mod/queue')).status === 401 && (await fetch(B + '/api/mod/log', { headers: h(aino) })).status === 403);
  check('every moderation change is the moderators’ alone (403)', (await Promise.all([mod(aino, `/api/mod/posts/${lofoten.id}`, { action: 'keep', reason: 'xxx' }), mod(aino, '/api/mod/suspend', { username: 'mikko', rule: 'sexual', reason: 'xxx' }), mod(aino, '/api/mod/unsuspend', { userId: mikko.id, reason: 'xxx' }), mod(aino, '/api/mod/complaints/x', { outcome: 'upheld', reason: 'xxx' }), mod(aino, '/api/mod/notices/x', { reason: 'xxx' })])).every((r) => r.status === 403));
  check('a moderator keeps their username (D2M_MODERATORS names it)', (await post(joose, '/api/me/username', { username: 'joose.k' })).status === 403);

  // an author of our own: Tilda, on Exclusive, sells a post; Aino buys it
  const tildaRes = await signUp({ name: 'Tilda', username: 'tilda', email: 'tilda@example.com', password: 'a-long-password' });
  const tilda = { ...(await tildaRes.json()), cookie: cookieOf(tildaRes) };
  await confirmEmail('tilda@example.com');
  const pub = (u, title, extra = {}) => {
    const f = new FormData();
    f.set('kind', 'blog'); f.set('title', title); f.set('body', `${title}: sisältö, jota ei säilytetä.`); f.set('audience', 'public'); f.set('confirm', '1');
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    f.set('image', new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }), 'c.jpg');
    return fetch(B + '/api/posts', { method: 'POST', headers: h(u), body: f }).then(json);
  };
  const kept = await pub(tilda, 'Jätettävä');
  const report3 = async (p, reasons = ['sexual', 'sexual', 'ai']) => {
    for (const [i, u] of [aino, mikko, sara].entries()) await post(u, `/api/posts/${p.id}/report`, { reason: reasons[i] });
  };
  await report3(kept);
  const q1 = await get(joose, '/api/mod/queue');
  const total = (x) => Object.values(x.reports).reduce((a, b) => a + b, 0) + x.notices.length;
  const item = q1.posts.find((x) => x.post.id === kept.id);
  check('the queue: a reported post with its reasons and counts, the post itself, its author, most reported first', item?.reports.sexual === 2 && item.reports.ai === 1 && item.post.body.includes('ei säilytetä') && item.author.username === 'tilda' && item.post.hidden === true && q1.posts.every((x, i, a) => i === 0 || total(a[i - 1]) >= total(x)));
  check('a decision needs a written reason, and remove and restrict the rule broken', (await mod(joose, `/api/mod/posts/${kept.id}`, { action: 'keep', reason: ' ' })).status === 400 && (await mod(joose, `/api/mod/posts/${kept.id}`, { action: 'remove', reason: 'Rikkoo sääntöjä.' })).status === 400 && (await mod(joose, `/api/mod/posts/${kept.id}`, { action: 'explode', reason: 'xxx' })).status === 400);
  const keepRes = await mod(joose, `/api/mod/posts/${kept.id}`, { action: 'keep', reason: 'Juttu ei riko sisältösääntöjä.' });
  check('keep: the reports are cleared and the post is back on For You', keepRes.status === 200 && (!server || sql('SELECT 1 FROM reports WHERE post_id = ?', kept.id).length === 0) && (await get(mikko, '/api/fyp')).some((p) => p.id === kept.id) && !(await get(joose, '/api/mod/queue')).posts.some((x) => x.post.id === kept.id));
  check('…the reporters are told it stays; the author gets no statement', (await outbox('aino@demo.d2m')).some((m) => m.text.includes('"Jätettävä"') && m.text.includes('jätettiin palveluun')) && !(await outbox('tilda@example.com')).some((m) => m.subject.includes('perustelut')));

  // remove: a sold post, reported three times and noticed through the form
  await post(tilda, '/api/me/plan', { plan: 'exclusive' });
  const sold = await pub(tilda, 'Poistettava', { paid: '1', price: '2' });
  await post(aino, `/api/posts/${sold.id}/buy`, {});
  await report3(sold, ['sexual', 'sexual', 'sexual']);
  const noticeRes = await fetch(B + '/api/notices', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email: 'Ulko@Example.com', url: `https://deartome.example/post/${sold.id}`, reason: 'sexual', explanation: 'Seksuaalista sisältöä julkisesti.', goodFaith: true }) });
  check('a notice without an account is taken (and its receipt mailed), and it joins the post in the queue', noticeRes.status === 200 && (await outbox('ulko@example.com')).some((m) => m.subject.includes('vastaanotettu')) && (await get(joose, '/api/mod/queue')).posts.find((x) => x.post.id === sold.id)?.notices.length === 1);
  check('a moderator does not decide on their own post', await (async () => {
    await post(joose, '/api/me/plan', { plan: 'pro' });
    const own = await pub(joose, 'Joosen oma');
    await post(joose, '/api/me/plan', { plan: 'lite' });
    await post(aino, `/api/posts/${own.id}/report`, { reason: 'other' });
    const r = await mod(joose, `/api/mod/posts/${own.id}`, { action: 'keep', reason: 'xxx' });
    return r.status === 403;
  })());
  const removed = await mod(joose, `/api/mod/posts/${sold.id}`, { action: 'remove', rule: 'sexual', reason: 'Juttu sisältää seksuaalista sisältöä, joka on kielletty.' }).then(json);
  check('remove: the post is gone (404), its reports with it', removed.action === 'remove' && (await fetch(B + `/api/posts/${sold.id}`, { headers: h(aino) })).status === 404 && (!server || sql('SELECT 1 FROM reports WHERE post_id = ?', sold.id).length === 0));
  if (server) {
    const rec = sql('SELECT * FROM mod_decisions WHERE id = ?', removed.id)[0];
    check('…a record of it is kept: the post’s id and title, its author, the rule, the reason and the facts, never its content', rec?.post_id === sold.id && rec.post_title === 'Poistettava' && rec.user_id === tilda.id && rec.username === 'tilda' && rec.rule === 'sexual' && JSON.parse(rec.facts).reports.sexual === 3 && JSON.parse(rec.facts).notices.sexual === 1 && JSON.parse(rec.facts).hidden === true && !JSON.stringify(sql('SELECT * FROM mod_decisions')).includes('ei säilytetä'));
    check('…and its buyer is not refunded (removed for breaking the rules)', sql("SELECT refunded_at FROM purchase_log WHERE kind = 'post' AND item = ?", sold.id).length === 1 && sql("SELECT refunded_at FROM purchase_log WHERE kind = 'post' AND item = ?", sold.id)[0].refunded_at === null);
  }
  const statement = (await outbox('tilda@example.com')).find((m) => m.subject.includes('perustelut'));
  check('…the author is emailed a statement of reasons: what, which rule (linked), the facts, by a person, how to complain (a link)', !!statement && statement.text.includes('"Poistettava" on poistettu') && statement.text.includes('seksuaalinen sisältö') && statement.text.includes('/rules') && statement.text.includes('3 ilmoitusta käyttäjiltä: seksuaalista sisältöä 3') && statement.text.includes('1 ilmoitus ilmoituslomakkeella') && statement.text.includes('Päätöksen teki ihminen') && statement.text.includes(`/complaint/${removed.id}?token=`) && statement.text.includes('Facts:'));
  check('…the reporters and the notice’s sender are told it was removed, the author unnamed', (await outbox('mikko@demo.d2m')).some((m) => m.text.includes('"Poistettava"') && m.text.includes('poistettiin') && !m.text.includes('tilda')) && (await outbox('ulko@example.com')).some((m) => m.text.includes('poistettiin')));

  // the author complains, signed in
  const complaintOf = (id, u, token) => fetch(B + `/api/complaints/${id}${token ? `?token=${token}` : ''}`, u ? { headers: h(u) } : {});
  check('the complaint page: the author signed in sees the decision and may complain; another person and no one without the link may not', ((p) => p.canComplain && p.decision.action === 'remove' && p.decision.reason.includes('seksuaalista'))(await complaintOf(removed.id, tilda).then(json)) && (await complaintOf(removed.id, mikko)).status === 403 && (await complaintOf(removed.id)).status === 403 && (await complaintOf(removed.id, null, 'not-a-token')).status === 403);
  check('a complaint needs words', (await post(tilda, `/api/complaints/${removed.id}`, { text: 'ei' })).status === 400);
  const filed = await post(tilda, `/api/complaints/${removed.id}`, { text: 'Juttu ei ollut seksuaalinen: se kertoi terveydestä.' });
  check('the author complains; it is in the moderators’ queue; a second complaint is refused', filed.status === 200 && (await filed.json()).complaint?.text.includes('terveydestä') && (await get(joose, '/api/mod/queue')).complaints.some((c) => c.decisionId === removed.id) && (await post(tilda, `/api/complaints/${removed.id}`, { text: 'Vielä kerran: väärä päätös.' })).status === 409);
  const openComplaint = (await get(joose, '/api/mod/queue')).complaints.find((c) => c.decisionId === removed.id);
  const reversed = await mod(joose, `/api/mod/complaints/${openComplaint.id}`, { outcome: 'reversed', reason: 'Valitus oli aiheellinen: juttu oli sallittu.' });
  check('a moderator reverses it; the author is told (the content cannot come back)', reversed.status === 200 && (await reversed.json()).reversedAt > 0 && (await outbox('tilda@example.com')).some((m) => m.subject.includes('Valituksesi') && m.text.includes('Päätös on peruttu') && m.text.includes('julkaista sen uudelleen')) && !(await get(joose, '/api/mod/queue')).complaints.some((c) => c.decisionId === removed.id));
  check('the complaint link no longer works once the complaint is made', (await complaintOf(removed.id, null, new URL(statement.text.match(/https?:\/\/\S+\/complaint\/\S+/)[0]).searchParams.get('token'))).status === 403);

  // restrict: only its author sees it; lifted, it is back
  const limited = await pub(tilda, 'Rajoitettava');
  await mod(joose, `/api/mod/posts/${limited.id}`, { action: 'restrict', rule: 'ai', reason: 'Juttu on tehty tekoälyllä.' });
  check('restrict: off For You, others and visitors get 404, its author still sees it (marked) and gets a statement', !(await get(aino, '/api/fyp')).some((p) => p.id === limited.id) && (await fetch(B + `/api/posts/${limited.id}`, { headers: h(aino) })).status === 404 && (await fetch(B + `/api/posts/${limited.id}`)).status === 404 && (await get(tilda, `/api/posts/${limited.id}`)).post.restricted === true && (await outbox('tilda@example.com')).some((m) => m.text.includes('"Rajoitettava" on rajoitettu') && m.text.includes('tekoälyllä tehty sisältö')));
  check('lifting a restriction needs one (400 otherwise); lifted, the post is back', (await mod(joose, `/api/mod/posts/${kept.id}`, { action: 'lift', reason: 'xxx' })).status === 400 && (await mod(joose, `/api/mod/posts/${limited.id}`, { action: 'lift', reason: 'Rajoitus ei ole enää tarpeen.' })).status === 200 && (await fetch(B + `/api/posts/${limited.id}`, { headers: h(aino) })).status === 200);

  // suspend: Sulo sells a subscription, Aino subscribes; Sulo is on a socket
  const suloRes = await signUp({ name: 'Sulo', username: 'sulo', email: 'sulo@example.com', password: 'a-long-password' });
  const sulo = { ...(await suloRes.json()), cookie: cookieOf(suloRes) };
  await confirmEmail('sulo@example.com');
  await post(sulo, '/api/me/plan', { plan: 'pro' });
  await post(sulo, '/api/me/price', { price: 3 });
  await post(sulo, '/api/me/profile', { publicProfile: true, bio: 'Sulo kirjoittaa.' });
  const suloPost = await pub(sulo, 'Sulon julkinen');
  await post(aino, `/api/subscribe/${sulo.id}`, {});
  check('Sulo sells a subscription; Aino subscribes; his profile and post are public', (await get(sulo, '/api/me/subscription')).subscribers === 1 && (await fetch(B + '/api/users/by-username/sulo')).status === 200 && (await fetch(B + `/api/posts/${suloPost.id}`)).status === 200);
  const suloSocket = new Promise((resolve) => {
    const ws = new WebSocket(B.replace('http', 'ws') + '/ws', { headers: { cookie: sulo.cookie } });
    ws.on('close', (code) => resolve(code));
    ws.on('error', () => resolve(-1));
    setTimeout(() => resolve('still open'), 4000);
  });
  await sleep(300);
  check('a suspension needs a rule and a written reason; a moderator cannot be suspended', (await mod(joose, '/api/mod/suspend', { username: 'sulo', reason: 'Toistuvia rikkomuksia.' })).status === 400 && (await mod(joose, '/api/mod/suspend', { username: 'sulo', rule: 'sexual', reason: '' })).status === 400 && (await mod(joose, '/api/mod/suspend', { username: 'joose', rule: 'sexual', reason: 'xxx' })).status === 403);
  const susp = await mod(joose, '/api/mod/suspend', { username: '@Sulo', rule: 'sexual', reason: 'Toistuvia rikkomuksia varoituksista huolimatta.' }).then(json);
  check('suspend: his session ends (401) and his socket is closed (4001)', susp.action === 'suspend' && (await fetch(B + '/api/me', { headers: h(sulo) })).status === 401 && (await suloSocket) === 4001);
  const blocked = await signIn('sulo@example.com', 'a-long-password');
  const blockedBody = await blocked.json();
  check('…he cannot sign in: 403 suspended, with the reason and a link to complain', blocked.status === 403 && blockedBody.code === 'suspended' && blockedBody.reason.includes('Toistuvia') && blockedBody.until === null && /^\/complaint\/[0-9a-f]+\?token=/.test(blockedBody.complaint) && !cookieOf(blocked));
  check('…his public profile and posts are off the public pages and For You, and off his friends’ view', (await fetch(B + '/api/users/by-username/sulo')).status === 404 && (await fetch(B + '/api/users/by-username/sulo', { headers: h(aino) })).status === 404 && (await fetch(B + `/api/posts/${suloPost.id}`)).status === 404 && (await fetch(B + `/api/posts/${suloPost.id}`, { headers: h(aino) })).status === 404 && !(await get(aino, '/api/fyp')).some((p) => p.id === suloPost.id) && !(await fetch(B + '/sitemap.xml').then((r) => r.text())).includes('/@sulo'));
  check('…his readers’ subscriptions to him are ended (payments off: the D2M side), and no one can subscribe meanwhile', !(await get(aino, '/api/profiles')).find((x) => x.user.id === sulo.id).subscribed && (!server || sql('SELECT 1 FROM subscriptions WHERE author_id = ?', sulo.id).length === 0) && (await post(aino, `/api/subscribe/${sulo.id}`, {})).status === 404);
  const suloMail = (await outbox('sulo@example.com')).find((m) => m.subject.includes('jäädytetty'));
  check('…and he is emailed a statement of reasons with a link to complain', !!suloMail && suloMail.text.includes('Tilisi on jäädytetty toistaiseksi') && suloMail.text.includes('Lukijoidesi kuukausitilaukset') && suloMail.text.includes(`/complaint/${susp.id}?token=`));
  if (server) check('nothing of his is deleted', sql('SELECT 1 FROM posts WHERE id = ?', suloPost.id).length === 1 && sql('SELECT 1 FROM users WHERE id = ?', sulo.id).length === 1);

  // the suspended person complains through the link (he cannot sign in)
  const suloToken = new URL(suloMail.text.match(/https?:\/\/\S+\/complaint\/\S+/)[0]).searchParams.get('token');
  const suloPage = await complaintOf(susp.id, null, suloToken).then(json);
  check('the suspended person opens the link: the decision, and he may complain', suloPage.canComplain === true && suloPage.decision.action === 'suspend' && suloPage.decision.until === null);
  const suloFiled = await fetch(B + `/api/complaints/${susp.id}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ token: suloToken, text: 'En ole rikkonut sääntöjä toistuvasti.' }) });
  check('…complains through it (no session), and the complaint reaches the queue', suloFiled.status === 200 && (await get(joose, '/api/mod/queue')).complaints.some((c) => c.decisionId === susp.id && c.text.includes('toistuvasti')));
  const suloComplaint = (await get(joose, '/api/mod/queue')).complaints.find((c) => c.decisionId === susp.id);
  await mod(joose, `/api/mod/complaints/${suloComplaint.id}`, { outcome: 'reversed', reason: 'Valitus oli aiheellinen: jäädytys perutaan.' });
  check('…a moderator reverses it: he signs in again, and is told', (await signIn('sulo@example.com', 'a-long-password')).status === 200 && (await outbox('sulo@example.com')).some((m) => m.subject.includes('Valituksesi') && m.text.includes('voit taas kirjautua')) && (await fetch(B + '/api/users/by-username/sulo')).status === 200);

  // suspended for a time, then lifted by a moderator; and one whose time runs out by itself
  const until = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const timed = await mod(joose, '/api/mod/suspend', { username: 'sulo', rule: 'harassment', reason: 'Häirintää.', until }).then(json);
  check('a suspension until a date: the sign-in says until when', timed.until === until && (await signIn('sulo@example.com', 'a-long-password').then(json)).until === until && (await mod(joose, '/api/mod/suspend', { username: 'sulo', rule: 'sexual', reason: 'xxx', until: Date.now() - 1000 })).status === 400);
  check('unsuspend needs a reason; with one, he signs in again and is told', (await mod(joose, '/api/mod/unsuspend', { userId: sulo.id, reason: '' })).status === 400 && (await mod(joose, '/api/mod/unsuspend', { userId: sulo.id, reason: 'Jäädytys ei ole enää tarpeen.' })).status === 200 && (await signIn('sulo@example.com', 'a-long-password')).status === 200 && (await outbox('sulo@example.com')).some((m) => m.subject.includes('päättynyt')) && (await mod(joose, '/api/mod/unsuspend', { userId: sulo.id, reason: 'xxx' })).status === 404);
  if (server) {
    await mod(joose, '/api/mod/suspend', { username: 'sulo', rule: 'spam', reason: 'Roskapostia.', until: Date.now() + 60_000 });
    sqlWrite(`UPDATE suspensions SET until = ${Date.now() - 1000}`);
    check('a suspension whose time is up ends by itself (into the log)', (await signIn('sulo@example.com', 'a-long-password')).status === 200 && sql("SELECT 1 FROM mod_log WHERE action = 'suspension ended' AND moderator = 'system'").length === 1 && sql('SELECT 1 FROM suspensions').length === 0);
  }

  // notices: refused without the good faith or with a bad address; one about no post here, answered; the brake
  const notice = (body) => fetch(B + '/api/notices', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email: 'n1@example.com', url: 'https://example.com/jotain', reason: 'illegal', explanation: 'Laitonta sisältöä toisella sivulla.', goodFaith: true, ...body }) });
  check('a notice needs the statement of good faith, an email, an address, a known rule and an explanation', (await Promise.all([notice({ goodFaith: false }), notice({ email: 'x' }), notice({ url: '' }), notice({ reason: 'intimate' }), notice({ explanation: 'lyhyt' })])).every((r) => r.status === 400));
  check('a notice about no post here lands in the queue on its own', (await notice({})).status === 200 && (await get(joose, '/api/mod/queue')).notices.some((n) => n.url === 'https://example.com/jotain' && !('email' in n)));
  const elsewhere = (await get(joose, '/api/mod/queue')).notices.find((n) => n.url === 'https://example.com/jotain');
  check('a moderator answers it with a reason, and its sender is told', (await mod(joose, `/api/mod/notices/${elsewhere.id}`, { reason: 'Osoitteessa ei ole Dear to Me -juttua.' })).status === 200 && (await outbox('n1@example.com')).some((m) => m.text.includes('ei ole (enää) juttua') && m.text.includes('Osoitteessa ei ole Dear to Me -juttua.')));
  // two taken from this address so far: three more, then the brake (5 an hour from an address)
  const more = [];
  for (let i = 2; i <= 5; i++) more.push((await notice({ email: `n${i}@example.com` })).status);
  check('notices are braked: 5 an hour from an address, then 429', JSON.stringify(more) === JSON.stringify([200, 200, 200, 429]));

  // the log: every action, who, when, what, why
  const log = await get(joose, '/api/mod/log');
  const did = new Set(log.map((e) => e.action));
  check('the log has every moderation action, with who, when, what and why', ['keep', 'remove', 'restrict', 'lift', 'suspend', 'unsuspend', 'complaint reversed', 'notice closed'].every((a) => did.has(a)) && log.every((e) => e.at > 0 && e.moderator && e.target && e.reason) && log.some((e) => e.action === 'remove' && e.moderator === 'joose' && e.target.includes('Poistettava') && e.reason.includes('seksuaalista')));
}

// --- groups: friend groups (private, by invitation) and interest groups (open, around a topic) ---
{
  const person = async (name, username) => {
    const r = await signUp({ name, username, email: `${username}@example.com`, password: 'a-long-password' });
    return { ...(await r.json()), cookie: cookieOf(r) };
  };
  // Ronja's friends are Otto and Pia; Kai is no one's friend here
  const [ronja, otto, pia] = [await person('Ronja', 'ronja'), await person('Otto', 'otto'), await person('Pia', 'pia')];
  let kai = await person('Kai', 'kai');
  await post(ronja, '/api/friends', { username: 'otto' });
  await post(ronja, '/api/friends', { username: 'pia' });
  await post(otto, '/api/friends', { username: 'pia' });
  const codeOf = async (res) => (await res.json()).code;
  const groupBlog = (u, groupId, title, extra = {}) => {
    const f = new FormData();
    f.set('kind', 'blog'); f.set('title', title); f.set('body', `${title}: ryhmän juttu.`); f.set('audience', 'group'); f.set('group', groupId);
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    f.set('image', new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }), 'c.jpg');
    return fetch(B + '/api/posts', { method: 'POST', headers: h(u), body: f });
  };
  /** A socket of someone's, in a post's conversation, with what it hears. */
  const listen = (u, postId) =>
    new Promise((resolve) => {
      const ws = new WebSocket(B.replace('http', 'ws') + '/ws', { headers: { cookie: u.cookie } });
      const seen = [];
      ws.on('message', (m) => seen.push(JSON.parse(String(m))));
      ws.on('open', () => {
        if (postId) ws.send(JSON.stringify({ type: 'join', postId }));
        setTimeout(() => resolve({ seen, ws }), 300);
      });
      ws.on('error', () => resolve({ seen, ws }));
    });
  const groupOf = (u, id) => fetch(B + `/api/groups/${id}`, { headers: h(u) });
  const postOf = (u, id) => fetch(B + `/api/posts/${id}`, u ? { headers: h(u) } : {});
  const noGroup = await groupOf(kai, 'nosuchgroup').then((r) => r.text());
  const noPost = await postOf(kai, 'nosuchpost').then((r) => r.text());

  // a friend group: anyone makes one, and is its admin
  check('a group needs a kind and a name', (await codeOf(await post(ronja, '/api/groups', { name: 'X' }))) === 'kind' && (await codeOf(await post(ronja, '/api/groups', { kind: 'friends', name: '   ' }))) === 'group-name');
  const lukioRes = await post(ronja, '/api/groups', { kind: 'friends', name: '  Lukiokaverit ', description: 'Vanhat ajat.' });
  const lukio = await lukioRes.json();
  check('Ronja creates the friend group “Lukiokaverit”: its admin, its one member', lukioRes.status === 200 && lukio.kind === 'friends' && lukio.name === 'Lukiokaverit' && lukio.role === 'admin' && lukio.members === 1 && !lukio.topic);
  check('inviting someone who is not your friend is refused (403 not-friend), and so is an unknown username', (await codeOf(await post(ronja, `/api/groups/${lukio.id}/invite`, { username: 'kai' }))) === 'not-friend' && (await post(ronja, `/api/groups/${lukio.id}/invite`, { username: 'nobody.here' })).status === 404);
  const invited = await post(ronja, `/api/groups/${lukio.id}/invite`, { username: '@otto' });
  check('an admin invites a friend: the invitation waits for him', invited.status === 200 && (await invited.json()).invites.some((i) => i.userId === otto.id && i.status === 'invited'));
  const ottoGroups = await get(otto, '/api/groups');
  check('the invitee sees the invitation (the group’s name, who invited) and the badge counts it', ottoGroups.invitations.some((i) => i.group.id === lukio.id && i.group.name === 'Lukiokaverit' && i.by === ronja.id) && (await get(otto, '/api/groups/pending')).invitations === 1 && !ottoGroups.mine.some((g) => g.id === lukio.id));
  const ottoBefore = await groupOf(otto, lukio.id);
  check('…but is no member until he accepts: the group is the same 404 as no group at all', ottoBefore.status === 404 && (await ottoBefore.text()) === noGroup);
  await post(ronja, `/api/groups/${lukio.id}/invite`, { userId: pia.id });
  const declined = await post(pia, `/api/groups/${lukio.id}/decline`, {});
  check('declining an invitation: it is gone, and she is no member', declined.status === 200 && (await get(pia, '/api/groups')).invitations.length === 0 && (await groupOf(pia, lukio.id)).status === 404 && (await post(pia, `/api/groups/${lukio.id}/accept`, {})).status === 404);
  const accepted = await post(otto, `/api/groups/${lukio.id}/accept`, {});
  check('accepting: a member now, two members, the badge empty', accepted.status === 200 && (await accepted.json()).group.role === 'member' && (await get(otto, `/api/groups/${lukio.id}`)).group.members === 2 && (await get(otto, '/api/groups/pending')).invitations === 0);

  // a post to the group: its members only, never public, paid or with topics; Lite's limits as a friends post
  const gpRes = await groupBlog(ronja, lukio.id, 'Luokkakokous', { paid: '1', topics: '["food"]', confirm: '1' });
  const gp = await gpRes.json();
  check('a post to the group: audience group, its group, no paid, a Lite blog for 24 hours', gpRes.status === 200 && gp.audience === 'group' && gp.groupId === lukio.id && !gp.paid && !gp.price && Math.abs(gp.expiresAt - gp.createdAt - 24 * 3600e3) < 5000);
  if (server) check('…and no topics are kept for it', sql('SELECT 1 FROM post_topics WHERE post_id = ?', gp.id).length === 0 && sql('SELECT group_id FROM posts WHERE id = ?', gp.id)[0]?.group_id === lukio.id);
  check('a non-member cannot post to the group (404 no-group)', (await groupBlog(kai, lukio.id, 'Tunkeilija').then(codeOf)) === 'no-group');
  const ottoSees = await get(otto, `/api/posts/${gp.id}`);
  check('a member reads the post, with its group’s name; it is on the group’s page', ottoSees.post?.title === 'Luokkakokous' && ottoSees.post.group?.name === 'Lukiokaverit' && (await get(otto, `/api/groups/${lukio.id}`)).posts.some((p) => p.id === gp.id));
  const kaiPost = await postOf(kai, gp.id);
  check('a non-member and a visitor get the same 404 as for no post at all', kaiPost.status === 404 && (await kaiPost.text()) === noPost && (await postOf(null, gp.id)).status === 404 && (await fetch(B + `/api/groups/${lukio.id}`)).status === 401);
  const ottoEar = await listen(otto, gp.id);
  const kaiEar = await listen(kai, gp.id);
  await say(ronja, gp.id, 'Tervetuloa ryhmään!');
  await say(kai, gp.id, 'Kain viesti');
  await sleep(300);
  check('its conversation is live for members; a non-member’s socket can neither join nor talk, nor hears it', ottoEar.seen.some((e) => e.type === 'message' && e.message.text === 'Tervetuloa ryhmään!') && !kaiEar.seen.some((e) => e.type === 'message' || (e.type === 'presence' && e.postId === gp.id)) && !(await get(otto, `/api/posts/${gp.id}`)).messages.some((m) => m.text === 'Kain viesti'));
  ottoEar.ws.close();
  kaiEar.ws.close();
  const gpNote = await post(ronja, `/api/posts/${gp.id}/notes`, { text: 'Jäsenille', recipients: [otto.id, kai.id, pia.id] }).then(json);
  check('a BoVNote in a group post goes to its members only', JSON.stringify(gpNote.recipients) === JSON.stringify([otto.id]));
  check('a group post is in no feed but the group’s: not the friends feed, not For You', !(await get(otto, '/api/feed')).some((p) => p.id === gp.id) && !(await get(otto, '/api/fyp')).some((p) => p.id === gp.id) && !(await get(kai, '/api/fyp')).some((p) => p.id === gp.id));
  await groupBlog(ronja, lukio.id, 'Toinen');
  check('group posts count in Lite’s daily limit: a fourth blog in 24 hours to the group is refused (429)', (await groupBlog(ronja, lukio.id, 'Kolmas')).status === 200 && (await groupBlog(ronja, lukio.id, 'Neljäs')).status === 429);

  // a member suggests, an admin approves; the admin's tools
  const suggested = await post(otto, `/api/groups/${lukio.id}/invite`, { username: 'pia' });
  check('a member’s invitation is a suggestion: it waits for an admin (the badge), the invitee sees nothing yet', suggested.status === 200 && (await suggested.json()).invites.some((i) => i.userId === pia.id && i.status === 'suggested' && i.by === otto.id) && (await get(pia, '/api/groups/pending')).invitations === 0 && (await get(ronja, '/api/groups/pending')).toApprove === 1);
  check('a member cannot approve it (403 not-admin); an admin does, and she is invited', (await post(otto, `/api/groups/${lukio.id}/invites/${pia.id}/approve`, {})).status === 403 && (await post(ronja, `/api/groups/${lukio.id}/invites/${pia.id}/approve`, {})).status === 200 && (await get(pia, '/api/groups/pending')).invitations === 1);
  await post(pia, `/api/groups/${lukio.id}/accept`, {});
  check('members cannot rename, remove, make admins or delete (403 not-admin)', (await Promise.all([post(pia, `/api/groups/${lukio.id}`, { name: 'Uusi' }), post(pia, `/api/groups/${lukio.id}/members/${otto.id}/remove`, {}), post(pia, `/api/groups/${lukio.id}/members/${otto.id}/admin`, {}), post(pia, `/api/groups/${lukio.id}/delete`, { confirm: true })])).every((r) => r.status === 403));
  const renamed = await post(ronja, `/api/groups/${lukio.id}`, { name: 'Lukion porukka', description: 'Vanhat ajat ja uudet.' });
  check('an admin renames it', renamed.status === 200 && (await renamed.json()).group.name === 'Lukion porukka' && (await get(otto, `/api/groups/${lukio.id}`)).group.name === 'Lukion porukka');
  check('an admin makes a member an admin', (await post(ronja, `/api/groups/${lukio.id}/members/${otto.id}/admin`, {})).status === 200 && (await get(otto, `/api/groups/${lukio.id}`)).group.role === 'admin');
  check('an admin cannot be removed by another (403 admin); a member can', (await codeOf(await post(otto, `/api/groups/${lukio.id}/members/${ronja.id}/remove`, {}))) === 'admin' && (await post(ronja, `/api/groups/${lukio.id}/members/${pia.id}/remove`, {})).status === 200);
  check('the one removed loses the group and its posts (404)', (await groupOf(pia, lukio.id)).status === 404 && (await postOf(pia, gp.id)).status === 404);
  const left = await post(otto, `/api/groups/${lukio.id}/leave`, {});
  check('a member who leaves loses access to the group and its posts', left.status === 200 && (await groupOf(otto, lukio.id)).status === 404 && (await postOf(otto, gp.id)).status === 404);
  await post(ronja, `/api/groups/${lukio.id}/invite`, { username: 'otto' });
  await post(otto, `/api/groups/${lukio.id}/accept`, {});
  check('a new member sees the group’s earlier posts', (await get(otto, `/api/groups/${lukio.id}`)).posts.some((p) => p.id === gp.id) && (await postOf(otto, gp.id)).status === 200);
  const lastLeave = await post(ronja, `/api/groups/${lukio.id}/leave`, {});
  check('the last admin cannot just leave: 409 last-admin, nothing done', lastLeave.status === 409 && (await lastLeave.json()).code === 'last-admin' && (await get(ronja, `/api/groups/${lukio.id}`)).group.role === 'admin');
  check('she names Otto to follow her, and leaves; he is its admin', (await post(ronja, `/api/groups/${lukio.id}/leave`, { successor: otto.id })).status === 200 && (await get(otto, `/api/groups/${lukio.id}`)).group.role === 'admin' && (await groupOf(ronja, lukio.id)).status === 404);
  check('an author who left still has their own post', (await postOf(ronja, gp.id)).status === 200);

  // an interest group: a topic needed, its name unique within the topic, open to everyone signed in
  check('an interest group needs a topic and a description', (await codeOf(await post(ronja, '/api/groups', { kind: 'interest', name: 'Ruisleipä', description: 'Leipää.' }))) === 'topic' && (await codeOf(await post(ronja, '/api/groups', { kind: 'interest', name: 'Ruisleipä', topic: 'nope', description: 'Leipää.' }))) === 'topic' && (await codeOf(await post(ronja, '/api/groups', { kind: 'interest', name: 'Ruisleipä', topic: 'food' }))) === 'group-description');
  const ruisRes = await post(ronja, '/api/groups', { kind: 'interest', name: 'Ruisleipä', topic: 'food', description: 'Juuret, taikinat ja uunit.' });
  const ruis = await ruisRes.json();
  check('Ronja creates the interest group “Ruisleipä” under food', ruisRes.status === 200 && ruis.kind === 'interest' && ruis.topic === 'food' && ruis.role === 'admin');
  check('its name is unique within its topic, whatever its case (409); another topic may have it', (await codeOf(await post(otto, '/api/groups', { kind: 'interest', name: 'RUISLEIPÄ', topic: 'food', description: 'Toinen.' }))) === 'group-name-taken' && (await post(otto, '/api/groups', { kind: 'interest', name: 'ruisleipä', topic: 'family', description: 'Mummon leivät.' })).status === 200);
  const kaiSees = await get(kai, `/api/groups/${ruis.id}`);
  check('anyone signed in sees it (its admins, not every member) and joins without approval', kaiSees.group?.name === 'Ruisleipä' && !kaiSees.group.role && kaiSees.members.every((m) => m.role === 'admin') && (await post(kai, `/api/groups/${ruis.id}/join`, {}).then(json)).group.role === 'member');
  check('…and leaves, and joins again', (await post(kai, `/api/groups/${ruis.id}/leave`, {})).status === 200 && !(await get(kai, `/api/groups/${ruis.id}`)).group.role && (await post(kai, `/api/groups/${ruis.id}/join`, {})).status === 200);
  check('a friend group is joined only by an invitation (400 on join)', (await post(otto, `/api/groups/${lukio.id}/join`, {})).status === 400);
  check('posting to an interest group asks for the content rules’ confirmation (400 without)', (await groupBlog(kai, ruis.id, 'Ilman vahvistusta')).status === 400);
  const ipRes = await groupBlog(kai, ruis.id, 'Hapanjuuren herätys', { confirm: '1' });
  const ip = await ipRes.json();
  check('a member posts to the interest group', ipRes.status === 200 && ip.audience === 'group' && ip.groupId === ruis.id);
  check('everyone signed in reads it, members or not', (await get(otto, `/api/posts/${ip.id}`)).post?.title === 'Hapanjuuren herätys' && (await get(pia, `/api/groups/${ruis.id}`)).posts.some((p) => p.id === ip.id));
  const ipAnon = await postOf(null, ip.id);
  const ipPage = await pageOf(`/post/${ip.id}`);
  const groupHtml = await pageOf(`/g/${ruis.id}`);
  check('a visitor gets the same 404 as for no post; its page and the group’s are noindex, nothing of them in them', ipAnon.status === 404 && (await ipAnon.text()) === (await postOf(null, 'nosuchpost').then((r) => r.text())) && noindex(ipPage.html) && !ipPage.html.includes('Hapanjuuren') && noindex(groupHtml.html) && !groupHtml.html.includes('Ruisleipä') && groupHtml.html === (await pageOf('/g/nosuchgroup')).html && noindex((await pageOf('/groups')).html));
  const groupMap = await fetch(B + '/sitemap.xml').then((r) => r.text());
  const groupRobots = await fetch(B + '/robots.txt').then((r) => r.text());
  check('group posts and groups are not in the sitemap; robots.txt disallows /g/ and /groups', !groupMap.includes(ip.id) && !groupMap.includes(gp.id) && !groupMap.includes('/g/') && groupRobots.split('\n').includes('Disallow: /g/') && groupRobots.split('\n').includes('Disallow: /groups'));
  check('an interest group’s post is not in For You either', !(await get(otto, '/api/fyp')).some((p) => p.id === ip.id) && !(await get(joose, '/api/fyp')).some((p) => p.id === ip.id));
  const ip2 = await (await groupBlog(kai, ruis.id, 'Toinen leipä', { confirm: '1' })).json();
  check('its admin removes a post from the group: it is gone', (await post(otto, `/api/groups/${ruis.id}/posts/${ip2.id}/remove`, {})).status === 403 && (await post(ronja, `/api/groups/${ruis.id}/posts/${ip2.id}/remove`, {})).status === 200 && (await postOf(otto, ip2.id)).status === 404);
  const banned = await post(ronja, `/api/groups/${ruis.id}/members/${kai.id}/ban`, {});
  check('its admin bans a member: out of it, listed as banned, cannot join again (403 banned)', banned.status === 200 && (await banned.json()).bans.includes(kai.id) && !(await get(kai, `/api/groups/${ruis.id}`)).group.role && (await get(kai, `/api/groups/${ruis.id}`)).group.banned === true && (await codeOf(await post(kai, `/api/groups/${ruis.id}/join`, {}))) === 'banned');
  await say(kai, ip.id, 'Estetyn viesti');
  check('…nor post or talk in it', (await groupBlog(kai, ruis.id, 'Estetty', { confirm: '1' })).status === 404 && !(await get(otto, `/api/posts/${ip.id}`)).messages.some((m) => m.text === 'Estetyn viesti'));
  check('bans are an interest group’s; lifting one lets them join again', (await post(otto, `/api/groups/${lukio.id}/members/${pia.id}/ban`, {})).status === 400 && (await post(ronja, `/api/groups/${ruis.id}/members/${kai.id}/unban`, {})).status === 200 && (await post(kai, `/api/groups/${ruis.id}/join`, {})).status === 200);
  check('its admin makes another admin', (await post(ronja, `/api/groups/${ruis.id}/members/${kai.id}/admin`, {})).status === 200 && (await get(kai, `/api/groups/${ruis.id}`)).group.role === 'admin' && (await get(kai, `/api/groups/${ruis.id}`)).members.length === 2);

  // reports and moderation apply in groups
  await post(otto, `/api/posts/${gp.id}/report`, { reason: 'other' });
  await post(otto, `/api/posts/${ip.id}/report`, { reason: 'ai' });
  check('a report on a group post (a friend group’s too) reaches the moderators’ queue, the post whole', ((q) => q.posts.some((x) => x.post.id === gp.id && x.post.audience === 'group' && x.post.body.includes('ryhmän juttu')) && q.posts.some((x) => x.post.id === ip.id && x.reports.ai === 1))(await get(joose, '/api/mod/queue')));
  check('a non-member cannot report a friend group’s post (404)', (await post(pia, `/api/posts/${gp.id}/report`, { reason: 'other' })).status === 404);
  check('a moderator removes a group post: it is gone from the group', (await post(joose, `/api/mod/posts/${ip.id}`, { action: 'remove', rule: 'ai', reason: 'Tekoälyllä tehty juttu.' })).status === 200 && (await postOf(otto, ip.id)).status === 404 && !(await get(ronja, `/api/groups/${ruis.id}`)).posts.some((p) => p.id === ip.id));
  await post(joose, `/api/mod/posts/${gp.id}`, { action: 'keep', reason: 'Ei riko sääntöjä.' });

  // a suspended author's group posts are hidden, as their other posts are
  const ip3 = await (await groupBlog(kai, ruis.id, 'Kain kolmas', { confirm: '1' })).json();
  await post(joose, '/api/mod/suspend', { username: 'kai', rule: 'spam', reason: 'Roskapostia ryhmissä.' });
  check('suspension hides their group posts (404, off the group’s page)', (await postOf(otto, ip3.id)).status === 404 && !(await get(otto, `/api/groups/${ruis.id}`)).posts.some((p) => p.id === ip3.id));
  await post(joose, '/api/mod/unsuspend', { userId: kai.id, reason: 'Jäädytys ei ole enää tarpeen.' });
  kai = { ...kai, cookie: cookieOf(await signIn('kai@example.com', 'a-long-password')) };
  check('lifted, they show again', (await postOf(otto, ip3.id)).status === 200);

  // For You suggests interest groups that match one's interests (a strip of its own, not among the posts)
  check('no interests: no group suggestions', (await get(pia, '/api/groups/suggestions')).length === 0);
  await post(pia, '/api/me/interests', { topics: ['food'], words: [] });
  const piaSug = await get(pia, '/api/groups/suggestions');
  check('interests: food suggests the food group, not the family one of the same name', piaSug.some((g) => g.id === ruis.id) && piaSug.every((g) => g.topic === 'food' && g.kind === 'interest') && piaSug.length <= 3);
  await post(pia, '/api/me/interests', { topics: ['family'], words: ['taikinat'] });
  const piaSug2 = await get(pia, '/api/groups/suggestions');
  check('a topic and one’s own words both match (family by topic, “taikinat” in the food group’s description)', piaSug2.some((g) => g.topic === 'family') && piaSug2.some((g) => g.id === ruis.id));
  await post(pia, `/api/groups/${ruis.id}/join`, {});
  check('a group one is in is not suggested', !(await get(pia, '/api/groups/suggestions')).some((g) => g.id === ruis.id));

  // search finds groups by name: interest groups, and only one's own friend groups
  check('search finds interest groups by name', (await get(pia, '/api/groups/search?q=ruis')).filter((g) => g.kind === 'interest').length === 2);
  check('…and a friend group only for its members', (await get(otto, '/api/groups/search?q=porukka')).some((g) => g.id === lukio.id) && !(await get(pia, '/api/groups/search?q=porukka')).some((g) => g.id === lukio.id) && !(await get(kai, '/api/groups/search?q=lukion')).length);

  // deleting a group deletes its posts, with their files, only when confirmed
  const gpFile = server && path.join(server.data, 'uploads', path.basename(gp.imageUrl));
  check('deleting a group needs a confirmation (400)', (await codeOf(await post(otto, `/api/groups/${lukio.id}/delete`, {}))) === 'confirm');
  const otherPost = await (await groupBlog(otto, lukio.id, 'Oton juttu')).json();
  const deleted = await post(otto, `/api/groups/${lukio.id}/delete`, { confirm: true });
  await sleep(300);
  check('deleting a group deletes it and its posts, with their files', deleted.status === 200 && (await groupOf(otto, lukio.id)).status === 404 && (await postOf(ronja, gp.id)).status === 404 && (await postOf(otto, otherPost.id)).status === 404 && (!server || (sql('SELECT 1 FROM posts WHERE group_id = ?', lukio.id).length === 0 && !fs.existsSync(gpFile))));

  // the last admin leaving: an interest group's falls to its oldest member; alone, the group goes when they say so
  const solo = await post(otto, '/api/groups', { kind: 'friends', name: 'Yksin' }).then(json);
  check('the only member of a group leaves only by deleting it (409, then delete: true)', (await post(otto, `/api/groups/${solo.id}/leave`, {})).status === 409 && (await post(otto, `/api/groups/${solo.id}/leave`, { delete: true }).then(json)).deleted === true && (await groupOf(otto, solo.id)).status === 404);
  check('an interest group’s last admin leaving without naming anyone: its oldest member is its admin', (await post(ronja, `/api/groups/${ruis.id}/members/${kai.id}/remove`, {})).status === 403 && (await post(kai, `/api/groups/${ruis.id}/leave`, {})).status === 200 && (await post(ronja, `/api/groups/${ruis.id}/leave`, {})).status === 200 && (await get(pia, `/api/groups/${ruis.id}`)).group.role === 'admin');

  // account deletion: memberships, invitations and admin roles go; a friend group whose last admin it was goes with its posts
  const vilja = await person('Vilja', 'vilja');
  await post(vilja, '/api/friends', { username: 'otto' });
  const vg = await post(vilja, '/api/groups', { kind: 'friends', name: 'Viljan piiri' }).then(json);
  await post(vilja, `/api/groups/${vg.id}/invite`, { username: 'otto' });
  await post(otto, `/api/groups/${vg.id}/accept`, {});
  const vgPost = await (await groupBlog(otto, vg.id, 'Piirin juttu')).json();
  const vi = await post(vilja, '/api/groups', { kind: 'interest', name: 'Viljan lukupiiri', topic: 'books', description: 'Luetaan yhdessä.' }).then(json);
  await post(pia, `/api/groups/${vi.id}/join`, {});
  await post(otto, `/api/groups/${vi.id}/join`, {});
  const viAlone = await post(vilja, '/api/groups', { kind: 'interest', name: 'Viljan yksinäinen', topic: 'books', description: 'Ei ketään.' }).then(json);
  // a member of Otto's group, and invited to another of his
  const og = await post(otto, '/api/groups', { kind: 'friends', name: 'Oton piiri' }).then(json);
  const og2 = await post(otto, '/api/groups', { kind: 'friends', name: 'Oton toinen' }).then(json);
  await post(otto, `/api/groups/${og.id}/invite`, { username: 'vilja' });
  await post(vilja, `/api/groups/${og.id}/accept`, {});
  await post(otto, `/api/groups/${og2.id}/invite`, { username: 'vilja' });
  check('Vilja is a member of Otto’s group and invited to another', (await get(otto, `/api/groups/${og.id}`)).group.members === 2 && (await get(vilja, '/api/groups')).invitations.some((i) => i.group.id === og2.id));
  await post(vilja, '/api/me/delete', { password: 'a-long-password' });
  check('account deletion: a friend group she was the last admin of goes with its posts', (await groupOf(otto, vg.id)).status === 404 && (await postOf(otto, vgPost.id)).status === 404);
  check('…an interest group’s oldest member is its admin now; one with no one left goes', ((p) => p.group.role === 'admin' && p.members.length === 2)(await get(pia, `/api/groups/${vi.id}`)) && (await groupOf(pia, viAlone.id)).status === 404);
  check('…her memberships and invitations elsewhere are gone (Otto’s group has one member, his invitation is none)', (await get(otto, `/api/groups/${og.id}`)).group.members === 1 && !(await get(otto, `/api/groups/${og2.id}`)).invites.length);
  if (server) check('…and nothing of hers is left in the groups’ tables', ['group_members', 'group_invites', 'group_bans'].every((t) => sql(`SELECT 1 FROM ${t} WHERE user_id = ?`, vilja.id).length === 0) && sql('SELECT 1 FROM group_invites WHERE invited_by = ?', vilja.id).length === 0 && sql('SELECT 1 FROM groups WHERE created_by = ?', vilja.id).length === 0);
}

// --- a visitor who is not signed in (no cookie): a public profile and a live public post, nothing more ---
const visit = (p, init) => fetch(B + p, init);
const anonRead = async (p) => {
  const r = await visit(p);
  const text = await r.text();
  return { status: r.status, text, body: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : undefined };
};
/** What must never reach a visitor: an email, a password, an account's packs. */
const privateData = (text) => /demo\.d2m|example\.com|email|password|scrypt|packs/i.test(text);
const miraAnon = await anonRead('/api/users/by-username/mira');
const ma = miraAnon.body;
check('anonymous: a public profile is 200: name, @username, bio, wallpaper, her live public posts (not the ended one)', miraAnon.status === 200 && ma.user.name === 'Mira' && ma.user.username === 'mira' && !!ma.user.bio && !!ma.user.wallpaperUrl && ma.posts.some((p) => p.id === xssPost.id) && !ma.posts.some((p) => p.id === endedPost.id) && ma.posts.every((p) => p.audience === 'public' && !p.letter && !p.hidden));
check('…nothing private in it: no email, password or packs, no friend or subscription, no one present, no BoVNotes', !privateData(miraAnon.text) && ma.friend === false && ma.subscribed === false && ma.posts.every((p) => p.present.length === 0 && p.notesForMe === 0));
check('…her paid post in it is locked: its opening only, no video', ((p) => p?.locked === true && !p.body.includes('Kolmas') && !p.videoUrl && !p.pictures)(ma.posts.find((p) => p.id === paid.id)));
check('…and the same by id', (await visit(`/api/users/${mira.id}/profile`)).status === 200);
const nobodyAnon = await anonRead('/api/users/by-username/nobody.here');
check('anonymous: a profile that is not public is 404, the very same answer as no one at all (by username and by id)', nobodyAnon.status === 404 && (await Promise.all(['/api/users/by-username/sara', `/api/users/${sara.id}/profile`, '/api/users/nosuchid/profile'].map(anonRead))).every((r) => r.status === 404 && r.text === nobodyAnon.text));
const noPublicList = await anonRead('/api/users/nosuchid/public');
check('anonymous: someone’s public posts: a public profile’s only (not hidden ones); otherwise the same 404 as no one', ((r) => r.status === 200 && r.body.some((p) => p.id === xssPost.id) && r.body.every((p) => p.present.length === 0))(await anonRead(`/api/users/${mira.id}/public`)) && !(await anonRead(`/api/users/${leo.id}/public`)).body.some((p) => p.id === leoPost.id) && noPublicList.status === 404 && (await anonRead(`/api/users/${sara.id}/public`)).text === noPublicList.text);
await say(joose, xssPost.id, 'Joosen julkinen viesti');
await post(mira, `/api/posts/${xssPost.id}/notes`, { text: 'Salainen BoVNote Jooselle', recipients: [joose.id] });
const xssAnon = await anonRead(`/api/posts/${xssPost.id}`);
const xa = xssAnon.body;
check('anonymous: a live public post is 200, whole (it is free), with its conversation and the people in it by name', xssAnon.status === 200 && xa.post.body.includes('Toinen kappale.') && !xa.post.locked && xa.messages.some((m) => m.text === 'Joosen julkinen viesti') && xa.messageCount === xa.messages.length && xa.people.some((u) => u.id === joose.id && u.name === 'Joose') && xa.people.some((u) => u.id === mira.id && u.publicProfile));
check('…no one present, no BoVNote, nothing of anyone’s account', xa.present.length === 0 && xa.notes.length === 0 && !xssAnon.text.includes('Salainen BoVNote') && !privateData(xssAnon.text) && !xa.people.some((u) => u.id === joose.id && u.bio));
const paidAnon = (await anonRead(`/api/posts/${paid.id}`)).body;
const recipeAnon = (await anonRead(`/api/posts/${recipe.id}`)).body;
check('anonymous: a paid post is its opening only, locked, with no conversation (Unlimited’s and Exclusive’s, with its price)', paidAnon.post.locked === true && !paidAnon.post.body.includes('Kolmas') && !paidAnon.post.videoUrl && paidAnon.messages.length === 0 && recipeAnon.post.locked === true && recipeAnon.post.price === 300 && recipeAnon.messages.length === 0 && recipeAnon.people.find((u) => u.id === recipe.authorId)?.plan === 'exclusive');
const noPostAnon = await anonRead('/api/posts/nosuchpost');
check('anonymous: a friends-only post, a letter, a hidden post and an ended one are 404, the same answer as no post at all', noPostAnon.status === 404 && (await Promise.all([lofoten.id, letter.id, leoPost.id, endedPost.id].map((id) => anonRead(`/api/posts/${id}`)))).every((r) => r.status === 404 && r.text === noPostAnon.text));
check('anonymous: For You, the feed, letters, search, topics, the people and everything under /api/me are 401', (await Promise.all(['/api/fyp', '/api/feed', '/api/letters', '/api/search?q=mira', '/api/topics/food', '/api/users', '/api/profiles', '/api/friends', '/api/me', '/api/me/interests', '/api/me/plan', '/api/me/posts', '/api/me/purchases', '/api/me/archive', '/api/me/subscription', '/api/me/payouts'].map((p) => visit(p).then((r) => r.status)))).every((s) => s === 401));
const anonChange = (p) => visit(p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ consent: true, text: 'x', recipients: [joose.id], username: 'mira', reason: 'other' }) }).then((r) => r.status);
check('anonymous: nothing can be done: buying, subscribing, reporting, a BoVNote, a friend, seeing a note are 401', (await Promise.all([`/api/posts/${recipe.id}/buy`, `/api/subscribe/${mira.id}`, `/api/posts/${xssPost.id}/report`, `/api/posts/${xssPost.id}/notes`, '/api/friends', '/api/notes/x/seen'].map(anonChange))).every((s) => s === 401));
check('anonymous: the live socket refuses (4001)', (await socket({})).closed === 4001);
const jooseSees = await get(joose, `/api/posts/${xssPost.id}`);
check('signed in, nothing changed: the BoVNote for Joose, no people list, a friends-only post opens, one’s own private profile too', jooseSees.notes.some((n) => n.text === 'Salainen BoVNote Jooselle') && jooseSees.people === undefined && (await fetch(B + `/api/posts/${lofoten.id}`, { headers: h(joose) })).status === 200 && (await fetch(B + '/api/users/by-username/sara', { headers: h(sara) })).status === 200 && (await fetch(B + '/api/users/by-username/sara', { headers: h(joose) })).status === 404);
// (last of the anonymous reads on this server: it brakes this address for a minute)
const reads = await Promise.all(Array.from({ length: 125 }, () => visit('/api/users/by-username/mira').then((r) => r.status)));
check('anonymous reads are braked: past 120 a minute from one address, 429', reads.includes(429) && (await visit(`/api/posts/${xssPost.id}`)).status === 429);
check('…a signed-in reader is not, and the public pages themselves are not', (await fetch(B + '/api/users/by-username/mira', { headers: h(joose) })).status === 200 && (await pageOf('/@mira')).status === 200);

// --- asking for new passwords is braked for an address too: 20 an hour, whatever the emails ---
// (it locks this address out of asking: nothing after this asks)
const asked = [];
for (let i = 0; i < 25; i++) asked.push((await forgot(`brake${i}@example.com`)).status);
check('forgot is braked for an address: past 20 an hour, 429 for any email', asked.includes(200) && asked.at(-1) === 429 && asked.indexOf(429) > 0 && asked.slice(asked.indexOf(429)).every((s) => s === 429) && (await forgot('another@example.com')).status === 429);

// --- guessing passwords: 10 failures per address and per email in 15 minutes, then 429 ---
// (last: it locks this address out of signing in)
const wrong = [];
// (three failures from this address already: Pirjo's sign-in after her account was deleted, and Selma's
// with her old password and her old email)
for (let i = 0; i < 7; i++) wrong.push((await signIn('mikko@demo.d2m', 'not-the-password')).status);
check('a wrong password: 401, seven times more', wrong.every((s) => s === 401));
check('the 11th failed attempt: 429', (await signIn('mikko@demo.d2m', 'not-the-password')).status === 429);
check('throttled, even the right password waits', (await signIn('mikko@demo.d2m', PASSWORD)).status === 429);
check('and so does another email from the same address', (await signIn('sara@demo.d2m', PASSWORD)).status === 429);
check('a signed-in session goes on meanwhile', (await get(mikko, '/api/me')).id === mikko.id);

// --- the live check of a username is braked: 60 a minute from one address ---
// (last before the restart: it locks this address out of the check for a minute)
const statuses = [];
for (let i = 0; i < 70; i++) statuses.push((await fetch(B + `/api/username/brake${i}`)).status);
check('the live check is braked (429 after 60 a minute)', statuses.includes(200) && statuses.at(-1) === 429);

// --- the headers every response carries, the health check, and the webhook with payments off ---
// (R2's source is the generic *.r2 host, or the bucket's own host when a .env names R2_URL)
if (server) {
  const home = await fetch(B + '/');
  const csp = home.headers.get('content-security-policy') ?? '';
  check('security headers on a page: CSP, nosniff, Referrer-Policy, X-Frame-Options DENY', /default-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp) && /img-src [^;]*https:\/\/\*\.([a-z0-9-]+\.)?r2\.cloudflarestorage\.com/.test(csp) && home.headers.get('x-content-type-options') === 'nosniff' && home.headers.get('referrer-policy') === 'strict-origin-when-cross-origin' && home.headers.get('x-frame-options') === 'DENY');
  check('and on the API too', (await fetch(B + '/api/me')).headers.get('x-content-type-options') === 'nosniff');
  check('no HSTS over http, nor from an x-forwarded-proto no proxy is trusted for', !home.headers.has('strict-transport-security') && !(await fetch(B + '/', { headers: { 'x-forwarded-proto': 'https' } })).headers.has('strict-transport-security'));
  const health = await fetch(B + '/api/health');
  check('/api/health: 200 {ok: true}, without a session', health.status === 200 && (await health.json()).ok === true);
  check('payments off: the Stripe webhook is 404', (await fetch(B + '/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=x' }, body: '{}' })).status === 404);
}

// --- the data stays: a post and its conversation survive a restart on the same data folder ---
if (server) {
  const kept = await (await blog(aino, 'Pysyvä')).json();
  await say(joose, kept.id, 'Pysyy tallessa');
  await stop(server, true);
  const again = await start(5199, { D2M_DEMO: '1' }, server.data);
  // the old cookie: the sessions are kept too
  const open = await get(joose, `/api/posts/${kept.id}`);
  check('after a restart the post and its message are still there, and so is the session', open.post?.title === 'Pysyvä' && open.messages?.some((m) => m.text === 'Pysyy tallessa'));
  check('the demo people are not seeded twice', (await get(joose, '/api/users')).filter((u) => u.name === 'Joose').length === 1);
  // a backup: a consistent copy beside the running server
  const backup = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/backup.mjs'], { env: { ...process.env, D2M_DATA: server.data }, encoding: 'utf8' });
  const copies = fs.existsSync(path.join(server.data, 'backups')) ? fs.readdirSync(path.join(server.data, 'backups')) : [];
  const copy = copies.length === 1 && new DatabaseSync(path.join(server.data, 'backups', copies[0]), { readOnly: true });
  check('npm run backup writes a copy that has the post', backup.status === 0 && !!copy && copy.prepare('SELECT title FROM posts WHERE id = ?').get(kept.id)?.title === 'Pysyvä');
  if (copy) copy.close();
  await stop(again);
}

// --- production: without D2M_DEMO a fresh start is empty ---
if (!process.env.D2M) {
  const prod = await start(5198, { D2M_DEMO: '' });
  const P = 'http://127.0.0.1:5198';
  const count = (table) => sqlOn(prod.data, `SELECT count(*) AS n FROM ${table}`)[0].n;
  check('without D2M_DEMO a fresh data folder has no users and no posts', count('users') === 0 && count('posts') === 0);
  check('and says demo is off', (await fetch(P + '/api/config').then(json)).demo === false);
  check('and the demo sign-in does not work', (await fetch(P + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email: 'joose@demo.d2m', password: PASSWORD }) })).status === 401);
  await stop(prod);

  /** What makes a version 7 file a version 6 one: the groups' tables out, and the posts table as it was (no group_id,
   * no audience 'group'), rebuilt the way version 7 rebuilds it (with the foreign keys off, before BEGIN). */
  const POSTS_6 = "CREATE TABLE posts_v6 (n INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, author_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, video_url TEXT, image_url TEXT, pictures TEXT, audience TEXT NOT NULL CHECK (audience IN ('friends', 'public', 'chosen')), chosen TEXT, paid INTEGER NOT NULL DEFAULT 0, price INTEGER, hidden INTEGER NOT NULL DEFAULT 0, restricted INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, archived INTEGER NOT NULL DEFAULT 0, size INTEGER, video_size INTEGER, duration REAL, letter INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);";
  const COLUMNS_6 = 'n, id, author_id, kind, title, body, video_url, image_url, pictures, audience, chosen, paid, price, hidden, restricted, expires_at, archived, size, video_size, duration, letter, created_at';
  const BEFORE_7 = `DROP TABLE group_bans; DROP TABLE group_invites; DROP TABLE group_members; ${POSTS_6} INSERT INTO posts_v6 SELECT ${COLUMNS_6} FROM posts; DROP TABLE posts; ALTER TABLE posts_v6 RENAME TO posts; CREATE INDEX posts_author ON posts (author_id, created_at); CREATE INDEX posts_audience ON posts (audience, created_at); CREATE INDEX posts_created ON posts (created_at); CREATE INDEX posts_expiry ON posts (expires_at) WHERE archived = 0 AND expires_at IS NOT NULL; DROP TABLE groups;`;
  /** What makes a version 6 file a version 5 one: the moderation tables and the posts' restricted column out. */
  const BEFORE_6 = 'DROP TABLE mod_log; DROP TABLE mod_notices; DROP TABLE suspensions; DROP TABLE mod_tokens; DROP TABLE mod_complaints; DROP TABLE mod_decisions; ALTER TABLE posts DROP COLUMN restricted;';
  // --- from before SQLite: a db.json in an older format is imported on the first start ---
  const old = fs.mkdtempSync(path.join(os.tmpdir(), 'd2m-check-'));
  const now = Date.now();
  const token = crypto.randomBytes(32).toString('base64url');
  const salt = crypto.randomBytes(16);
  // scrypt as server/auth.ts writes it (lighter parameters, written beside it as it allows)
  const hash = ['scrypt', 1024, 8, 1, salt.toString('base64'), crypto.scryptSync('an-old-password', salt, 32, { N: 1024, r: 8, p: 1 }).toString('base64')].join('$');
  fs.writeFileSync(
    path.join(old, 'db.json'),
    JSON.stringify({
      // packs as one number (video), and no notes, uploads, later or purchases log: the older formats
      // no usernames then: they are made from the names
      users: [{ id: 'u1', name: 'Ansa', color: '#c0577a', plan: 'pro', packs: 2, price: 300 }, { id: 'u2', name: 'Bertta', color: '#5b7fbf' }, { id: 'u3', name: 'Äiti Öljy-Åberg', color: '#5b7fbf' }, { id: 'u4', name: 'Admin', color: '#5b7fbf' }, { id: 'u5', name: 'ansa', color: '#5b7fbf' }],
      friends: [['u1', 'u2']],
      posts: [{ id: 'p1', authorId: 'u1', kind: 'blog', title: 'Vanha', body: 'Vanha juttu.', imageUrl: '/seed/meri.jpg', audience: ['u2'], expiresAt: null, size: 10, createdAt: now - 2000 }],
      // the second names a post no longer there
      messages: [{ id: 'm1', postId: 'p1', userId: 'u2', text: 'Vanha viesti', createdAt: now - 1000 }, { id: 'm2', postId: 'gone', userId: 'u2', text: 'x', createdAt: now }],
      subscriptions: [['u2', 'u1']],
      purchases: [],
      reports: [],
      pay: { accounts: { u1: 'acct_1' }, plans: { u1: 'sub_plan' }, packs: { u1: ['sub_pack'] }, readers: { 'u2:u1': 'sub_reader' }, sessions: ['cs_1'] },
      auth: { accounts: { u2: { email: 'bertta@example.com', password: hash, createdAt: now } }, sessions: [{ hash: crypto.createHash('sha256').update(token).digest('hex'), userId: 'u2', createdAt: now, expiresAt: now + 86400000 }] },
    }),
  );
  const migrated = await start(5198, { D2M_DEMO: '' }, old);
  const M = 'http://127.0.0.1:5198';
  const bertta = { cookie: `d2m_session=${token}` };
  check('db.json is imported and kept as db.json.migrated', !fs.existsSync(path.join(old, 'db.json')) && fs.existsSync(path.join(old, 'db.json.migrated')) && fs.existsSync(path.join(old, 'db.sqlite')));
  check('its session still signs in, and so does its password', (await fetch(M + '/api/me', { headers: h(bertta) }).then(json)).id === 'u2' && (await fetch(M + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email: 'bertta@example.com', password: 'an-old-password' }) })).status === 200);
  const old1 = await fetch(M + '/api/posts/p1', { headers: h(bertta) }).then(json);
  check('its post, written for one friend, with its message', old1.post?.title === 'Vanha' && JSON.stringify(old1.post.audience) === '["u2"]' && old1.messages.length === 1 && old1.messages[0].text === 'Vanha viesti');
  check('its subscription', (await fetch(M + '/api/search?q=ansa', { headers: h(bertta) }).then(json))[0]?.subscribed === true);
  const one = (q) => sqlOn(old, q)[0];
  check('packs as one number became video packs; Stripe’s ids came over', one("SELECT packs_video AS v FROM users WHERE id = 'u1'").v === 2 && one("SELECT account FROM pay_accounts WHERE user_id = 'u1'").account === 'acct_1' && one("SELECT subscription AS s FROM pay_plans WHERE user_id = 'u1'").s === 'sub_plan' && one("SELECT subscription AS s FROM pay_packs WHERE user_id = 'u1'").s === 'sub_pack' && one("SELECT subscription AS s FROM pay_readers WHERE reader_id = 'u2' AND author_id = 'u1'").s === 'sub_reader' && one("SELECT count(*) AS n FROM pay_sessions WHERE id = 'cs_1'").n === 1);
  check('a message naming a post no longer there is left out', one('SELECT count(*) AS n FROM messages').n === 1);
  check('each imported person got a username from their name (letters transliterated, digits after one taken or reserved)', JSON.stringify(sqlOn(old, 'SELECT username FROM users ORDER BY n').map((r) => r.username)) === JSON.stringify(['ansa', 'bertta', 'aiti.oljy.aberg', 'admin2', 'ansa2']) && one('PRAGMA user_version').user_version === 7);
  check('its account counts as verified (it came from before verification)', one("SELECT verified_at AS v FROM accounts WHERE user_id = 'u2'").v > 0);
  await stop(migrated);

  // --- a database of schema version 1 (before usernames) is migrated on start ---
  // made the way version 1 had it: a version 2 file with the username column and the held names taken out
  const v1 = await start(5198, { D2M_DEMO: '1' });
  await stop(v1, true);
  let hadColumn = -1;
  // (on Windows the stopped server's hold on the file may outlast its port a moment)
  for (let i = 0; i < 20 && hadColumn < 0; i++) {
    let before2;
    try {
      before2 = new DatabaseSync(path.join(v1.data, 'db.sqlite'));
      before2.exec(`PRAGMA foreign_keys = OFF; BEGIN; ${BEFORE_7} ${BEFORE_6} DROP TABLE email_tokens; CREATE TABLE accounts4 (user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created_at INTEGER NOT NULL, terms_at INTEGER); INSERT INTO accounts4 SELECT user_id, email, password, created_at, terms_at FROM accounts; DROP TABLE accounts; ALTER TABLE accounts4 RENAME TO accounts; DROP TABLE stripe_events; DROP TABLE post_topics; DROP TABLE interests; DROP INDEX users_username; DROP TABLE released_usernames; ALTER TABLE users DROP COLUMN username;
        INSERT INTO users (id, name, name_key, color) VALUES ('x1', 'Jöösé', 'jöösé', '#000'), ('x2', 'Support', 'support', '#000'), ('x3', 'Al', 'al', '#000'), ('x4', 'Sanna-Maria von Hellens-Lindqvist', 'x', '#000');
        PRAGMA user_version = 1; COMMIT;`);
      hadColumn = before2.prepare("SELECT count(*) AS n FROM pragma_table_info('users') WHERE name = 'username'").get().n;
    } catch {
      await sleep(250);
    } finally {
      before2?.close();
    }
  }
  const v2 = await start(5198, { D2M_DEMO: '1' }, v1.data);
  const V = 'http://127.0.0.1:5198';
  const vJoose = await fetch(V + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email: 'joose@demo.d2m', password: PASSWORD }) });
  const vPeople = await fetch(V + '/api/users', { headers: { cookie: cookieOf(vJoose) } }).then(json);
  const handle = (id) => vPeople.find((u) => u.id === id)?.username;
  check('a version 1 database is migrated on start: version 7 (through 2, 3, 4, 5 and 6), everyone with a username', hadColumn === 0 && sqlOn(v1.data, 'PRAGMA user_version')[0].user_version === 7 && vPeople.length === 11 && vPeople.every((u) => u.username));
  check('the demo people are @joose, @aino, @mikko, @sara, @leo, @mira, @eeva, and still sign in', vJoose.status === 200 && ['Joose', 'Aino', 'Mikko', 'Sara', 'Leo', 'Mira', 'Eeva'].every((n) => vPeople.find((u) => u.name === n)?.username === n.toLowerCase()));
  check('the others: transliterated, digits after one taken or reserved, padded, cut to 20', JSON.stringify(['x1', 'x2', 'x3', 'x4'].map(handle)) === JSON.stringify(['joose2', 'support2', 'al1', 'sanna.maria.von.hell']));
  check('after the migration a username is unique and changes are held', ((r) => r.status === 409)(await fetch(V + '/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ name: 'J', username: 'joose2', email: 'j@example.com', password: 'a-long-password', terms: true }) })) && sqlOn(v1.data, "SELECT count(*) AS n FROM sqlite_master WHERE name = 'released_usernames'")[0].n === 1);
  await stop(v2);

  // --- a database of schema version 2 (before interests) is migrated on start ---
  // made the way version 2 had it: a version 3 file with the interests' tables taken out
  const w2 = await start(5198, { D2M_DEMO: '1' });
  await stop(w2, true);
  let dropped = false;
  for (let i = 0; i < 20 && !dropped; i++) {
    let db2;
    try {
      db2 = new DatabaseSync(path.join(w2.data, 'db.sqlite'));
      db2.exec(`PRAGMA foreign_keys = OFF; BEGIN; ${BEFORE_7} ${BEFORE_6} DROP TABLE email_tokens; CREATE TABLE accounts4 (user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created_at INTEGER NOT NULL, terms_at INTEGER); INSERT INTO accounts4 SELECT user_id, email, password, created_at, terms_at FROM accounts; DROP TABLE accounts; ALTER TABLE accounts4 RENAME TO accounts; DROP TABLE stripe_events; DROP TABLE post_topics; DROP TABLE interests; PRAGMA user_version = 2; COMMIT;`);
      dropped = true;
    } catch {
      await sleep(250);
    } finally {
      db2?.close();
    }
  }
  const w3 = await start(5198, { D2M_DEMO: '1' }, w2.data);
  const W = 'http://127.0.0.1:5198';
  const wRes = await fetch(W + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email: 'joose@demo.d2m', password: PASSWORD }) });
  const wJoose = { cookie: cookieOf(wRes) };
  const wTopics = sqlOn(w2.data, "SELECT p.title, t.topic, t.how FROM post_topics t JOIN posts p ON p.id = t.post_id ORDER BY p.n, t.rowid");
  check('a version 2 database is migrated on start: version 7, the public posts there were get topics read from their words', dropped && sqlOn(w2.data, 'PRAGMA user_version')[0].user_version === 7 && wTopics.some((r) => r.title.startsWith('Kuusi yötä metsässä') && r.topic === 'nature' && r.how === 'read') && wTopics.some((r) => r.title.startsWith('Ruisleivän') && r.topic === 'food') && wTopics.every((r) => r.how === 'read'));
  check('only public posts get topics (a friends-only post none)', !wTopics.some((r) => r.title === 'Kolme viikkoa Lofooteilla'));
  const wSaved = await fetch(W + '/api/me/interests', { method: 'POST', headers: { ...h(wJoose), 'content-type': 'application/json' }, body: JSON.stringify({ topics: ['food'] }) }).then(json);
  const wFyp = await fetch(W + '/api/fyp', { headers: h(wJoose) }).then(json);
  check('after the migration interests are kept and For You is judged by them', wSaved.asked === true && wFyp[0]?.because?.topics.includes('food'));
  await stop(w3, true);

  // --- a database of schema version 3 (before the webhook's events) is migrated on start ---
  let dropped3 = false;
  for (let i = 0; i < 20 && !dropped3; i++) {
    let db3;
    try {
      db3 = new DatabaseSync(path.join(w2.data, 'db.sqlite'));
      db3.exec(`PRAGMA foreign_keys = OFF; BEGIN; ${BEFORE_7} ${BEFORE_6} DROP TABLE email_tokens; CREATE TABLE accounts4 (user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created_at INTEGER NOT NULL, terms_at INTEGER); INSERT INTO accounts4 SELECT user_id, email, password, created_at, terms_at FROM accounts; DROP TABLE accounts; ALTER TABLE accounts4 RENAME TO accounts; DROP TABLE stripe_events; PRAGMA user_version = 3; COMMIT;`);
      dropped3 = true;
    } catch {
      await sleep(250);
    } finally {
      db3?.close();
    }
  }
  const w4 = await start(5198, { D2M_DEMO: '1' }, w2.data);
  check('a version 3 database is migrated on start: version 7, with the table of Stripe’s events, its data kept', dropped3 && sqlOn(w2.data, 'PRAGMA user_version')[0].user_version === 7 && sqlOn(w2.data, "SELECT count(*) AS n FROM sqlite_master WHERE name = 'stripe_events'")[0].n === 1 && (await fetch(W + '/api/me/interests', { headers: h(wJoose) }).then(json)).topics?.includes('food'));
  // a new account on it, its email not confirmed yet (to see the migration count it as verified)
  const wNew = await fetch(W + '/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ name: 'Uusi', username: 'uusi', email: 'uusi@example.com', password: 'a-long-password', terms: true }) });
  const wNewId = (await wNew.json()).id;
  await stop(w4, true);

  // --- a database of schema version 4 (before email verification) is migrated on start ---
  // (made the way version 4 had it: the accounts table rebuilt without its two columns, here and above;
  // SQLite's DROP COLUMN trips over the comments in the schema)
  let dropped4 = false;
  for (let i = 0; i < 20 && !dropped4; i++) {
    let db4;
    try {
      db4 = new DatabaseSync(path.join(w2.data, 'db.sqlite'));
      db4.exec(`PRAGMA foreign_keys = OFF; BEGIN; ${BEFORE_7} ${BEFORE_6} DROP TABLE email_tokens; CREATE TABLE accounts4 (user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created_at INTEGER NOT NULL, terms_at INTEGER); INSERT INTO accounts4 SELECT user_id, email, password, created_at, terms_at FROM accounts; DROP TABLE accounts; ALTER TABLE accounts4 RENAME TO accounts; PRAGMA user_version = 4; COMMIT;`);
      dropped4 = true;
    } catch {
      await sleep(250);
    } finally {
      db4?.close();
    }
  }
  const w5 = await start(5198, { D2M_DEMO: '1' }, w2.data);
  const w5Accounts = sqlOn(w2.data, 'SELECT user_id, verified_at, invite_code FROM accounts');
  check('a version 4 database is migrated on start: version 7, every account there was counted as verified, the table of links there', dropped4 && sqlOn(w2.data, 'PRAGMA user_version')[0].user_version === 7 && w5Accounts.length >= 8 && w5Accounts.every((a) => a.verified_at > 0 && a.invite_code === null) && w5Accounts.some((a) => a.user_id === wNewId) && sqlOn(w2.data, "SELECT count(*) AS n FROM sqlite_master WHERE name = 'email_tokens'")[0].n === 1);
  check('after it, the sessions and the data are kept, and a migrated account is verified', ((m) => m.verified === true && m.email === 'joose@demo.d2m')(await fetch(W + '/api/me', { headers: h(wJoose) }).then(json)) && (await fetch(W + '/api/me/interests', { headers: h(wJoose) }).then(json)).topics?.includes('food'));
  await stop(w5, true);

  // --- a database of schema version 5 (before moderation) is migrated on start ---
  // (a report with the old reason 'intimate' in it: the migration makes it 'sexual')
  let dropped5 = false;
  for (let i = 0; i < 20 && !dropped5; i++) {
    let db5;
    try {
      db5 = new DatabaseSync(path.join(w2.data, 'db.sqlite'));
      db5.exec(`PRAGMA foreign_keys = OFF; BEGIN; ${BEFORE_7} ${BEFORE_6} INSERT INTO reports (post_id, user_id, reason, created_at) SELECT p.id, u.id, 'intimate', ${Date.now()} FROM posts p, users u WHERE u.username = 'aino' AND p.audience = 'public' LIMIT 1; PRAGMA user_version = 5; COMMIT;`);
      dropped5 = true;
    } catch {
      await sleep(250);
    } finally {
      db5?.close();
    }
  }
  const w6 = await start(5198, { D2M_DEMO: '1' }, w2.data);
  const w6Tables = sqlOn(w2.data, "SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE 'mod_%' OR name = 'suspensions') ORDER BY name").map((r) => r.name);
  check('a version 5 database is migrated on start: version 7, the moderation tables and the posts’ restricted column there, an old intimate report now sexual', dropped5 && sqlOn(w2.data, 'PRAGMA user_version')[0].user_version === 7 && JSON.stringify(w6Tables) === JSON.stringify(['mod_complaints', 'mod_decisions', 'mod_log', 'mod_notices', 'mod_tokens', 'suspensions']) && sqlOn(w2.data, "SELECT count(*) AS n FROM pragma_table_info('posts') WHERE name = 'restricted'")[0].n === 1 && sqlOn(w2.data, "SELECT reason FROM reports").every((r) => r.reason === 'sexual') && sqlOn(w2.data, "SELECT count(*) AS n FROM reports")[0].n === 1);
  check('after it, the sessions and the data are kept, and @joose moderates the demo', ((m) => m.moderator === true && m.email === 'joose@demo.d2m')(await fetch(W + '/api/me', { headers: h(wJoose) }).then(json)) && (await fetch(W + '/api/mod/queue', { headers: h(wJoose) }).then(json)).posts?.[0]?.reports?.sexual === 1);
  await stop(w6, true);

  // --- a database of schema version 6 (before groups) is migrated on start ---
  // (the posts table is rebuilt for its new CHECK: every post, message, topic and note is kept)
  const rows = () => JSON.stringify(sqlOn(w2.data, 'SELECT (SELECT count(*) FROM posts) AS p, (SELECT count(*) FROM messages) AS m, (SELECT count(*) FROM post_topics) AS t, (SELECT count(*) FROM notes) AS n, (SELECT count(*) FROM reports) AS r'));
  let dropped6 = false;
  let rows6 = '';
  for (let i = 0; i < 20 && !dropped6; i++) {
    let db6;
    try {
      rows6 = rows();
      db6 = new DatabaseSync(path.join(w2.data, 'db.sqlite'));
      db6.exec(`PRAGMA foreign_keys = OFF; BEGIN; ${BEFORE_7} PRAGMA user_version = 6; COMMIT;`);
      dropped6 = true;
    } catch {
      await sleep(250);
    } finally {
      db6?.close();
    }
  }
  const was6 = dropped6 && sqlOn(w2.data, "SELECT count(*) AS n FROM sqlite_master WHERE name = 'groups'")[0].n === 0 && sqlOn(w2.data, "SELECT count(*) AS n FROM pragma_table_info('posts') WHERE name = 'group_id'")[0].n === 0;
  const w7 = await start(5198, { D2M_DEMO: '1' }, w2.data);
  const w7Tables = sqlOn(w2.data, "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'group%' ORDER BY name").map((r) => r.name);
  check('a version 6 database is migrated on start: version 7, the groups’ tables and the posts’ group_id there, every post, message, topic, note and report kept, no foreign key broken', was6 && sqlOn(w2.data, 'PRAGMA user_version')[0].user_version === 7 && JSON.stringify(w7Tables) === JSON.stringify(['group_bans', 'group_invites', 'group_members', 'groups']) && sqlOn(w2.data, "SELECT count(*) AS n FROM pragma_table_info('posts') WHERE name = 'group_id'")[0].n === 1 && rows() === rows6 && sqlOn(w2.data, 'PRAGMA foreign_key_check').length === 0);
  const w7Joose = { cookie: cookieOf(await fetch(W + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email: 'joose@demo.d2m', password: PASSWORD }) })) };
  const w7Group = await fetch(W + '/api/groups', { method: 'POST', headers: { ...h(w7Joose), 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'friends', name: 'Migraatio' }) }).then(json);
  const w7Form = new FormData();
  w7Form.set('kind', 'blog'); w7Form.set('title', 'Ryhmälle'); w7Form.set('body', 'x'); w7Form.set('audience', 'group'); w7Form.set('group', w7Group.id);
  w7Form.set('image', new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' }), 'c.jpg');
  const w7Post = await fetch(W + '/api/posts', { method: 'POST', headers: h(w7Joose), body: w7Form });
  check('after it, a group is made and a post written to it (the audience group the rebuilt table allows), the old posts still read', w7Post.status === 200 && (await w7Post.json()).groupId === w7Group.id && (await fetch(W + '/api/feed', { headers: h(w7Joose) }).then(json)).some((p) => p.title === 'Kolme viikkoa Lofooteilla'));
  await stop(w7);

  // --- payments on (a fake key, never used: each check is refused before any call to Stripe) ---
  // (and Stripe's webhook with a test secret, behind a trusted proxy; its output kept to look at)
  const payingLog = path.join(os.tmpdir(), `d2m-check-paying-${process.pid}.log`);
  const paying = await start(5196, { D2M_DEMO: '1', D2M_PAY: '', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test', D2M_TRUST_PROXY: '1', D2M_ORIGIN: 'https://deartome.example/' }, undefined, payingLog);
  const Q = 'http://127.0.0.1:5196';
  // (this server also runs with D2M_ORIGIN: the site's public address, not the request's host)
  const qMira = await fetch(Q + '/@mira').then((r) => r.text());
  check('D2M_ORIGIN gives the addresses: canonical, og:url, the sitemap, robots.txt', qMira.includes('<link rel="canonical" href="https://deartome.example/@mira" />') && qMira.includes('<meta property="og:url" content="https://deartome.example/@mira" />') && (await fetch(Q + '/sitemap.xml').then((r) => r.text())).includes('<loc>https://deartome.example/@mira</loc>') && (await fetch(Q + '/robots.txt').then((r) => r.text())).includes('Sitemap: https://deartome.example/sitemap.xml'));
  const as = async (name) => {
    const res = await fetch(Q + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email: `${name.toLowerCase()}@demo.d2m`, password: PASSWORD }) });
    return { ...(await res.json()), cookie: cookieOf(res) };
  };
  const ask = (u, path, body) => fetch(Q + path, { method: 'POST', headers: { ...h(u), 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, code: (await r.json()).code }));
  const refused = (r) => r.status === 400 && r.code === 'consent';
  const [pJoose, pLeo] = await Promise.all(['Joose', 'Leo'].map(as));
  const people = await fetch(Q + '/api/users', { headers: h(pJoose) }).then(json);
  const pMira = people.find((u) => u.name === 'Mira');
  const pEeva = people.find((u) => u.name === 'Eeva');
  const forSale = (await fetch(Q + `/api/users/${pEeva.id}/public`, { headers: h(pJoose) }).then(json)).find((p) => p.price);
  check('payments in Stripe test mode (sk_test_): /api/config says test; not a beta', ((c) => c.payments === 'test' && !c.beta && !c.invite)(await fetch(Q + '/api/config').then(json)));
  check('payments on: a plan without the express consent is refused (400)', refused(await ask(pJoose, '/api/me/plan', { plan: 'pro' })));
  check('payments on: a storage pack without consent is refused', refused(await ask(pLeo, '/api/me/storage', { space: 'video' })));
  check('payments on: a subscription to an author without consent is refused', refused(await ask(pJoose, `/api/subscribe/${pMira.id}`, {})));
  check('payments on: a single post without consent is refused', refused(await ask(pJoose, `/api/posts/${forSale.id}/buy`, { consent: 'yes' })));

  // --- behind the proxy: HSTS only over https, as the proxy says (D2M_TRUST_PROXY=1 on this server) ---
  check('HSTS over https behind the trusted proxy (x-forwarded-proto: https)', ((r) => r.headers.get('strict-transport-security') === 'max-age=31536000')(await fetch(Q + '/', { headers: { 'x-forwarded-proto': 'https' } })));
  check('no HSTS over plain http behind it', !(await fetch(Q + '/')).headers.has('strict-transport-security'));
  check('the CSP names the live channel’s wss: address when D2M_ORIGIN is set', /connect-src 'self' wss:\/\/deartome\.example /.test((await fetch(Q + '/')).headers.get('content-security-policy') ?? ''));

  // --- Stripe's webhook (signed with the test secret; nothing here calls Stripe) ---
  const signer = new Stripe('sk_test_dummy');
  const SECRET = 'whsec_test';
  let eventN = 0;
  /** An event as Stripe sends it, signed (`secret`: another one for a bad signature); its id beside the response. */
  const hook = async (type, object, { id = `evt_check_${++eventN}`, secret = SECRET, signature } = {}) => {
    const payload = JSON.stringify({ id, object: 'event', type, api_version: '2026-09-30.endive', created: Math.floor(Date.now() / 1000), data: { object }, livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null } });
    const header = signature ?? signer.webhooks.generateTestHeaderString({ payload, secret });
    const res = await fetch(Q + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
    return { id, status: res.status, body: await res.json().catch(() => ({})) };
  };
  const pSara = people.find((u) => u.name === 'Sara');
  const sara = await as('Sara');
  const qOne = (q, ...a) => sqlOn(paying.data, q, ...a)[0];
  const session = (id, metadata, subscription, amount = 500) => ({ id, object: 'checkout.session', status: 'complete', payment_status: 'paid', mode: 'subscription', amount_total: amount, subscription, payment_intent: null, metadata: { d2m: '1', userId: pSara.id, consentAt: String(Date.now()), ...metadata } });
  const sub = (id, more = {}) => ({ id, object: 'subscription', status: 'active', cancel_at_period_end: false, cancel_at: null, metadata: {}, items: { object: 'list', data: [{ id: `si_${id}`, current_period_start: Math.floor(Date.now() / 1000), current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] }, ...more });

  check('webhook: no signature, or one made with another secret: 400', (await hook('checkout.session.completed', {}, { signature: '' })).status === 400 && (await hook('checkout.session.completed', {}, { secret: 'whsec_other' })).status === 400);
  check('webhook: a body changed after signing: 400', await (async () => {
    const payload = JSON.stringify({ id: 'evt_x', object: 'event', type: 'invoice.paid', data: { object: {} } });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    return (await fetch(Q + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload.replace('evt_x', 'evt_y') })).status === 400;
  })());
  check('webhook: needs no x-d2m header and no cookie; the exemption is this one path only', (await hook('invoice.payment_failed', { id: 'in_1', object: 'invoice', parent: null })).status === 200 && (await fetch(Q + '/api/stripe/other', { method: 'POST' })).status === 403);

  // a plan paid at Checkout, its buyer never back: the webhook grants it; sent twice, and confirmed too, once
  check('webhook: Sara is on Lite before', (await fetch(Q + '/api/me/plan', { headers: h(sara) }).then(json)).plan === 'lite');
  const planPaid = session('cs_check_plan', { kind: 'plan', plan: 'pro' }, 'sub_check_plan');
  const first = await hook('checkout.session.completed', planPaid);
  const second = await hook('checkout.session.completed', planPaid);
  const confirmed = await fetch(Q + '/api/pay/confirm', { method: 'POST', headers: { ...h(sara), 'content-type': 'application/json' }, body: JSON.stringify({ session: 'cs_check_plan' }) }).then(json);
  check('webhook: checkout.session.completed grants the plan', first.status === 200 && (await fetch(Q + '/api/me/plan', { headers: h(sara) }).then(json)).plan === 'pro' && qOne('SELECT subscription AS s FROM pay_plans WHERE user_id = ?', pSara.id)?.s === 'sub_check_plan');
  check('webhook: the same session sent again, and confirmed by the buyer too, is granted once (one row in the purchases log)', second.status === 200 && confirmed.already === true && qOne("SELECT count(*) AS n FROM purchase_log WHERE session = 'cs_check_plan'").n === 1 && qOne('SELECT count(*) AS n FROM pay_sessions WHERE id = ?', 'cs_check_plan').n === 1);
  check('webhook: the purchases log has the payment, with the consent from before Checkout', ((r) => r?.kind === 'plan' && r.item === 'pro' && r.amount === 500 && r.subscription === 'sub_check_plan' && r.consent_at > 0)(qOne("SELECT * FROM purchase_log WHERE session = 'cs_check_plan'")));
  check('webhook: an unpaid session (a bank transfer still on its way) grants nothing', (await hook('checkout.session.completed', { ...session('cs_check_unpaid', { kind: 'pack', space: 'media' }, 'sub_x'), payment_status: 'unpaid' })).status === 200 && qOne("SELECT count(*) AS n FROM pay_sessions WHERE id = 'cs_check_unpaid'").n === 0);

  // two storage packs, then one ends at Stripe: one fewer
  await hook('checkout.session.completed', session('cs_check_pack1', { kind: 'pack', space: 'media' }, 'sub_check_pack1', 200));
  await hook('checkout.session.completed', session('cs_check_pack2', { kind: 'pack', space: 'media' }, 'sub_check_pack2', 200));
  const packs = async () => (await fetch(Q + '/api/me/plan', { headers: h(sara) }).then(json)).packs.media;
  check('webhook: two media packs granted', (await packs()) === 2);
  const packGone = await hook('customer.subscription.deleted', sub('sub_check_pack1', { status: 'canceled' }));
  check('webhook: a pack’s subscription deleted at Stripe: one fewer, its id gone', packGone.status === 200 && (await packs()) === 1 && !qOne("SELECT 1 AS x FROM pay_packs WHERE subscription = 'sub_check_pack1'"));
  await hook('customer.subscription.deleted', sub('sub_check_pack2', { status: 'canceled' }));
  check('webhook: the event of a pack already ended, under a new id, changes nothing', (await hook('customer.subscription.deleted', sub('sub_check_pack1', { status: 'canceled' }))).status === 200 && (await packs()) === 0);

  // the plan ends at Stripe (it gave up, or cancelled in the Dashboard): back to Lite, never cancelled again
  const planGone = await hook('customer.subscription.deleted', sub('sub_check_plan', { status: 'canceled' }));
  check('webhook: the plan’s subscription deleted at Stripe: back to Lite, its id gone', planGone.status === 200 && (await fetch(Q + '/api/me/plan', { headers: h(sara) }).then(json)).plan === 'lite' && !qOne('SELECT 1 AS x FROM pay_plans WHERE user_id = ?', pSara.id));

  // a reader's subscription: set to end at Stripe (until mirrored), then deleted (gone)
  const sqlPay = (q) => {
    const d = new DatabaseSync(path.join(paying.data, 'db.sqlite'));
    try {
      d.exec('PRAGMA busy_timeout = 5000');
      d.exec(q);
    } finally {
      d.close();
    }
  };
  sqlPay(`INSERT INTO subscriptions (reader_id, author_id) VALUES ('${pJoose.id}', '${pMira.id}') ON CONFLICT DO NOTHING; INSERT OR REPLACE INTO pay_readers (reader_id, author_id, subscription) VALUES ('${pJoose.id}', '${pMira.id}', 'sub_check_reader');`);
  const ends = Math.floor(Date.now() / 1000) + 10 * 86400;
  const set = await hook('customer.subscription.updated', sub('sub_check_reader', { cancel_at_period_end: true, items: { object: 'list', data: [{ id: 'si_r', current_period_start: ends - 30 * 86400, current_period_end: ends }] } }));
  const until = () => qOne('SELECT until FROM subscriptions WHERE reader_id = ? AND author_id = ?', pJoose.id, pMira.id)?.until;
  check('webhook: a reader’s subscription set at Stripe to end with its period: open until then here (until)', set.status === 200 && until() === ends * 1000);
  // the same event id again is not applied again (its effect undone beside the server first)
  sqlPay(`UPDATE subscriptions SET until = NULL WHERE reader_id = '${pJoose.id}' AND author_id = '${pMira.id}'`);
  const again = await hook('customer.subscription.updated', sub('sub_check_reader', { cancel_at_period_end: true }), { id: set.id });
  check('webhook: an event id is applied once (sent again: 200, already, nothing changes)', again.status === 200 && again.body.already === true && until() === null && qOne('SELECT count(*) AS n FROM stripe_events WHERE id = ?', set.id).n === 1);
  const readerGone = await hook('customer.subscription.deleted', sub('sub_check_reader', { status: 'canceled' }));
  check('webhook: a reader’s subscription deleted at Stripe: removed here, its id too', readerGone.status === 200 && (await fetch(Q + `/api/search?q=mira`, { headers: h(pJoose) }).then(json)).find((p) => p.user.id === pMira.id)?.subscribed === false && !qOne("SELECT 1 AS x FROM pay_readers WHERE subscription = 'sub_check_reader'"));
  const before = JSON.stringify(sqlOn(paying.data, 'SELECT (SELECT count(*) FROM pay_plans) + (SELECT count(*) FROM pay_packs) + (SELECT count(*) FROM pay_readers) + (SELECT count(*) FROM subscriptions) AS n'));
  check('webhook: an unknown subscription deleted, or an event of another kind: 200, ignored', (await hook('customer.subscription.deleted', sub('sub_not_ours'))).status === 200 && (await hook('product.created', { id: 'prod_1', object: 'product' })).status === 200 && JSON.stringify(sqlOn(paying.data, 'SELECT (SELECT count(*) FROM pay_plans) + (SELECT count(*) FROM pay_packs) + (SELECT count(*) FROM pay_readers) + (SELECT count(*) FROM subscriptions) AS n')) === before);
  await sleep(300);
  const payLog = fs.readFileSync(payingLog, 'utf8');
  check('webhook: nothing was cancelled at Stripe (no call made, none failed), and the ends were logged', !/could not cancel|Stripe webhook: .* failed/.test(payLog) && payLog.includes('sub_check_plan ended at Stripe (plan)'));
  await stop(paying);
  try {
    fs.rmSync(payingLog, { force: true });
  } catch {}

  // --- email through Cloudflare Email Service: the request the server makes, to a fake API of our own ---
  // (CLOUDFLARE_API_BASE_URL points it here; this server is a beta with payments off, and has no outbox)
  const cfSeen = [];
  let cfAnswer = { status: 200, body: { success: true, errors: [], messages: [], result: { delivered: ['joose@demo.d2m'], permanent_bounces: [], queued: [] } } };
  const fakeCf = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      cfSeen.push({ method: req.method, url: req.url, headers: req.headers, body: (() => { try { return JSON.parse(body); } catch { return body; } })() });
      res.writeHead(cfAnswer.status, { 'content-type': 'application/json' }).end(JSON.stringify(cfAnswer.body));
    });
  });
  await new Promise((r) => fakeCf.listen(5194, '127.0.0.1', r));
  const cfLog = path.join(os.tmpdir(), `d2m-check-mail-${process.pid}.log`);
  const cf = await start(5195, { D2M_DEMO: '1', D2M_BETA: '1', MAIL_PROVIDER: 'cloudflare', CLOUDFLARE_ACCOUNT_ID: 'acc-check-123', CLOUDFLARE_EMAIL_TOKEN: 'cf-check-token', MAIL_FROM: 'Dear to Me <noreply@deartome.example>', CLOUDFLARE_API_BASE_URL: 'http://127.0.0.1:5194/client/v4' }, undefined, cfLog);
  const CF = 'http://127.0.0.1:5195';
  const cfForgot = (email) => fetch(CF + '/api/password/forgot', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email }) });
  const cfAsked = await cfForgot('joose@demo.d2m');
  for (let i = 0; i < 50 && cfSeen.length === 0; i++) await sleep(100);
  const sentCf = cfSeen[0];
  check('Cloudflare: POST {base}/accounts/{account id}/email/sending/send, with the token as a Bearer and JSON', cfAsked.status === 200 && sentCf?.method === 'POST' && sentCf.url === '/client/v4/accounts/acc-check-123/email/sending/send' && sentCf.headers.authorization === 'Bearer cf-check-token' && /^application\/json/.test(sentCf.headers['content-type']));
  check('Cloudflare: the body is { to, from: { address, name }, subject, text, html }', sentCf?.body?.to === 'joose@demo.d2m' && JSON.stringify(sentCf.body.from) === JSON.stringify({ address: 'noreply@deartome.example', name: 'Dear to Me' }) && /salasana/i.test(sentCf.body.subject) && /\/reset\?token=[A-Za-z0-9_-]{43}/.test(sentCf.body.text) && sentCf.body.html.includes('<a href="http://127.0.0.1:5195/reset?token=') && Object.keys(sentCf.body).sort().join() === 'from,html,subject,text,to');
  check('with a provider there is no dev outbox (404)', (await fetch(CF + '/api/dev/outbox')).status === 404);
  // Cloudflare refuses (a token without the permission): the answer to the asker is the same, the log says why
  cfAnswer = { status: 403, body: { success: false, errors: [{ code: 10102, message: 'email.sending.error.authentication.forbidden' }], messages: [], result: null } };
  const cfRefused = await cfForgot('aino@demo.d2m');
  for (let i = 0; i < 50 && cfSeen.length < 2; i++) await sleep(100);
  await sleep(300);
  check('Cloudflare refusing: forgot answers the same, and the server log says why', cfRefused.status === 200 && JSON.stringify(await cfRefused.json()) === '{"ok":true}' && fs.readFileSync(cfLog, 'utf8').includes('10102 email.sending.error.authentication.forbidden'));
  check('beta with payments off: /api/config says beta, payments off, no invite code asked', ((c) => c.beta === true && c.payments === 'off' && !c.invite)(await fetch(CF + '/api/config').then(json)));
  await stop(cf);
  await new Promise((r) => fakeCf.close(r));
  try {
    fs.rmSync(cfLog, { force: true });
  } catch {}

  // --- a beta with invite codes and live payments (a fake key: nothing here calls Stripe) ---
  const inv = await start(5195, { D2M_DEMO: '1', D2M_BETA: '1', D2M_INVITE_CODES: ' KEVAT-2026 , ystävät ', D2M_PAY: '', STRIPE_SECRET_KEY: 'sk_live_check' });
  const I = 'http://127.0.0.1:5195';
  const invUp = (invite, n) => fetch(I + '/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ name: 'Kutsuttu', username: `kutsuttu${n}`, email: `kutsuttu${n}@example.com`, password: 'a-long-password', terms: true, ...(invite === undefined ? {} : { invite }) }) });
  check('beta with a live key: /api/config says beta, payments live, an invite code asked', ((c) => c.beta === true && c.payments === 'live' && c.invite === true)(await fetch(I + '/api/config').then(json)));
  check('invite codes: none given, or a wrong one: 403 invite, no account', (await invUp(undefined, 1).then(json)).code === 'invite' && ((r) => r.status === 403)(await invUp('KEVAT-2025', 2)) && sqlOn(inv.data, "SELECT count(*) AS n FROM accounts WHERE email LIKE 'kutsuttu%'")[0].n === 0);
  const invited = await invUp(' kevat-2026 ', 3);
  check('invite codes: a right one (any case, trimmed) signs up, reusable, and the account keeps the code as configured', invited.status === 200 && (await invUp('YSTÄVÄT', 4)).status === 200 && (await invUp('ystävät', 5)).status === 200 && JSON.stringify(sqlOn(inv.data, "SELECT invite_code AS c FROM accounts WHERE email LIKE 'kutsuttu%' ORDER BY email").map((r) => r.c)) === JSON.stringify(['KEVAT-2026', 'ystävät', 'ystävät']));
  check('the demo people need no code (their accounts were there)', sqlOn(inv.data, "SELECT count(*) AS n FROM accounts WHERE email LIKE '%@demo.d2m' AND invite_code IS NULL")[0].n === 7);
  await stop(inv);

  // --- the dev outbox is never in production: D2M_MAIL=log refuses to start, and without it there is none ---
  const mailRefusedData = fs.mkdtempSync(path.join(os.tmpdir(), 'd2m-check-'));
  const mailRefusal = await new Promise((resolve) => {
    const p = spawn('npx tsx server/index.ts', { env: { ...process.env, D2M_MEDIA: 'disk', D2M_PAY: 'off', D2M_DATA: mailRefusedData, PORT: '5195', D2M_MAIL: 'log', NODE_ENV: 'production' }, shell: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'], { stdio: 'ignore' });
      else p.kill();
      resolve({ code: 'timeout', err });
    }, 20_000);
    p.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, err });
    });
  });
  check('D2M_MAIL=log with NODE_ENV=production: the server refuses to start (the outbox would show reset links)', typeof mailRefusal.code === 'number' && mailRefusal.code !== 0 && mailRefusal.err.includes('Refusing to start: D2M_MAIL=log') && !fs.existsSync(path.join(mailRefusedData, 'db.sqlite')));
  fs.rmSync(mailRefusedData, { recursive: true, force: true });
  const prodMail = await start(5195, { NODE_ENV: 'production', D2M_DEMO: '' });
  const PM = 'http://127.0.0.1:5195';
  const pmUp = await fetch(PM + '/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ name: 'Tuotanto', username: 'tuotanto', email: 'tuotanto@example.com', password: 'a-long-password', terms: true }) });
  check('production without a provider: sign-up works, and there is no outbox to read (404)', pmUp.status === 200 && (await fetch(PM + '/api/dev/outbox')).status === 404 && (await fetch(PM + '/api/dev/outbox?to=tuotanto@example.com')).status === 404);
  await stop(prodMail);

  // --- D2M_MAIL=console (a demo on one's own machine): allowed in production, no outbox on the web, and the
  // accounts count as verified, since no email could confirm them ---
  const consoleMail = await start(5195, { NODE_ENV: 'production', D2M_DEMO: '', D2M_MAIL: 'console' });
  const cmUp = await fetch(PM + '/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ name: 'Demo', username: 'demokaveri', email: 'demo@example.com', password: 'a-long-password', terms: true }) });
  const cmUser = cmUp.status === 200 ? await cmUp.json() : {};
  check('D2M_MAIL=console in production: it starts, sign-up counts as verified, and there is no outbox on the web', cmUp.status === 200 && cmUser.verified === true && (await fetch(PM + '/api/dev/outbox')).status === 404);
  await stop(consoleMail);

  // --- the demo is never on in production: the server refuses to start, before writing anything ---
  const refusedData = fs.mkdtempSync(path.join(os.tmpdir(), 'd2m-check-'));
  const refusal = await new Promise((resolve) => {
    const p = spawn('npx tsx server/index.ts', { env: { ...process.env, D2M_MEDIA: 'disk', D2M_PAY: 'off', D2M_DATA: refusedData, PORT: '5195', D2M_DEMO: '1', NODE_ENV: 'production' }, shell: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'], { stdio: 'ignore' });
      else p.kill();
      resolve({ code: 'timeout', err });
    }, 20_000);
    p.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, err });
    });
  });
  check('D2M_DEMO=1 with NODE_ENV=production: the server exits non-zero at once, says why, and writes no database', typeof refusal.code === 'number' && refusal.code !== 0 && refusal.err.includes('Refusing to start') && !fs.existsSync(path.join(refusedData, 'db.sqlite')));
  fs.rmSync(refusedData, { recursive: true, force: true });
}

console.log(ok ? 'all good' : 'SOMETHING FAILED');
process.exitCode = ok ? 0 : 1;
