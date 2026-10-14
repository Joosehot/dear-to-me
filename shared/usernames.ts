// Usernames (@handles): the one rule for them, used by the server and the client alike.
//
// A username is lowercase a–z, 0–9, dot and underscore, 3 to 20 characters, starting with a letter or
// a digit, with no two dots in a row and no dot at the end. It is unique, public, and shown as
// @username; friends are added by it. The display name beside it is free (anyone may share one).

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
/** A username changed away from stays its previous owner's for this long (no one else may take it). */
export const USERNAME_HOLD_DAYS = 30;

/** Never anyone's: the app's own words, addresses and roles someone could pass themselves off as. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin', 'administrator', 'support', 'help', 'api', 'd2m', 'deartome', 'dear.to.me', 'dear_to_me',
  'settings', 'login', 'logout', 'signin', 'signup', 'register', 'terms', 'privacy', 'refunds', 'rules',
  'contact', 'about', 'me', 'u', 'post', 'posts', 'write', 'search', 'fyp', 'feed', 'friends', 'letters', 'groups',
  'media', 'uploads', 'static', 'assets', 'seed', 'www', 'root', 'system', 'moderator', 'mod', 'official',
  'staff', 'team', 'security', 'billing', 'payments', 'null', 'undefined', 'anonymous', 'everyone',
]);

/** Why a username cannot be had ('taken' is the server's to say: someone has it, or held it lately). */
export type UsernameReason = 'short' | 'long' | 'chars' | 'start' | 'dots' | 'end' | 'reserved' | 'taken';

/** As typed: trimmed, a leading @ off, lowercase (uppercase is not refused, it is read as lowercase). */
export const normalUsername = (raw: unknown) => String(raw ?? '').trim().replace(/^@/, '').toLowerCase();

/** What is wrong with a username (already normalised), or nothing. */
export function usernameProblem(name: string): UsernameReason | undefined {
  if (name.length < USERNAME_MIN) return 'short';
  if (name.length > USERNAME_MAX) return 'long';
  if (!/^[a-z0-9._]+$/.test(name)) return 'chars';
  if (!/^[a-z0-9]/.test(name)) return 'start';
  if (name.includes('..')) return 'dots';
  if (name.endsWith('.')) return 'end';
  if (RESERVED_USERNAMES.has(name)) return 'reserved';
  return undefined;
}

// letters NFD does not take apart into a letter and a mark
const SPECIAL: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ð: 'd', ł: 'l', þ: 'th', ı: 'i' };

/** A username made from a display name, before it is checked against anyone's: Äiti Öljy -> aiti.oljy. */
export function usernameBase(display: string) {
  let s = display
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ßæœøđðłþı]/g, (c) => SPECIAL[c] ?? '');
  s = s
    .replace(/[\s-]+/g, '.')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._]+/, '')
    .slice(0, USERNAME_MAX)
    .replace(/\.+$/, '');
  if (!s) s = 'user';
  // too short: digits to fill it out (al -> al1)
  for (let d = 1; s.length < USERNAME_MIN; d++) s += String(d);
  return s;
}

/** The first username from a display name that `free` accepts and the rule allows: the base, then
 * with digits after it (joose2, joose3, …), cut to fit. */
export function usernameFrom(display: string, free: (name: string) => boolean) {
  const base = usernameBase(display);
  if (!usernameProblem(base) && free(base)) return base;
  for (let n = 2; ; n++) {
    const digits = String(n);
    const name = base.slice(0, USERNAME_MAX - digits.length).replace(/\.+$/, '') + digits;
    if (!usernameProblem(name) && free(name)) return name;
  }
}
