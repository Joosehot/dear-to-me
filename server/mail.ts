// Sending email: the verification of an address, a password reset, the notice of an email change, and
// moderation's messages (a statement of reasons, a report or a complaint decided, a notice received).
//
// The provider is Cloudflare Email Service (Email Sending), over its REST API with fetch:
//   POST {CLOUDFLARE_API_BASE_URL}/accounts/{CLOUDFLARE_ACCOUNT_ID}/email/sending/send
//   Authorization: Bearer {CLOUDFLARE_EMAIL_TOKEN} (an API token with the Email Sending: Edit permission)
//   { to, from: { address, name }, subject, text, html, reply_to? }
// The base URL is https://api.cloudflare.com/client/v4; it can be changed only so the checks can point
// it at a fake server of their own.
//
// Without a provider (MAIL_PROVIDER=log, or no Cloudflare settings) a message is not sent: the server
// log gets it (in development the whole text with its link; in production only to whom and what, so a
// log never holds a link that signs someone in), and it is kept in an in-memory outbox. In development
// and the checks (D2M_DEMO=1, or D2M_MAIL=log) GET /api/dev/outbox reads that outbox; with
// NODE_ENV=production the server refuses to start with D2M_MAIL=log, and the endpoint is never there.
//
// Every message is in Finnish first and English below it, as plain text and as simple HTML, with
// everything put into it escaped.

import fs from 'node:fs';
import path from 'node:path';
import { RULE_TEXT, factsText, type Decision, type PostAction } from '../shared/moderation.js';

const root = path.resolve(import.meta.dirname, '..');
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const env = process.env;
const production = env.NODE_ENV === 'production';
const account = env.CLOUDFLARE_ACCOUNT_ID ?? '';
const token = env.CLOUDFLARE_EMAIL_TOKEN ?? '';
const base = (env.CLOUDFLARE_API_BASE_URL || 'https://api.cloudflare.com/client/v4').replace(/\/+$/, '');

/** D2M_MAIL=log: the dev outbox on (and nothing sent, whatever else is set). */
export const logOnly = env.D2M_MAIL === 'log';
/** D2M_MAIL=console: a demo on one's own machine. Nothing is sent and there is no outbox on the web; the
 * whole message, links too, goes to the server's own window only, and new accounts count as verified
 * (no email could reach them). Allowed in production: the window is the owner's, not the web's. */
export const consoleOnly = env.D2M_MAIL === 'console';
/** 'cloudflare' when asked for (MAIL_PROVIDER=cloudflare) or when its settings are there; otherwise 'log'. */
export const provider: 'cloudflare' | 'log' = logOnly || consoleOnly || env.MAIL_PROVIDER === 'log' ? 'log' : env.MAIL_PROVIDER === 'cloudflare' || (account && token) ? 'cloudflare' : 'log';
/** What is wrong with the settings, if anything (the server refuses to start with it). */
export const problem =
  env.MAIL_PROVIDER && !['cloudflare', 'log'].includes(env.MAIL_PROVIDER)
    ? `MAIL_PROVIDER=${env.MAIL_PROVIDER} is not known (cloudflare or log)`
    : provider === 'cloudflare' && (!account || !token || !env.MAIL_FROM)
      ? 'MAIL_PROVIDER=cloudflare needs CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_TOKEN and MAIL_FROM'
      : undefined;

/** The sender: "Dear to Me <noreply@deartome.fi>", or a bare address. */
const from = parseAddress(env.MAIL_FROM || 'Dear to Me <noreply@localhost>');
const replyTo = env.MAIL_REPLY_TO || undefined;

