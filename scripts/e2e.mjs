// The whole workflow in a real browser (Edge, through playwright-core), two people at once:
// Joose and Aino, as they would use it. `npm run e2e` builds the site, starts a server of its own on
// a fresh temporary data folder (the real data is not touched), clicks through, and stops it.
// A failed step leaves a screenshot in the temporary folder it names. Everyone signs in through the
// form (the demo people, D2M_DEMO=1), each in a browser context of their own (their own cookie).
// The browser's own line for an expected 401 (signed out, a wrong password) is not an error, nor a
// 404 on the page of a visitor sent where nothing is public. Email links are read from the dev outbox;
// a closed beta (D2M_BETA=1, an invite code) runs on a second server of its own, on port 5196. Moderation:
// @joose (a moderator in demo mode) removes a reported post, its author complains through the emailed link and
// the decision is reversed, and a suspended person is told why she cannot sign in. Groups: Joose starts a friend
// group and invites Aino, who accepts from the badge; they talk under his post to it; Mikko, not a member, is told
// it is not found; Aino starts an interest group, and Joose joins it from the Groups page and posts.

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { WebSocket } from 'ws';

const PORT = 5197;
const BASE = `http://127.0.0.1:${PORT}`;
// a closed beta with invite codes, on a server of its own
const BETA_PORT = 5196;
const BETA = `http://127.0.0.1:${BETA_PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2m-e2e-'));
const shots = path.join(tmp, 'shots');
fs.mkdirSync(shots);

console.log('building the site…');
// unminified, so an error in the browser names the code it comes from
execSync('npx vite build --minify false --logLevel error', { stdio: 'inherit', env: { ...process.env, ...(process.env.E2E_DEV ? { NODE_ENV: 'development' } : {}) } });
const server = spawn('npx tsx server/index.ts', { env: { ...process.env, D2M_MEDIA: 'disk', D2M_PAY: 'off', D2M_DATA: path.join(tmp, 'data'), PORT: String(PORT), D2M_DEMO: '1' }, shell: true, stdio: 'ignore' });
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 250));
  if (await fetch(BASE + '/api/config').then((r) => r.ok, () => false)) break;
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
/** A browser of its own. `expect404`, `expect`: statuses the browser's console may report without it being an error. */
async function person({ expect404 = false, expect = [] } = {}) {
  const ctx = await browser.newContext({ locale: 'fi-FI', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`page error: ${e.message} | ${(e.stack ?? '').split('\n').slice(1, 4).map((l) => l.trim()).join(' | ')}`));
  page.on('console', (m) => (m.type() === 'error' || (process.env.E2E_DEV && m.type() === 'warning')) && !m.text().includes('favicon') && !m.text().includes('status of 401') && !(expect404 && m.text().includes('status of 404')) && !expect.some((s) => m.text().includes(`status of ${s}`)) && errors.push(`console: ${m.text().slice(0, 600)}`));
  return page;
}

let failed = 0;
async function step(name, page, f) {
  try {
    await f();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    const file = path.join(shots, `${failed}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    console.log(`FAIL ${name}\n     ${String(e.message).split('\n')[0]}\n     screenshot: ${file}`);
  }
}
const timeout = { timeout: 8000 };

/** The token of the newest link of a kind ('verify' or 'reset') mailed to an address (the dev outbox, D2M_DEMO=1). */
async function lastToken(base, to, kind) {
  const box = await fetch(`${base}/api/dev/outbox?to=${encodeURIComponent(to)}`).then((r) => r.json());
  for (let i = box.length - 1; i >= 0; i--) {
    const m = box[i].text.match(new RegExp(`/${kind}\\?token=([A-Za-z0-9_-]+)`));
    if (m) return m[1];
  }
}
const seed = (f) => path.resolve('public/seed', f);

/** Sign in through the form, as a demo person (D2M_DEMO=1). */
async function signIn(page, email, password = 'dear-to-me-demo') {
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click();
}

const joose = await person();
const aino = await person();

// ---------- the landing page ----------
await step('the landing page greets a visitor (Finnish, from the browser)', joose, async () => {
  await joose.goto(BASE);
  await joose.getByText('Some ystävillesi, ei yleisölle.').waitFor(timeout);
  if (await joose.locator('.beta-banner, .beta-tag').count()) throw new Error('a beta banner without D2M_BETA');
});

