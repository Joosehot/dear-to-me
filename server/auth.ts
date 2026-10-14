// Signing in: passwords, session cookies, and the brake on guessing.
//
// A password is kept as scrypt of it with a salt of its own, its parameters written beside it so
// they can be raised later without breaking the old ones. A session is a random token in an
// httpOnly cookie; the server keeps only the token's SHA-256, so a copy of the data signs no one in.

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type express from 'express';

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions) => Promise<Buffer>;

export const COOKIE = 'd2m_session';
export const SESSION_DAYS = 30;
export const MIN_PASSWORD = 10;
/** Longer than anyone types; scrypt is not asked to chew a megabyte. */
export const MAX_PASSWORD = 200;

// N = 2^15: about 32 MB and a few tens of milliseconds a try
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 32;
const options = (n: number, r: number, p: number) => ({ N: n, r, p, maxmem: 256 * n * r });

/** "scrypt$N$r$p$salt$key", the salt and key in base64. */
export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, options(N, R, P));
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/** The same, at once (the demo people's passwords, made on start). */
export function hashPasswordSync(password: string) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, KEYLEN, options(N, R, P));
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string) {
  const [kind, n, r, p, salt, key] = stored.split('$');
  if (kind !== 'scrypt' || !key) return false;
  const want = Buffer.from(key, 'base64');
  const got = await scrypt(password, Buffer.from(salt, 'base64'), want.length, options(+n, +r, +p)).catch(() => null);
  return !!got && crypto.timingSafeEqual(got, want);
}

// an unknown email costs the same time as a wrong password, so timing tells no one who has an account
const nobody = hashPasswordSync(crypto.randomBytes(16).toString('hex'));
export const wasteTime = (password: string) => verifyPassword(password, nobody).then(() => false);

export const normalEmail = (email: unknown) => String(email ?? '').trim().toLowerCase();
export const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// ---------------- sessions ----------------

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** The request's cookies, by name (no dependency for a few lines). */
export function cookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const name = part.slice(0, at).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      out[name] = part.slice(at + 1).trim();
    }
  }
  return out;
}

/** The session token a request carries, if any. */
export const sessionToken = (cookieHeader: string | undefined) => cookies(cookieHeader)[COOKIE] || undefined;

/** Https, also behind a proxy that says so. */
const https = (req: express.Request) => req.secure || String(req.header('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https';

export function setSessionCookie(req: express.Request, res: express.Response, token: string) {
  const flags = ['HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`];
  if (https(req)) flags.push('Secure');
  res.append('Set-Cookie', [`${COOKIE}=${token}`, ...flags].join('; '));
}

export function clearSessionCookie(req: express.Request, res: express.Response) {
  const flags = ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (https(req)) flags.push('Secure');
  res.append('Set-Cookie', [`${COOKIE}=`, ...flags].join('; '));
}

// ---------------- the brake on guessing (in memory) ----------------

const WINDOW = 15 * 60 * 1000;
export const MAX_FAILURES = 10;
const failures = new Map<string, number[]>();

function recent(key: string, now = Date.now()) {
  const list = (failures.get(key) ?? []).filter((at) => at > now - WINDOW);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

/** Too many failed sign-ins lately, from this address or for this email. */
export const throttled = (ip: string, email: string) => recent(`ip:${ip}`).length >= MAX_FAILURES || recent(`email:${email}`).length >= MAX_FAILURES;

export function failed(ip: string, email: string) {
  for (const key of [`ip:${ip}`, `email:${email}`]) failures.set(key, [...recent(key), Date.now()]);
}

/** A right password forgets the email's failures (the address keeps its own). */
export const succeeded = (email: string) => failures.delete(`email:${email}`);

// the old failures go now and then, so the map does not grow without end
setInterval(() => {
  for (const key of [...failures.keys()]) recent(key);
}, WINDOW).unref();