/** "Name <address>" as Cloudflare's REST API takes it ({ address, name }); a bare address as it is. */
export function parseAddress(s: string): string | { address: string; name: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(s);
  if (m && m[1]) return { address: m[2], name: m[1] };
  return m ? m[2] : s.trim();
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** The outbox (log mode only): the newest last, at most OUTBOX_MAX. */
const OUTBOX_MAX = 200;
const sent: (Mail & { at: number })[] = [];

/** The outbox, or one address's part of it (development and the checks). */
export const outbox = (to?: string) => (to ? sent.filter((m) => m.to === to.trim().toLowerCase()) : sent);

/** Send a message. Never throws: a failure is logged and answered false (the caller's answer does not
 * change with it, so nothing is told about an account by whether mail went out). */
export async function send(mail: Mail): Promise<boolean> {
  const m = { ...mail, to: mail.to.trim().toLowerCase() };
  if (consoleOnly) {
    console.log(`
----- mail (not sent: D2M_MAIL=console) to ${m.to}: ${m.subject}
${m.text}
-----
`);
    return true;
  }
  if (provider === 'log') {
    sent.push({ ...m, at: Date.now() });
    if (sent.length > OUTBOX_MAX) sent.splice(0, sent.length - OUTBOX_MAX);
    if (production) console.log(`mail (not sent, no provider): to ${m.to}: ${m.subject}`);
    else console.log(`mail (not sent, no provider) to ${m.to}: ${m.subject}\n${m.text}\n`);
    return true;
  }
  try {
    const res = await fetch(`${base}/accounts/${encodeURIComponent(account)}/email/sending/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ to: m.to, from, subject: m.subject, text: m.text, html: m.html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean; errors?: { code: number; message: string }[]; result?: { permanent_bounces?: string[] } } | null;
    if (!res.ok || !body?.success) {
      const why = body?.errors?.map((e) => `${e.code} ${e.message}`).join('; ') || res.statusText;
      console.error(`mail: Cloudflare refused the message to ${m.to} (${res.status}): ${why}`);
      return false;
    }
    if (body.result?.permanent_bounces?.length) console.warn(`mail: ${m.to} bounced permanently (${m.subject})`);
    return true;
  } catch (e) {
    console.error(`mail: could not reach Cloudflare for ${m.to}: ${(e as Error).message}`);
    return false;
  }
}

// ---------------- the messages ----------------

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** One message from its two languages: each a list of paragraphs, and an optional link with its label. */
function compose(subject: string, fi: string[], en: string[], link?: { url: string; fi: string; en: string }): Omit<Mail, 'to'> {
  const textPart = (paras: string[], label?: string) => [...paras, ...(link ? [`${label}:\n${link.url}`] : [])].join('\n\n');
  const htmlPart = (lang: string, paras: string[], label?: string) =>
    `<div lang="${lang}">${paras.map((p) => `<p>${escape(p)}</p>`).join('')}${link ? `<p><a href="${escape(link.url)}">${escape(label!)}</a><br><span style="color:#666;font-size:13px">${escape(link.url)}</span></p>` : ''}</div>`;
  const text = `${textPart(fi, link?.fi)}\n\n----\n\n${textPart(en, link?.en)}\n\n-- \nDear to Me\n`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#222;max-width:560px">${htmlPart('fi', fi, link?.fi)}<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">${htmlPart('en', en, link?.en)}<p style="color:#666;font-size:13px">Dear to Me</p></body></html>`;
  return { subject, text, html };
}

/** The link that confirms an address: after sign-up, or the new address of an email change. */
export const verifyMessage = (url: string, change: boolean) =>
  compose(
    change ? 'Vahvista uusi sähköpostiosoitteesi / Confirm your new email address' : 'Vahvista sähköpostiosoitteesi / Confirm your email address',
    [change ? 'Hei! Pyysit Dear to Me -tilisi sähköpostiosoitteen vaihtamista tähän osoitteeseen. Vaihto tehdään, kun vahvistat sen alla olevasta linkistä.' : 'Hei ja tervetuloa Dear to Me -palveluun! Vahvista sähköpostiosoitteesi alla olevasta linkistä.', 'Linkki on voimassa 24 tuntia. Jos et pyytänyt tätä, voit jättää viestin huomiotta.'],
    [change ? 'Hi! You asked to change the email address of your Dear to Me account to this one. It changes once you confirm it with the link below.' : 'Hi, and welcome to Dear to Me! Please confirm your email address with the link below.', 'The link works for 24 hours. If you did not ask for this, you can ignore this message.'],
    { url, fi: 'Vahvista sähköpostiosoite', en: 'Confirm the email address' },
  );

/** The link that sets a new password. */
export const resetMessage = (url: string) =>
  compose(
    'Uusi salasana / Reset your password',
    ['Hei! Joku (toivottavasti sinä) pyysi uutta salasanaa Dear to Me -tilillesi. Aseta uusi salasana alla olevasta linkistä. Linkki on voimassa tunnin ja toimii kerran.', 'Jos et pyytänyt tätä, voit jättää viestin huomiotta: salasanasi pysyy ennallaan.'],
    ['Hi! Someone (hopefully you) asked for a new password for your Dear to Me account. Set a new password with the link below. The link works for one hour, and once.', 'If you did not ask for this, you can ignore this message: your password stays as it is.'],
    { url, fi: 'Aseta uusi salasana', en: 'Set a new password' },
  );

/** To the old address: a change to another address was asked for. */
export const changeNoticeMessage = (newAddress: string) =>
  compose(
    'Sähköpostiosoitteen vaihto / Email address change',
    [`Hei! Dear to Me -tilisi sähköpostiosoitteeksi pyydettiin vaihtoa: ${newAddress}. Osoite vaihtuu, kun uusi osoite vahvistetaan.`, 'Jos et pyytänyt tätä, vaihda salasanasi heti kirjautumissivun linkistä "Unohditko salasanan?" (se peruu myös vaihdon) ja ota yhteyttä meihin.'],
    [`Hi! A change of your Dear to Me account's email address was asked for: ${newAddress}. It changes once the new address is confirmed.`, 'If you did not ask for this, change your password at once with "Forgot your password?" on the sign-in page (that also cancels the change), and contact us.'],
  );

// ---------------- moderation ----------------

const dateIn = (ms: number, lang: 'fi' | 'en') => new Date(ms).toLocaleDateString(lang === 'fi' ? 'fi-FI' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Helsinki' });

/** What a decision did, as its statement says it (the person it is about reads it). */
function decided(d: Decision, lang: 'fi' | 'en') {
  const fi = lang === 'fi';
  const title = d.postTitle ?? '';
  if (d.action === 'remove') return fi ? `Juttusi "${title}" on poistettu palvelusta. Sen teksti, kuvat ja video, keskustelu ja BoVNotet on poistettu.` : `Your post "${title}" has been removed from the service. Its text, pictures and video, its conversation and BoVNotes have been deleted.`;
  if (d.action === 'restrict') return fi ? `Juttusi "${title}" on rajoitettu: vain sinä näet sen. Se ei näy muille, Sinulle-sivulla eikä julkisilla sivuilla, kunnes moderaattori poistaa rajoituksen.` : `Your post "${title}" has been restricted: only you see it. It is not shown to others, on For You or on the public pages, until a moderator lifts the restriction.`;
  const until = d.until ? (fi ? `${dateIn(d.until, 'fi')} asti` : `until ${dateIn(d.until, 'en')}`) : fi ? 'toistaiseksi' : 'until further notice';
  return fi
    ? `Tilisi on jäädytetty ${until}. Et voi kirjautua sisään, eikä profiiliasi tai juttujasi näytetä muille sinä aikana; mitään ei poisteta. Lukijoidesi kuukausitilaukset sinulle on lopetettu, eikä niitä veloiteta enää. Omat kuukausimaksusi (tilaus, lisätallennustila ja tilauksesi muille kirjoittajille) eivät uusiudu: maksettu kausi on käytössäsi loppuun.`
    : `Your account has been suspended ${until}. You cannot sign in, and your profile and posts are not shown to others meanwhile; nothing is deleted. Your readers' monthly subscriptions to you have been ended and are no longer charged. Your own monthly payments (your plan, storage packs and your subscriptions to other writers) do not renew: what you paid for runs to its end.`;
}

/** A statement of reasons (DSA art. 17) to the person a restricting decision is about: what was decided,
 * on which rule, on what facts, by whom (a person), and how to complain (a link that works once, signed in or not). */
export function statementMessage(d: Decision, origin: string, complaintUrl: string, deadline: number) {
  const rule = (lang: 'fi' | 'en') => (d.rule ? RULE_TEXT[lang][d.rule] : '');
  return compose(
    d.action === 'suspend' ? 'Tilisi on jäädytetty: päätöksen perustelut / Your account is suspended: statement of reasons' : 'Juttuasi koskeva päätös: perustelut / A decision on your post: statement of reasons',
    [
      'Hei! Dear to Me -palvelun moderaattori teki sinua koskevan päätöksen. Tämä viesti kertoo päätöksen ja sen perusteet.',
      `Päätös: ${decided(d, 'fi')}`,
      `Rikottu sääntö: ${rule('fi')}. Sisältösäännöt: ${origin}/rules ja käyttöehdot: ${origin}/terms.`,
      `Perustelu: ${d.reason}`,
      `Tosiasiat: ${factsText(d.facts, 'fi')}`,
      'Päätöksen teki ihminen (moderaattori). Automaattisesti tapahtuu vain yksi asia: julkinen juttu poistuu Sinulle-sivulta, kun kolme eri käyttäjää on ilmoittanut siitä; jos niin kävi, se mainitaan yllä.',
      `Jos olet eri mieltä, voit valittaa päätöksestä ${dateIn(deadline, 'fi')} asti alla olevasta linkistä. Linkki toimii kerran, myös kirjautumatta. Valituksesi käsittelee ihminen, ja kerromme ratkaisusta sähköpostitse. Voit myös viedä asian digipalvelusäädöksen mukaiselle tuomioistuimen ulkopuoliselle riidanratkaisuelimelle tai tuomioistuimeen.`,
    ],
    [
      'Hi! A moderator of Dear to Me made a decision about you. This message tells you the decision and the reasons for it.',
      `Decision: ${decided(d, 'en')}`,
      `Rule broken: ${rule('en')}. The content rules: ${origin}/rules and the terms: ${origin}/terms.`,
      `Reason: ${d.reason}`,
      `Facts: ${factsText(d.facts, 'en')}`,
      'The decision was made by a person (a moderator). Only one thing happens automatically: a public post leaves For You once three different users have reported it; if that happened, it says so above.',
      `If you disagree, you can complain about the decision until ${dateIn(deadline, 'en')} with the link below. The link works once, also without signing in. A person handles your complaint, and we tell you the outcome by email. You can also take the matter to an out-of-court dispute settlement body under the Digital Services Act, or to a court.`,
    ],
    { url: complaintUrl, fi: 'Valita päätöksestä', en: 'Complain about the decision' },
  );
}

const OUTCOME_FI: Record<PostAction | 'closed', string> = {
  keep: 'juttu ei rikkonut sisältösääntöjä, joten se jätettiin palveluun',
  lift: 'juttu ei rikkonut sisältösääntöjä, joten se jätettiin palveluun',
  remove: 'juttu rikkoi sisältösääntöjä, ja se poistettiin',
  restrict: 'juttu rikkoi sisältösääntöjä, ja sitä rajoitettiin: nyt vain sen kirjoittaja näkee sen',
  closed: 'osoitteessa ei ole (enää) juttua, josta voisimme päättää',
};
const OUTCOME_EN: Record<PostAction | 'closed', string> = {
  keep: 'the post did not break the content rules, so it stays',
  lift: 'the post did not break the content rules, so it stays',
  remove: 'the post broke the content rules and has been removed',
  restrict: 'the post broke the content rules and has been restricted: now only its author sees it',
  closed: 'there is no post (any more) at the address for us to decide on',
};

/** To someone who reported a post (signed in) or sent a notice (the form): what was decided. The author is not named. */
export function reportDecidedMessage(action: PostAction | 'closed', what: string, origin: string, reason?: string) {
  return compose(
    'Ilmoituksesi on käsitelty / Your report has been handled',
    [`Kiitos ilmoituksestasi (${what}). Moderaattori käsitteli sen: ${OUTCOME_FI[action]}.`, ...(reason ? [`Moderaattorin perustelu: ${reason}`] : []), `Jos olet eri mieltä, voit pyytää päätöksen uudelleenarviointia kuuden kuukauden kuluessa kirjoittamalla meille (yhteystiedot: ${origin}/contact).`],
    [`Thank you for your report (${what}). A moderator handled it: ${OUTCOME_EN[action]}.`, ...(reason ? [`The moderator's reason: ${reason}`] : []), `If you disagree, you can ask us to review the decision within six months by writing to us (contact details: ${origin}/contact).`],
  );
}

/** To the sender of a notice (the form): it has been received. */
export const noticeReceivedMessage = (url: string) =>
  compose(
    'Ilmoituksesi on vastaanotettu / Your notice has been received',
    [`Kiitos. Saimme ilmoituksesi sisällöstä osoitteessa ${url}. Moderaattori käsittelee sen, ja kerromme päätöksestä tähän osoitteeseen.`],
    [`Thank you. We received your notice about the content at ${url}. A moderator handles it, and we will tell you the decision at this address.`],
  );

/** To a complainant: the outcome of their complaint. */
export function complaintOutcomeMessage(d: Decision, outcome: 'upheld' | 'reversed', answer: string) {
  const what = (lang: 'fi' | 'en') =>
    d.action === 'suspend' ? (lang === 'fi' ? 'tilisi jäädyttämisestä' : 'the suspension of your account') : lang === 'fi' ? `juttuasi "${d.postTitle ?? ''}" koskevasta päätöksestä` : `the decision on your post "${d.postTitle ?? ''}"`;
  const fi =
    outcome === 'upheld'
      ? 'Päätös pysyy voimassa.'
      : d.action === 'remove'
        ? 'Päätös on peruttu. Poistetun jutun sisältöä ei voi palauttaa, mutta voit julkaista sen uudelleen.'
        : d.action === 'restrict'
          ? 'Päätös on peruttu, ja juttusi näkyy taas niille, joille sen kirjoitit.'
          : 'Päätös on peruttu, ja voit taas kirjautua sisään.';
  const en =
    outcome === 'upheld'
      ? 'The decision stands.'
      : d.action === 'remove'
        ? 'The decision has been reversed. The removed post’s content cannot be brought back, but you may publish it again.'
        : d.action === 'restrict'
          ? 'The decision has been reversed, and your post shows again to those you wrote it for.'
          : 'The decision has been reversed, and you can sign in again.';
  return compose(
    'Valituksesi on käsitelty / Your complaint has been handled',
    [`Moderaattori käsitteli valituksesi ${what('fi')}. ${fi}`, `Perustelu: ${answer}`, 'Voit vielä viedä asian tuomioistuimen ulkopuoliselle riidanratkaisuelimelle tai tuomioistuimeen.'],
    [`A moderator handled your complaint about ${what('en')}. ${en}`, `Reason: ${answer}`, 'You can still take the matter to an out-of-court dispute settlement body or to a court.'],
  );
}

/** To someone whose suspension a moderator lifted. */
export const unsuspendedMessage = (reason: string) =>
  compose(
    'Tilisi jäädytys on päättynyt / Your account is no longer suspended',
    ['Moderaattori päätti tilisi jäädytyksen: voit taas kirjautua sisään, ja profiilisi ja juttusi näkyvät taas niille, joille ne on tarkoitettu.', `Perustelu: ${reason}`],
    ['A moderator ended the suspension of your account: you can sign in again, and your profile and posts show again to those they are for.', `Reason: ${reason}`],
  );