// ---------- a visitor who is not signed in: the public pages as they are ----------
const visitor = await person();
// no live channel for a visitor, and no landing page between the server's page and the app's
const visitorSockets = [];
visitor.on('websocket', (ws) => visitorSockets.push(ws.url()));
await visitor.addInitScript(() => {
  new MutationObserver(() => {
    if (document.querySelector('.landing')) window.__sawLanding = true;
  }).observe(document, { childList: true, subtree: true });
});
/** A demo person's session cookie, through the API (to set the scene beside the browsers). */
const cookieFor = async (name) => {
  const res = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email: `${name}@demo.d2m`, password: 'dear-to-me-demo' }) });
  return (res.headers.getSetCookie().find((c) => c.startsWith('d2m_session=')) ?? '').split(';')[0];
};
await step('a signed-out visitor opens /@mira: her own title, then her real profile and public posts in a light frame, never the landing page', visitor, async () => {
  await visitor.goto(BASE + '/@mira');
  if ((await visitor.title()) !== 'Mira (@mira) · Dear to Me') throw new Error(`title: ${await visitor.title()}`);
  await visitor.locator('.profile h1', { hasText: 'Mira' }).waitFor(timeout);
  await visitor.locator('.profile .bio', { hasText: 'Kirjoitan joka aamu' }).waitFor(timeout);
  await visitor.locator('.card', { hasText: 'Miten kirjoitan joka aamu 1000 sanaa' }).waitFor(timeout);
  await visitor.locator('.public-top a', { hasText: 'Kirjaudu' }).waitFor(timeout);
  await visitor.locator('.public-top a', { hasText: 'Liity' }).waitFor(timeout);
  if (await visitor.locator('.tabbar, header.top nav').count()) throw new Error('the signed-in navigation shows');
  if (await visitor.locator('.prerender').count()) throw new Error('the readable version stayed');
  if (await visitor.evaluate(() => window.__sawLanding === true)) throw new Error('the landing page flashed');
});
await step('she opens a free public post: the whole post, its conversation read-only, and a way in to write; no socket', visitor, async () => {
  // Leo says something under Eeva's free post first
  const eeva = await fetch(BASE + '/api/users/by-username/eeva').then((r) => r.json());
  const free = eeva.posts.find((p) => !p.paid);
  const cookie = await cookieFor('leo');
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws', { headers: { cookie } });
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'say', postId: free.id, text: 'Leon viesti leipäjuuresta' }));
      setTimeout(() => (ws.close(), resolve()), 300);
    });
    ws.on('error', reject);
  });
  await visitor.goto(BASE + '/@eeva');
  await visitor.locator('.card', { hasText: free.title }).click();
  await visitor.locator('.post h1', { hasText: free.title }).waitFor(timeout);
  await visitor.locator('.chat .bubble', { hasText: 'Leon viesti leipäjuuresta' }).waitFor(timeout);
  await visitor.locator('.chat .hint', { hasText: 'kuka tahansa voi lukea sen' }).waitFor(timeout);
  await visitor.locator('.chat .join-prompt', { hasText: 'Kirjaudu tai liity, niin voit kirjoittaa keskusteluun.' }).waitFor(timeout);
  if (await visitor.locator('#say-input').count()) throw new Error('a visitor can type in the conversation');
  if (visitorSockets.length) throw new Error(`a socket was opened: ${visitorSockets.join(', ')}`);
});
await step('on Mira’s paid post the visitor reads its opening; subscribing asks her to sign in, and signing in brings her back to the post', visitor, async () => {
  await visitor.goto(BASE + '/@mira');
  await visitor.locator('.card', { hasText: 'Miten kirjoitan joka aamu 1000 sanaa' }).click();
  await visitor.locator('.post h1', { hasText: 'Miten kirjoitan joka aamu 1000 sanaa' }).waitFor(timeout);
  const postUrl = visitor.url();
  await visitor.locator('.prose', { hasText: 'kaksi vuotta' }).waitFor(timeout);
  if (await visitor.locator('.prose', { hasText: 'Kolmas sääntö' }).count()) throw new Error('the paid part shows');
  await visitor.locator('.locked button', { hasText: 'Tilaa Mira' }).click();
  await visitor.locator('.locked .join-prompt', { hasText: 'Kirjaudu tai liity, niin voit tilata kirjoittajan jutut.' }).waitFor(timeout);
  await visitor.locator('.locked .join-prompt a', { hasText: 'Kirjaudu' }).click();
  await visitor.getByRole('heading', { name: 'Kirjaudu sisään' }).waitFor(timeout);
  if (!visitor.url().includes('next=')) throw new Error(`no way back: ${visitor.url()}`);
  await signIn(visitor, 'sara@demo.d2m');
  await visitor.waitForURL(postUrl, timeout);
  await visitor.locator('.locked .consent-buy button', { hasText: 'Tilaa Mira' }).waitFor(timeout);
  await visitor.locator('header.top nav').waitFor(timeout);
  if (await visitor.locator('.public-top').count()) throw new Error('the light frame stayed after signing in');
});
await step('a signed-out visitor at a friends-only post’s address, or a private profile’s, is told it is not found or not public', visitor, async () => {
  const lost = await person({ expect404: true });
  const feed = await fetch(BASE + '/api/feed', { headers: { cookie: await cookieFor('joose') } }).then((r) => r.json());
  const lofoten = feed.find((p) => p.title === 'Kolme viikkoa Lofooteilla');
  await lost.goto(BASE + `/post/${lofoten.id}`);
  await lost.locator('.not-public h1', { hasText: 'Tätä sivua ei löydy tai se ei ole julkinen' }).waitFor(timeout);
  await lost.locator('.not-public a[href="/signup"]').waitFor(timeout);
  if (await lost.getByText('Kolme viikkoa Lofooteilla').count()) throw new Error('the private post’s title shows');
  await lost.goto(BASE + '/@sara');
  await lost.locator('.not-public h1', { hasText: 'Tätä sivua ei löydy tai se ei ole julkinen' }).waitFor(timeout);
  await lost.locator('.not-public a[href="/"]').click();
  await lost.getByText('Some ystävillesi, ei yleisölle.').waitFor(timeout);
  await lost.context().close();
});

await step('a visitor opens the terms from the landing page footer, without signing in', joose, async () => {
  await joose.locator('.landing-foot .legal-links a').first().click();
  await joose.locator('.legal-standalone .legal h1', { hasText: 'Käyttöehdot' }).waitFor(timeout);
  await joose.locator('.legal .legal-draft').waitFor(timeout);
  await joose.goto(BASE);
  await joose.getByText('Some ystävillesi, ei yleisölle.').waitFor(timeout);
});
await step('the language switch turns it English and back', joose, async () => {
  await joose.getByRole('button', { name: 'English' }).click();
  await joose.getByText('Social media for your friends, not an audience.').waitFor(timeout);
  await joose.getByRole('button', { name: 'Suomi' }).click();
  await joose.getByText('Some ystävillesi, ei yleisölle.').waitFor(timeout);
});
await step('"Aloita ilmaiseksi" leads to sign-up; the switch leads to sign-in, with the demo accounts', joose, async () => {
  await joose.getByRole('button', { name: 'Aloita ilmaiseksi' }).first().click();
  await joose.getByRole('heading', { name: 'Luo tili' }).waitFor(timeout);
  await joose.getByRole('button', { name: /Onko sinulla jo tili/ }).click();
  await joose.getByRole('heading', { name: 'Kirjaudu sisään' }).waitFor(timeout);
  await joose.locator('.demo-people .chip', { hasText: 'joose@demo.d2m' }).waitFor(timeout);
});

// ---------- signing in, the friends page, a BoVNote ----------
await step('a wrong password is told, and nothing opens', joose, async () => {
  await signIn(joose, 'joose@demo.d2m', 'not-the-password');
  await joose.locator('.login .error', { hasText: 'Sähköposti tai salasana on väärin' }).waitFor(timeout);
});
await step('Joose signs in with email and password and lands on the friends page', joose, async () => {
  await signIn(joose, 'joose@demo.d2m');
  await joose.locator('.home-switch a.on', { hasText: 'Kaverit' }).waitFor(timeout);
});
await step('Aino’s post shows a BoVNote waiting for Joose', joose, async () => {
  await joose.locator('.card', { hasText: 'Kolme viikkoa Lofooteilla' }).locator('.note-badge').waitFor(timeout);
});
await step('opening it gives the BoVNote, then the post and its conversation', joose, async () => {
  await joose.locator('.card', { hasText: 'Kolme viikkoa Lofooteilla' }).click();
  await joose.locator('.note-card', { hasText: 'lähde vaan' }).waitFor(timeout);
  await joose.getByRole('button', { name: 'Kiitos' }).click();
  await joose.locator('.note-card').waitFor({ state: 'detached', ...timeout });
  await joose.locator('.bubble', { hasText: 'Tuo neljäs päivä!' }).waitFor(timeout);
});

// ---------- live: two people in one conversation ----------
await step('Aino signs in (a demo account picked from the hint) and opens her own post from her own place', aino, async () => {
  await aino.goto(BASE + '/login');
  await aino.locator('.demo-people .chip', { hasText: 'aino@demo.d2m' }).click();
  await aino.getByRole('button', { name: 'Kirjaudu', exact: true }).click();
  await aino.locator('.home-switch').waitFor(timeout);
  await aino.goto(BASE + '/me');
  await aino.locator('.card', { hasText: 'Kolme viikkoa Lofooteilla' }).click();
  await aino.locator('.chat').waitFor(timeout);
});
await step('Joose sees Aino arrive: live, two faces', joose, async () => {
  await joose.locator('.chat-head .live-pill').waitFor(timeout);
  await joose.waitForFunction(() => document.querySelectorAll('.chat-head .faces .avatar').length === 2, null, timeout);
});
await step('Aino’s message reaches Joose live', aino, async () => {
  await aino.locator('#say-input').fill('Moi Joose, kiva että luit!');
  await aino.getByRole('button', { name: 'Lähetä' }).click();
  await joose.locator('.bubble', { hasText: 'Moi Joose, kiva että luit!' }).waitFor(timeout);
});

// ---------- writing ----------
await step('Publish waits for a cover picture; with one and a picture in the text, Joose’s blog is published', joose, async () => {
  await joose.goto(BASE + '/write');
  await joose.locator('#title').fill('Testijuttu kavereille');
  await joose.locator('#body').fill('Ensimmäinen kappale.\n\nToinen kappale.');
  if (await joose.getByRole('button', { name: 'Julkaise' }).isEnabled()) throw new Error('Publish is enabled with no picture');
  await joose.locator('.cover-pick input[type=file]').setInputFiles(seed('meri.jpg'));
  await joose.locator('.pictures-pick input[type=file]').setInputFiles(seed('lofoten.jpg'));
  if (!(await joose.locator('#body').inputValue()).includes('[kuva 1]')) throw new Error('no marker in the text');
  await joose.getByRole('button', { name: 'Julkaise' }).click();
  await joose.locator('.post h1', { hasText: 'Testijuttu kavereille' }).waitFor(timeout);
  await joose.locator('.post .prose-picture').waitFor(timeout);
});
await step('Aino is told at once that Joose posted', aino, async () => {
  await aino.locator('.toast', { hasText: 'Joose julkaisi' }).waitFor(timeout);
});

// ---------- a letter with a BoVNote ----------
await step('Joose writes Aino a letter with a BoVNote inside', joose, async () => {
  await joose.goto(BASE + '/write/letter');
  await joose.locator('.choose .chip', { hasText: 'Aino' }).first().click();
  await joose.locator('#title').fill('Kirje Ainolle');
  await joose.locator('#body').fill('Hei Aino. Tämä on vain sinulle.');
  await joose.locator('.cover-pick input[type=file]').setInputFiles(seed('miksi.jpg'));
  await joose.locator('.paper-note textarea').first().fill('Lue loppuun asti');
  await joose.locator('.choose .chip', { hasText: 'Aino' }).last().click();
  await joose.getByRole('button', { name: 'Julkaise' }).click();
  await joose.locator('.post h1', { hasText: 'Kirje Ainolle' }).waitFor(timeout);
});
await step('Aino finds the letter in Letters, and its BoVNote when she opens it', aino, async () => {
  await aino.goto(BASE + '/letters');
  await aino.locator('.card', { hasText: 'Kirje Ainolle' }).click();
  await aino.locator('.note-card', { hasText: 'Lue loppuun asti' }).waitFor(timeout);
  await aino.getByRole('button', { name: 'Kiitos' }).click();
});
await step('Aino picks two topics for a public post (no more than three); they are kept as she chose them', aino, async () => {
  await aino.goto(BASE + '/write');
  await aino.locator('#title').fill('Iltakävely');
  await aino.locator('#body').fill('Kävin kävelyllä ja ajattelin teitä.');
  await aino.locator('.cover-pick input[type=file]').setInputFiles(seed('lofoten.jpg'));
  await aino.locator('.seg button', { hasText: 'Julkinen' }).click();
  for (const name of ['luonto', 'hyvinvointi', 'matkat']) await aino.locator('.public-options .topic-chips .chip', { hasText: name }).click();
  if (!(await aino.locator('.public-options .topic-chips .chip', { hasText: 'ruoka' }).isDisabled())) throw new Error('a fourth topic can be picked');
  await aino.locator('.public-options .topic-chips .chip', { hasText: 'matkat' }).click();
  // one confirmation covers both rules: her own work, not made with AI, and nothing sexual
  await aino.locator('.public-options .rule', { hasText: 'Vahvistan, että juttu on omaa työtäni eikä tekoälyllä tehty, eikä siinä ole seksuaalista sisältöä.' }).waitFor(timeout);
  await aino.locator('.public-options .rule input').check();
  await aino.getByRole('button', { name: 'Julkaise' }).click();
  await aino.locator('.post h1', { hasText: 'Iltakävely' }).waitFor(timeout);
  const topics = await aino.evaluate(() => fetch('/api/me').then((r) => r.json()).then((me) => fetch(`/api/users/${me.id}/public`)).then((r) => r.json()).then((ps) => ps.find((p) => p.title === 'Iltakävely')?.topics));
  if (JSON.stringify(topics) !== JSON.stringify([{ id: 'nature', how: 'chosen' }, { id: 'wellbeing', how: 'chosen' }])) throw new Error(`topics: ${JSON.stringify(topics)}`);
});

// ---------- groups: a friend group by invitation, an interest group anyone joins ----------
let lukioPath = '';
let groupPostPath = '';
await step('Joose starts the friend group “Lukiokaverit” on the Groups page and invites @aino', joose, async () => {
  await joose.locator('header.top nav a.nav-groups', { hasText: 'Ryhmät' }).click();
  await joose.locator('.groups h1', { hasText: 'Ryhmät' }).waitFor(timeout);
  await joose.getByRole('button', { name: 'Perusta ryhmä' }).click();
  await joose.locator('.create-group-form .seg button.on', { hasText: 'Kaveriryhmä' }).waitFor(timeout);
  await joose.locator('#group-name').fill('Lukiokaverit');
  await joose.locator('#group-description').fill('Vanhat ajat ja uudet.');
  await joose.getByRole('button', { name: 'Perusta', exact: true }).click();
  await joose.locator('.group-page h1', { hasText: 'Lukiokaverit' }).waitFor(timeout);
  lukioPath = new URL(joose.url()).pathname;
  if (!/^\/g\/[0-9a-f]+$/.test(lukioPath)) throw new Error(`the address is ${joose.url()}`);
  await joose.locator('#group-invite').fill('@aino');
  await joose.getByRole('button', { name: 'Kutsu', exact: true }).click();
  await joose.locator('.invite-list li', { hasText: 'Aino' }).locator('.meta', { hasText: 'odottaa vastausta' }).waitFor(timeout);
});
await step('Aino gets the invitation as a badge, live; she is no member until she accepts it on the Groups page', aino, async () => {
  await aino.locator('header.top nav a.nav-groups .badge', { hasText: '1' }).waitFor(timeout);
  await aino.locator('header.top nav a.nav-groups').click();
  const row = aino.locator('.group-invitations .group-row', { hasText: 'Lukiokaverit' });
  await row.locator('.meta', { hasText: 'Joose kutsui sinut' }).waitFor(timeout);
  await row.getByRole('button', { name: 'Hyväksy' }).click();
  await aino.locator('.group-page h1', { hasText: 'Lukiokaverit' }).waitFor(timeout);
  await aino.locator('.group-members li', { hasText: 'Joose' }).locator('.tag', { hasText: 'ylläpitäjä' }).waitFor(timeout);
  await aino.locator('header.top nav a.nav-groups .badge').waitFor({ state: 'detached', ...timeout });
});
await step('Joose writes to the group from its page: “Ryhmä” is chosen, no topics or paid option; the post names the group', joose, async () => {
  await joose.reload();
  await joose.locator('.group-page').getByRole('link', { name: 'Kirjoita ryhmälle' }).click();
  await joose.locator('.seg button.on', { hasText: 'Ryhmä' }).waitFor(timeout);
  await joose.locator('.group-options .group-chip.on', { hasText: 'Lukiokaverit' }).waitFor(timeout);
  if (await joose.locator('.public-options').count()) throw new Error('the public options show for a group post');
  await joose.locator('#title').fill('Luokkakokous keväällä');
  await joose.locator('#body').fill('Kuka tulee? Kirjoittakaa alle.');
  await joose.locator('.cover-pick input[type=file]').setInputFiles(seed('kahvi.jpg'));
  await joose.getByRole('button', { name: 'Julkaise' }).click();
  await joose.locator('.post h1', { hasText: 'Luokkakokous keväällä' }).waitFor(timeout);
  await joose.locator('.post .group-link', { hasText: 'Lukiokaverit' }).waitFor(timeout);
  await joose.locator('.chat .hint', { hasText: 'vain ryhmän jäsenille' }).waitFor(timeout);
  groupPostPath = new URL(joose.url()).pathname;
});
await step('Aino finds it on the group’s page and they talk under it live', aino, async () => {
  await aino.goto(BASE + lukioPath);
  await aino.locator('.group-page .card', { hasText: 'Luokkakokous keväällä' }).click();
  await aino.locator('.post h1', { hasText: 'Luokkakokous keväällä' }).waitFor(timeout);
  await aino.locator('#say-input').fill('Minä tulen!');
  await aino.getByRole('button', { name: 'Lähetä' }).click();
  await joose.locator('.bubble', { hasText: 'Minä tulen!' }).waitFor(timeout);
});
const mikkoOutside = await person({ expect404: true });
await step('Mikko, not a member, is told the post and the group are not found', mikkoOutside, async () => {
  await mikkoOutside.goto(BASE + '/login');
  await signIn(mikkoOutside, 'mikko@demo.d2m');
  await mikkoOutside.locator('header.top nav').waitFor(timeout);
  await mikkoOutside.goto(BASE + groupPostPath);
  await mikkoOutside.locator('.post-missing h1', { hasText: 'Juttua ei löydy' }).waitFor(timeout);
  if (await mikkoOutside.getByText('Luokkakokous keväällä').count()) throw new Error('the group post’s title shows');
  await mikkoOutside.goto(BASE + lukioPath);
  await mikkoOutside.locator('.group-missing h1', { hasText: 'Ryhmää ei löydy' }).waitFor(timeout);
  if (await mikkoOutside.getByText('Lukiokaverit').count()) throw new Error('the group’s name shows');
  await mikkoOutside.context().close();
});
await step('Aino starts the interest group “Ruisleipä” under food', aino, async () => {
  await aino.goto(BASE + '/groups');
  await aino.getByRole('button', { name: 'Perusta ryhmä' }).click();
  await aino.locator('.create-group-form .seg button', { hasText: 'Kiinnostusryhmä' }).click();
  await aino.locator('#group-name').fill('Ruisleipä');
  await aino.locator('#group-description').fill('Juuret, taikinat ja uunit.');
  if (await aino.getByRole('button', { name: 'Perusta', exact: true }).isEnabled()) throw new Error('an interest group can be started without a topic');
  await aino.locator('.create-group-form .topic-chips .chip', { hasText: 'ruoka' }).click();
  await aino.getByRole('button', { name: 'Perusta', exact: true }).click();
  await aino.locator('.group-page h1', { hasText: 'Ruisleipä' }).waitFor(timeout);
  await aino.locator('.group-page .group-head .meta', { hasText: 'Kiinnostusryhmä' }).filter({ hasText: 'ruoka' }).waitFor(timeout);
});
await step('Joose joins it from the Groups page and posts to it, confirming the content rules', joose, async () => {
  await joose.goto(BASE + '/groups');
  const row = joose.locator('.group-interest .group-row', { hasText: 'Ruisleipä' });
  await row.getByRole('button', { name: 'Liity' }).click();
  await row.locator('.meta', { hasText: 'Jäsen ✓' }).waitFor(timeout);
  await row.locator('a.group-who').click();
  await joose.locator('.group-page h1', { hasText: 'Ruisleipä' }).waitFor(timeout);
  await joose.locator('.group-page').getByRole('link', { name: 'Kirjoita ryhmälle' }).click();
  await joose.locator('.group-options .group-chip.on', { hasText: 'Ruisleipä' }).waitFor(timeout);
  await joose.locator('#title').fill('Ensimmäinen ruisleipäni');
  await joose.locator('#body').fill('Juuri heräsi kolmessa päivässä.');
  await joose.locator('.cover-pick input[type=file]').setInputFiles(seed('meri.jpg'));
  if (await joose.getByRole('button', { name: 'Julkaise' }).isEnabled()) throw new Error('Publish is enabled without the rules confirmed');
  await joose.locator('.group-options .rule input').check();
  await joose.getByRole('button', { name: 'Julkaise' }).click();
  await joose.locator('.post h1', { hasText: 'Ensimmäinen ruisleipäni' }).waitFor(timeout);
  await joose.locator('.post .group-link', { hasText: 'Ruisleipä' }).click();
  await joose.locator('.group-page .card', { hasText: 'Ensimmäinen ruisleipäni' }).waitFor(timeout);
});

// ---------- For You, a paid post, a subscription ----------
await step('For You has Mira’s paid post, locked', joose, async () => {
  await joose.goto(BASE + '/fyp');
  await joose.locator('.card', { hasText: 'Miten kirjoitan joka aamu 1000 sanaa' }).click();
  await joose.locator('.locked').waitFor(timeout);
});
await step('subscribing waits for the express consent, then opens the whole post and its conversation', joose, async () => {
  await joose.locator('.locked .locked-lasts').waitFor(timeout);
  if (await joose.locator('.locked button', { hasText: 'Tilaa Mira' }).isEnabled()) throw new Error('subscribing is enabled without the consent');
  await joose.locator('.locked .consent input').check();
  await joose.locator('.locked button', { hasText: 'Tilaa Mira' }).click();
  await joose.locator('.prose', { hasText: 'Kolmas sääntö' }).waitFor(timeout);
  await joose.locator('#say-input').waitFor(timeout);
});

await step('Eeva’s Exclusive post is for sale; buying it once opens it', joose, async () => {
  await joose.goto(BASE + '/fyp');
  await joose.locator('.card', { hasText: 'Ruisleivän koko resepti' }).click();
  // how long it stays shows before buying, and the consent that the right of withdrawal ends
  await joose.locator('.locked .locked-lasts', { hasText: 'pysyvä' }).waitFor(timeout);
  await joose.locator('.locked .consent', { hasText: 'menetän 14 päivän peruuttamisoikeuteni' }).locator('input').check();
  await joose.locator('.locked button', { hasText: 'Osta juttu, 3,00 €' }).click();
  await joose.locator('.prose', { hasText: 'taikina' }).waitFor(timeout);
});

// ---------- search and a public profile ----------
await step('search finds Mira, and her public profile opens with its wallpaper', joose, async () => {
  await joose.goto(BASE + '/search');
  await joose.locator('.search-input').fill('mi');
  await joose.locator('.results li', { hasText: 'Mira' }).locator('.profile-link').click();
  await joose.locator('.profile h1', { hasText: 'Mira' }).waitFor(timeout);
  const bg = await joose.locator('.profile .wallpaper').evaluate((el) => getComputedStyle(el).backgroundImage);
  if (!bg.includes('kahvi')) throw new Error(`no wallpaper (${bg})`);
});
await step('Joose cancels his subscription to Mira on her profile (payments off: at once)', joose, async () => {
  await joose.locator('.profile-actions .tag.ok', { hasText: 'Tilattu ✓' }).waitFor(timeout);
  await joose.locator('.profile-actions').getByRole('button', { name: 'Peru tilaus' }).click();
  await joose.locator('.profile-actions').getByRole('button', { name: 'Vahvista peruminen' }).click();
  await joose.locator('.profile-actions button', { hasText: 'Tilaa Mira' }).waitFor(timeout);
});
await step('a profile opens by its username (/@mira), the @username under the name', joose, async () => {
  await joose.goto(BASE + '/@mira');
  await joose.locator('.profile h1', { hasText: 'Mira' }).waitFor(timeout);
  await joose.locator('.profile .profile-handle', { hasText: '@mira' }).waitFor(timeout);
  // and the address by id still works
  const id = await joose.evaluate(() => fetch('/api/users/by-username/mira').then((r) => r.json()).then((p) => p.user.id));
  await joose.goto(BASE + `/u/${id}`);
  await joose.locator('.profile .profile-handle', { hasText: '@mira' }).waitFor(timeout);
});
await step('an old hash link (/#/@mira) becomes /@mira and opens the profile', joose, async () => {
  await joose.goto(BASE + '/#/@mira');
  await joose.locator('.profile h1', { hasText: 'Mira' }).waitFor(timeout);
  const url = new URL(joose.url());
  if (url.pathname !== '/@mira' || url.hash) throw new Error(`the address is ${joose.url()}`);
});
await step('a link moves within the app (no reload), and the back and forward buttons work', joose, async () => {
  await joose.evaluate(() => (window.__stayed = true));
  await joose.locator('header.top nav a', { hasText: 'Kirjeet' }).click();
  await joose.waitForURL(BASE + '/letters', timeout);
  await joose.locator('main .write-button', { hasText: 'Kirjoita kirje' }).waitFor(timeout);
  if (!(await joose.evaluate(() => window.__stayed))) throw new Error('the site was loaded again');
  await joose.goBack();
  await joose.waitForURL(BASE + '/@mira', timeout);
  await joose.locator('.profile h1', { hasText: 'Mira' }).waitFor(timeout);
  await joose.goForward();
  await joose.waitForURL(BASE + '/letters', timeout);
  await joose.locator('main .write-button', { hasText: 'Kirjoita kirje' }).waitFor(timeout);
  if (!(await joose.evaluate(() => window.__stayed))) throw new Error('the site was loaded again');
});

// ---------- plans, the subscription split ----------
await step('Lite cannot sell a subscription', joose, async () => {
  await joose.goto(BASE + '/me');
  await joose.locator('.subscription .pro-only').waitFor(timeout);
  if (!(await joose.locator('.subscription input.price').isDisabled())) throw new Error('the price can be set on Lite');
});
await step('two storage spaces show, video and text and pictures', joose, async () => {
  await joose.locator('.plan-card .storage.video').waitFor(timeout);
  await joose.locator('.plan-card .storage.media', { hasText: 'Teksti ja kuvat' }).waitFor(timeout);
});
await step('going Unlimited opens the archive and the subscription; the split shows', joose, async () => {
  await joose.getByRole('button', { name: /Unlimited, 9,99/ }).click();
  await joose.locator('.plan-card .consent', { hasText: 'palvelu alkaa heti' }).locator('input').check();
  await joose.getByRole('button', { name: 'Vahvista ja jatka' }).click();
  await joose.locator('.plan-name', { hasText: 'Unlimited' }).waitFor(timeout);
  await joose.getByRole('button', { name: 'Arkisto' }).waitFor(timeout);
  await joose.locator('.subscription input.price').fill('4,99');
  await joose.locator('.split', { hasText: '3,58' }).waitFor(timeout);
});
await step('going Exclusive: no subscription, and a blog sold by itself for at most 5 €', joose, async () => {
  await joose.getByRole('button', { name: /Exclusive, 20,00/ }).click();
  await joose.locator('.plan-card .consent input').check();
  await joose.getByRole('button', { name: 'Vahvista ja jatka' }).click();
  await joose.locator('.plan-name', { hasText: 'Exclusive' }).waitFor(timeout);
  await joose.locator('.subscription .pro-only', { hasText: 'Exclusivessä' }).waitFor(timeout);
  await joose.goto(BASE + '/write');
  await joose.locator('#title').fill('Myytävä juttu');
  await joose.locator('#body').fill('Alku kaikille.\n\nLoppu ostajille.');
  await joose.locator('.cover-pick input[type=file]').setInputFiles(seed('kahvi.jpg'));
  await joose.locator('.seg button', { hasText: 'Julkinen' }).click();
  await joose.locator('.public-options .check', { hasText: 'lukija ostaa' }).locator('input').check();
  await joose.locator('.public-options .rule input').check();
  await joose.locator('#post-price').fill('5,50');
  await joose.locator('.post-price .error').waitFor(timeout);
  if (await joose.getByRole('button', { name: 'Julkaise' }).isEnabled()) throw new Error('Publish is enabled at 5,50 €');
  await joose.locator('#post-price').fill('4,50');
  await joose.locator('.buyers-life').waitFor(timeout);
  await joose.locator('.post-price .split').waitFor(timeout);
  await joose.getByRole('button', { name: 'Julkaise' }).click();
  await joose.locator('.post h1', { hasText: 'Myytävä juttu' }).waitFor(timeout);
  await joose.goto(BASE + '/me');
});
await step('My place lists the purchases, and the withdrawal lists the monthly contracts of 14 days', joose, async () => {
  await joose.locator('.purchases .purchase-list li', { hasText: 'Exclusive-tilaus' }).waitFor(timeout);
  await joose.getByRole('button', { name: 'Peruuta sopimus' }).click();
  await joose.locator('.withdraw .withdraw-row', { hasText: 'Exclusive-tilaus' }).waitFor(timeout);
  await joose.locator('.withdraw .hint', { hasText: 'Yksittäin ostettuja juttuja ei voi peruuttaa' }).waitFor(timeout);
});
await step('a profile picture is set and shows', joose, async () => {
  await joose.locator('.avatar-edit input[type=file]').setInputFiles(seed('kahvi.jpg'));
  await joose.locator('.avatar-edit .avatar img').waitFor(timeout);
});

// ---------- language and signing out ----------
await step('the language turns English in My place', joose, async () => {
  await joose.locator('.place-lang').getByRole('button', { name: 'English' }).click();
  await joose.getByRole('heading', { name: 'My place' }).waitFor(timeout);
  await joose.locator('.place-lang').getByRole('button', { name: 'Suomi' }).click();
});
await step('signing out goes back to the landing page, and the session is gone', joose, async () => {
  await joose.getByRole('button', { name: 'Kirjaudu ulos' }).click();
  await joose.getByText('Some ystävillesi, ei yleisölle.').waitFor(timeout);
  const status = await joose.evaluate(() => fetch('/api/me').then((r) => r.status));
  if (status !== 401) throw new Error(`/api/me after signing out: ${status}`);
  await joose.reload();
  await joose.getByText('Some ystävillesi, ei yleisölle.').waitFor(timeout);
});

// ---------- someone new ----------
const veera = await person();
await step('a new person signs up (a username checked live, the terms accepted) and is asked once what she likes to read', veera, async () => {
  await veera.goto(BASE);
  await veera.getByRole('button', { name: 'Aloita ilmaiseksi' }).first().click();
  await veera.locator('#auth-name').fill('Veera');
  // the username follows the name until it is typed in
  if ((await veera.locator('#auth-username').inputValue()) !== 'veera') throw new Error('no username suggested from the name');
  await veera.locator('#auth-username').fill('mira');
  await veera.locator('.username-no .error', { hasText: 'Tämä käyttäjänimi on jo varattu' }).waitFor(timeout);
  await veera.locator('.username-no .chip', { hasText: 'Käytä @mira2' }).waitFor(timeout);
  await veera.locator('#auth-username').fill('veera');
  await veera.locator('.username-ok').waitFor(timeout);
  await veera.locator('#auth-email').fill('veera@example.com');
  await veera.locator('#auth-password').fill('a-long-password');
  if (await veera.getByRole('button', { name: 'Luo tili', exact: true }).isEnabled()) throw new Error('sign-up is enabled without the terms');
  await veera.locator('#auth-terms').check();
  await veera.getByRole('button', { name: 'Luo tili', exact: true }).click();
  await veera.locator('.welcome h1', { hasText: 'Mistä haluat lukea?' }).waitFor(timeout);
});
await step('she picks food and a word of her own, saves, and lands on the friends page', veera, async () => {
  await veera.locator('.welcome .topic-chips .chip', { hasText: 'ruoka' }).click();
  await veera.locator('#interest-word').fill('Hapanjuuri');
  await veera.locator('.welcome').getByRole('button', { name: 'Lisää', exact: true }).click();
  await veera.locator('.interest-words .chip', { hasText: 'hapanjuuri' }).waitFor(timeout);
  await veera.getByRole('button', { name: 'Tallenna ja jatka' }).click();
  await veera.locator('.home-switch a.on', { hasText: 'Kaverit' }).waitFor(timeout);
  await veera.reload();
  await veera.locator('.home-switch').waitFor(timeout);
});
await step('For You shows why a post is there: “Sinulle, koska: 🍳 ruoka”', veera, async () => {
  await veera.goto(BASE + '/fyp');
  await veera.locator('.card', { hasText: 'Leipäjuuri' }).locator('.because', { hasText: 'Sinulle, koska:' }).filter({ hasText: 'ruoka' }).waitFor(timeout);
  // her food posts come first
  await veera.locator('.feed .card').first().locator('.because', { hasText: 'ruoka' }).waitFor(timeout);
});
await step('her interests are in My place, to change', veera, async () => {
  await veera.goto(BASE + '/me');
  await veera.locator('.interests-card .topic-chips .chip.on', { hasText: 'ruoka' }).waitFor(timeout);
  await veera.locator('.interests-card .interest-words .chip', { hasText: 'hapanjuuri' }).waitFor(timeout);
});
await step('search by a topic chip: food gives its public posts and Eeva, who writes about it', veera, async () => {
  await veera.goto(BASE + '/search');
  await veera.locator('.search .topic-chips .chip', { hasText: 'ruoka' }).click();
  await veera.locator('.topic-results .card', { hasText: 'Leipäjuuri' }).waitFor(timeout);
  await veera.locator('.topic-results .topic-writers li', { hasText: 'Eeva' }).waitFor(timeout);
  // and typing a topic's word finds it too
  await veera.locator('.search .topic-chips .chip', { hasText: 'ruoka' }).click();
  await veera.locator('.search-input').fill('metsässä');
  await veera.locator('.topic-results h3', { hasText: 'luonto' }).waitFor(timeout);
});
await step('she changes her username in My place; the header shows the new one', veera, async () => {
  await veera.goto(BASE + '/me');
  await veera.locator('.place-who', { hasText: '@veera' }).waitFor(timeout);
  await veera.locator('#username-change').fill('veera.k');
  await veera.locator('.username-card .username-ok').waitFor(timeout);
  await veera.locator('.username-card').getByRole('button', { name: 'Tallenna' }).click();
  await veera.locator('.place-who', { hasText: '@veera.k' }).waitFor(timeout);
});
await step('she adds a friend by @username', veera, async () => {
  await veera.goto(BASE + '/friends');
  await veera.locator('#friend-username').fill('@aino');
  await veera.getByRole('button', { name: 'Lisää', exact: true }).click();
  await veera.locator('.friend-list li', { hasText: '@aino' }).waitFor(timeout);
});

// ---------- email: confirming an address, a forgotten password ----------
await step('Veera is asked to confirm her email: the banner, and “Lähetä uudelleen” sends the link again', veera, async () => {
  await veera.goto(BASE + '/');
  await veera.locator('.verify-banner', { hasText: 'Vahvista sähköpostiosoitteesi' }).waitFor(timeout);
  await veera.locator('.verify-banner', { hasText: 'veera@example.com' }).waitFor(timeout);
  await veera.locator('.verify-banner').getByRole('button', { name: 'Lähetä uudelleen' }).click();
  await veera.locator('.verify-banner .verify-said', { hasText: 'Lähetetty' }).waitFor(timeout);
});
await step('she opens the link from her email: confirmed, the token out of the address bar, and the banner gone', veera, async () => {
  const token = await lastToken(BASE, 'veera@example.com', 'verify');
  if (!token) throw new Error('no verification link in the outbox');
  await veera.goto(`${BASE}/verify?token=${token}`);
  await veera.locator('.verified', { hasText: 'Sähköpostiosoitteesi on vahvistettu' }).waitFor(timeout);
  if (veera.url().includes('token=')) throw new Error(`the token stayed in the address: ${veera.url()}`);
  await veera.getByRole('link', { name: 'Jatka Dear to Me:hen' }).click();
  await veera.locator('.home-switch').waitFor(timeout);
  if (await veera.locator('.verify-banner').count()) throw new Error('the banner is still there');
  await veera.goto(BASE + '/me');
  await veera.locator('.email-card .email-now', { hasText: 'vahvistettu' }).waitFor(timeout);
});

const mikko = await person({ expect: [400] });
await step('Mikko forgot his password: “Unohditko salasanan?” on the sign-in form, his email, and the answer that tells nothing', mikko, async () => {
  await mikko.goto(BASE + '/login');
  await mikko.getByRole('link', { name: 'Unohditko salasanan?' }).click();
  await mikko.locator('#forgot-email').fill('mikko@demo.d2m');
  await mikko.getByRole('button', { name: 'Lähetä linkki' }).click();
  await mikko.locator('.forgot-sent', { hasText: 'Jos osoitteella mikko@demo.d2m on tili' }).waitFor(timeout);
});
await step('the link from his email sets a new password and signs him in; the old password no longer works', mikko, async () => {
  const token = await lastToken(BASE, 'mikko@demo.d2m', 'reset');
  if (!token) throw new Error('no reset link in the outbox');
  await mikko.goto(`${BASE}/reset?token=${token}`);
  await mikko.locator('#reset-password').fill('mikon-uusi-salasana');
  await mikko.getByRole('button', { name: 'Aseta salasana' }).click();
  await mikko.locator('.home-switch').waitFor(timeout);
  await mikko.locator('header.top nav').waitFor(timeout);
  const old = await mikko.evaluate(() => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email: 'mikko@demo.d2m', password: 'dear-to-me-demo' }) }).then((r) => r.status));
  if (old !== 401) throw new Error(`the old password: ${old}`);
});
await step('the same link again is told to be no longer valid, with a way to ask for a new one', mikko, async () => {
  const token = await lastToken(BASE, 'mikko@demo.d2m', 'reset');
  await mikko.goto(`${BASE}/reset?token=${token}`);
  await mikko.locator('#reset-password').fill('mikon-kolmas-salasana');
  await mikko.getByRole('button', { name: 'Aseta salasana' }).click();
  await mikko.locator('.error', { hasText: 'Linkki ei ole enää voimassa' }).waitFor(timeout);
  await mikko.getByRole('link', { name: 'Pyydä uusi linkki' }).waitFor(timeout);
});

// ---------- a closed beta: the banner, and sign-up with an invite code (a server of its own) ----------
const beta = spawn('npx tsx server/index.ts', { env: { ...process.env, D2M_MEDIA: 'disk', D2M_PAY: 'off', D2M_DATA: path.join(tmp, 'beta-data'), PORT: String(BETA_PORT), D2M_DEMO: '1', D2M_BETA: '1', D2M_INVITE_CODES: 'KEVAT-2026' }, shell: true, stdio: 'ignore' });
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 250));
  if (await fetch(BETA + '/api/config').then((r) => r.ok, () => false)) break;
}
const tester = await person({ expect: [403] });
await step('a beta: a slim banner on the landing page (payments off) and “Beta” beside the brand', tester, async () => {
  await tester.goto(BETA);
  await tester.locator('.beta-banner', { hasText: 'Beta: Dear to Me on testikäytössä. Maksut eivät ole käytössä.' }).waitFor(timeout);
  await tester.locator('.landing-top .brand .beta-tag', { hasText: 'Beta' }).waitFor(timeout);
});
await step('sign-up asks for the invite code: a wrong one is refused, the right one lets her in, and the banner stays', tester, async () => {
  await tester.getByRole('button', { name: 'Aloita ilmaiseksi' }).first().click();
  await tester.locator('#auth-name').fill('Testaaja');
  await tester.locator('#auth-email').fill('testaaja@example.com');
  await tester.locator('#auth-password').fill('a-long-password');
  await tester.locator('#auth-terms').check();
  await tester.locator('#auth-invite').fill('VÄÄRÄ');
  await tester.getByRole('button', { name: 'Luo tili', exact: true }).click();
  await tester.locator('.auth-form .error', { hasText: 'Tarkista kutsukoodi.' }).waitFor(timeout);
  await tester.locator('#auth-invite').fill('kevat-2026');
  await tester.getByRole('button', { name: 'Luo tili', exact: true }).click();
  await tester.locator('.welcome h1', { hasText: 'Mistä haluat lukea?' }).waitFor(timeout);
  await tester.locator('.beta-banner', { hasText: 'Maksut eivät ole käytössä' }).waitFor(timeout);
  await tester.locator('.verify-banner', { hasText: 'Vahvista sähköpostiosoitteesi' }).waitFor(timeout);
});

// ---------- deleting an account ----------
const ville = await person();
await step('someone new skips the interests (never asked again), then deletes their account: the password, a second yes, and back to the landing page', ville, async () => {
  await ville.goto(BASE);
  await ville.getByRole('button', { name: 'Aloita ilmaiseksi' }).first().click();
  await ville.locator('#auth-name').fill('Ville');
  await ville.locator('#auth-email').fill('ville@example.com');
  await ville.locator('#auth-password').fill('a-long-password');
  await ville.locator('#auth-terms').check();
  await ville.getByRole('button', { name: 'Luo tili', exact: true }).click();
  // he skips the interests: never asked again
  await ville.getByRole('button', { name: 'Ohita' }).click();
  await ville.locator('.home-switch').waitFor(timeout);
  await ville.goto(BASE + '/welcome');
  await ville.locator('.home-switch a.on', { hasText: 'Kaverit' }).waitFor(timeout);
  await ville.goto(BASE + '/me');
  await ville.locator('#delete-password').fill('a-long-password');
  await ville.locator('.delete-account').getByRole('button', { name: 'Poista tili' }).click();
  await ville.locator('.delete-account').getByRole('button', { name: 'Poista lopullisesti' }).click();
  await ville.getByText('Some ystävillesi, ei yleisölle.').waitFor(timeout);
  const again = await ville.evaluate(() => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-d2m': '1' }, body: JSON.stringify({ email: 'ville@example.com', password: 'a-long-password' }) }).then((r) => r.status));
  if (again !== 401) throw new Error(`signing in after deleting: ${again}`);
});

// ---------- moderation: @joose moderates the demo ----------
const moderator = await person();
const outboxOf = (to) => fetch(`${BASE}/api/dev/outbox?to=${encodeURIComponent(to)}`).then((r) => r.json());
let complaintUrl = '';
await step('Leo’s post is reported three times by others; Joose opens Moderation from My place and sees it with its reasons', moderator, async () => {
  const leo = await cookieFor('leo');
  const f = new FormData();
  f.set('kind', 'blog'); f.set('title', 'Moderoitava juttu'); f.set('body', 'Tämä juttu ilmoitetaan.'); f.set('audience', 'public'); f.set('confirm', '1');
  f.set('image', new Blob([fs.readFileSync(seed('metsa.jpg'))], { type: 'image/jpeg' }), 'metsa.jpg');
  const posted = await fetch(BASE + '/api/posts', { method: 'POST', headers: { cookie: leo, 'x-d2m': '1' }, body: f }).then((r) => r.json());
  for (const name of ['aino', 'eeva', 'sara']) await fetch(BASE + `/api/posts/${posted.id}/report`, { method: 'POST', headers: { cookie: await cookieFor(name), 'x-d2m': '1', 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'sexual' }) });
  await moderator.goto(BASE + '/login');
  await signIn(moderator, 'joose@demo.d2m');
  await moderator.locator('header.top nav').waitFor(timeout);
  await moderator.goto(BASE + '/me');
  await moderator.locator('.place-links a.mod-link', { hasText: 'Moderointi' }).click();
  await moderator.locator('.mod h1', { hasText: 'Moderointi' }).waitFor(timeout);
  const item = moderator.locator('.mod-item', { hasText: 'Moderoitava juttu' });
  await item.locator('.mod-reports .tag', { hasText: 'seksuaalista sisältöä 3' }).waitFor(timeout);
  await item.locator('.mod-content', { hasText: 'Tämä juttu ilmoitetaan.' }).waitFor(timeout);
});
await step('he removes it: the rule, a ready reason, confirmed; Leo gets the statement of reasons with a link to complain', moderator, async () => {
  const item = moderator.locator('.mod-item', { hasText: 'Moderoitava juttu' });
  await item.getByRole('button', { name: 'Poista', exact: true }).click();
  if (await item.getByRole('button', { name: 'Vahvista: Poista' }).isEnabled()) throw new Error('remove is enabled without a rule and a reason');
  await item.locator('.decide-rule').selectOption('sexual');
  await item.locator('.chip.preset').first().click();
  await item.getByRole('button', { name: 'Vahvista: Poista' }).click();
  await moderator.locator('.mod-said', { hasText: 'Päätös tehty' }).waitFor(timeout);
  if (await moderator.locator('.mod-item', { hasText: 'Moderoitava juttu' }).count()) throw new Error('the post is still in the queue');
  const mail = (await outboxOf('leo@demo.d2m')).find((m) => m.subject.includes('perustelut'));
  if (!mail || !mail.text.includes('seksuaalinen sisältö') || !mail.text.includes('Päätöksen teki ihminen')) throw new Error('no statement of reasons in Leo’s outbox');
  const link = new URL(mail.text.match(/https?:\/\/\S+\/complaint\/\S+/)[0]);
  complaintUrl = link.pathname + link.search;
});
const leoBrowser = await person();
await step('Leo opens the link from his email (not signed in), sees the decision, and complains', leoBrowser, async () => {
  await leoBrowser.goto(BASE + complaintUrl);
  await leoBrowser.locator('.statement-what', { hasText: 'Moderoitava juttu' }).waitFor(timeout);
  if (leoBrowser.url().includes('token=')) throw new Error('the token stayed in the address');
  await leoBrowser.locator('#complaint-text').fill('Juttu ei ollut seksuaalinen, se oli metsäkävelystä.');
  await leoBrowser.getByRole('button', { name: 'Lähetä valitus' }).click();
  await leoBrowser.locator('.complaint-status', { hasText: 'Valituksesi on vastaanotettu' }).waitFor(timeout);
});
await step('Joose finds the complaint in the queue and reverses the decision; Leo is told', moderator, async () => {
  await moderator.reload();
  const c = moderator.locator('.mod-complaints .mod-item', { hasText: 'metsäkävelystä' });
  await c.getByRole('button', { name: 'Peru päätös' }).click();
  await c.locator('.chip.preset').first().click();
  await c.getByRole('button', { name: 'Vahvista: Peru päätös' }).click();
  await moderator.locator('.mod-said', { hasText: 'Päätös tehty' }).waitFor(timeout);
  if (!(await outboxOf('leo@demo.d2m')).some((m) => m.subject.includes('Valituksesi') && m.text.includes('Päätös on peruttu'))) throw new Error('Leo was not told');
});
await step('Joose suspends @sara with a reason; she is listed as suspended, and the log has it', moderator, async () => {
  await moderator.locator('.mod-tabs').getByRole('button', { name: 'Ihmiset' }).click();
  await moderator.locator('#suspend-username').fill('@sara');
  const form = moderator.locator('.mod-suspend');
  await form.getByRole('button', { name: 'Jäädytä', exact: true }).click();
  await form.locator('.decide-rule').selectOption('harassment');
  await form.locator('.decide-reason').fill('Toistuvaa häirintää varoituksista huolimatta.');
  await form.getByRole('button', { name: 'Vahvista: Jäädytä' }).click();
  await moderator.locator('.mod-said', { hasText: 'Päätös tehty' }).waitFor(timeout);
  await moderator.locator('.mod-suspended .mod-item', { hasText: '@sara' }).waitFor(timeout);
  await moderator.locator('.mod-tabs').getByRole('button', { name: 'Loki' }).click();
  await moderator.locator('.mod-log li', { hasText: '@sara' }).first().waitFor(timeout);
});
const suspendedSara = await person({ expect: [403] });
await step('Sara cannot sign in: she is told her account is suspended, why, and how to complain', suspendedSara, async () => {
  await suspendedSara.goto(BASE + '/login');
  await signIn(suspendedSara, 'sara@demo.d2m');
  await suspendedSara.locator('.suspended-notice', { hasText: 'Tilisi on jäädytetty toistaiseksi' }).waitFor(timeout);
  await suspendedSara.locator('.suspended-notice', { hasText: 'Toistuvaa häirintää' }).waitFor(timeout);
  await suspendedSara.locator('.suspended-notice a', { hasText: 'Valita päätöksestä' }).waitFor(timeout);
  if (await suspendedSara.locator('header.top nav').count()) throw new Error('she got in');
});
await step('the content rules link the notice form, which takes a notice from anyone', visitor, async () => {
  await visitor.goto(BASE + '/rules');
  await visitor.locator('.legal a[href="/report-content"]').first().click();
  await visitor.locator('#notice-email').fill('ulkopuolinen@example.com');
  await visitor.locator('#notice-url').fill('https://example.com/jotain');
  await visitor.locator('#notice-reason').selectOption('illegal');
  await visitor.locator('#notice-explanation').fill('Laitonta sisältöä, joka loukkaa tekijänoikeutta.');
  if (await visitor.getByRole('button', { name: 'Lähetä ilmoitus' }).isEnabled()) throw new Error('the notice can be sent without the statement of good faith');
  await visitor.locator('#notice-good-faith').check();
  await visitor.getByRole('button', { name: 'Lähetä ilmoitus' }).click();
  await visitor.locator('.notice-sent', { hasText: 'Ilmoituksesi on vastaanotettu' }).waitFor(timeout);
});

// ---------- phones ----------
await step('on a phone the tab bar is there and For You is one tap away', aino, async () => {
  await aino.setViewportSize({ width: 390, height: 844 });
  await aino.goto(BASE + '/');
  await aino.locator('.tabbar').waitFor(timeout);
  await aino.locator('.home-switch a', { hasText: 'Sinulle' }).click();
  await aino.locator('.home-switch a.on', { hasText: 'Sinulle' }).waitFor(timeout);
  // five tabs: home, groups, write, letters, me; the magnifier stays in the top bar
  if ((await aino.locator('.tabbar a').count()) !== 5) throw new Error('not five tabs');
  await aino.locator('.tabbar a.tab-groups', { hasText: 'Ryhmät' }).click();
  await aino.locator('.groups h1', { hasText: 'Ryhmät' }).waitFor(timeout);
  await aino.locator('header.top nav a.nav-search').click();
  await aino.locator('.search .search-input').waitFor(timeout);
});

if (errors.length) {
  failed++;
  console.log(`FAIL no errors in the browser\n     ${[...new Set(errors)].slice(0, 5).join('\n     ')}`);
} else console.log('ok   no errors in the browser');

await browser.close();
spawn('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
spawn('taskkill', ['/pid', String(beta.pid), '/t', '/f'], { stdio: 'ignore' });
console.log(failed ? `${failed} FAILED (screenshots in ${shots})` : 'all good');
if (!failed) setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 500);
process.exitCode = failed ? 1 : 0;
