// Routes and the people the app knows, shared by every page.
// The routes are paths (/post/x, /@mira), moved with the History API; the old hash addresses
// (/#/post/x) are turned into paths on load, so links shared before keep working.

import { createContext, useContext, useMemo } from 'react';
import type { User } from '../shared/types';
import { isLegalPage, type LegalPage } from './legal/common';

/** Everyone the app knows, by id (for names and avatars). */
export const People = createContext<Map<string, User>>(new Map());
export const usePeople = () => useContext(People);

/** Everyone the app knows and these besides: the people a public page came with (a visitor who is
 * not signed in knows no one else). Those already known stay as they are. */
export function useMorePeople(more: User[]) {
  const known = usePeople();
  return useMemo(() => {
    if (more.length === 0) return known;
    const all = new Map(known);
    for (const u of more) if (!all.has(u.id)) all.set(u.id, u);
    return all;
  }, [known, more]);
}

export type Route =
  | { page: 'feed' }
  | { page: 'post'; id: string }
  // (group: written to that group, /write/g/<id>)
  | { page: 'write'; letter?: boolean; to?: string; group?: string }
  // the groups: yours, invitations, interest groups (/groups); one group (/g/<id>)
  | { page: 'groups' }
  | { page: 'group'; id: string }
  | { page: 'friends' }
  | { page: 'me' }
  | { page: 'letters' }
  | { page: 'fyp' }
  | { page: 'search' }
  // once, right after sign-up: a few interests
  | { page: 'welcome' }
  // signed out: sign in, or make an account
  | { page: 'login' }
  | { page: 'signup' }
  // links by email, signed in or not: a new password asked for and set, an address confirmed (?token=)
  | { page: 'forgot' }
  | { page: 'reset' }
  | { page: 'verify' }
  // a profile, by id (/u/<id>) or by username (/@<username>)
  | { page: 'user'; id?: string; username?: string }
  // moderators: the queue, the people, the log
  | { page: 'mod' }
  // signed in or not: a complaint about a moderation decision (?token= from its statement), and a notice from anyone
  | { page: 'complaint'; id: string }
  | { page: 'report-content' }
  | { page: 'legal'; doc: LegalPage };

/** The route of a path ("/post/x", "/@mira"). */
export function parse(pathname: string): Route {
  const [, page, id, more] = pathname.split('/');
  // (a username is plain ASCII: nothing to decode)
  if (page?.startsWith('@') && page.length > 1) return { page: 'user', username: page.slice(1).toLowerCase() };
  if (page === 'post' && id) return { page: 'post', id };
  if (page === 'me') return { page: 'me' };
  if (page === 'write' && id === 'g' && more) return { page: 'write', group: more };
  if (page === 'write') return id === 'letter' ? { page: 'write', letter: true } : id ? { page: 'write', letter: true, to: id } : { page: 'write' };
  if (page === 'groups') return { page: 'groups' };
  if (page === 'g' && id) return { page: 'group', id };
  if (page === 'letters') return { page: 'letters' };
  if (page === 'fyp') return { page: 'fyp' };
  if (page === 'search') return { page: 'search' };
  if (page === 'welcome') return { page: 'welcome' };
  if (page === 'login') return { page: 'login' };
  if (page === 'signup') return { page: 'signup' };
  if (page === 'forgot') return { page: 'forgot' };
  if (page === 'reset') return { page: 'reset' };
  if (page === 'verify') return { page: 'verify' };
  if (page === 'u' && id) return { page: 'user', id };
  if (page === 'friends') return { page: 'friends' };
  if (page === 'mod') return { page: 'mod' };
  if (page === 'complaint' && id) return { page: 'complaint', id };
  if (page === 'report-content') return { page: 'report-content' };
  if (isLegalPage(page)) return { page: 'legal', doc: page };
  return { page: 'feed' };
}

/** The pages a visitor who is not signed in may open as they are: a public profile and a public post. */
export const isPublicPage = (route: Route) => route.page === 'user' || route.page === 'post';

/** A page of this site to come back to after signing in (?next=): a path, never another site
 * ("//evil", "/\evil", "https://...") and no query of its own (the server's rule for Stripe's way back). */
export function validNext(next: unknown): next is string {
  return typeof next === 'string' && next.length <= 200 && /^\/(?![/\\])[^\s\\?#]*$/.test(next);
}

/** Where to go once signed in or joined: the page the visitor came from (?next=), or the feed. */
export function nextPath() {
  const next = new URLSearchParams(location.search).get('next');
  return validNext(next) && !/^\/(login|signup|welcome|forgot|reset|verify)\/?$/.test(next) ? next : '/';
}

/** The way to sign in or join that comes back to this page afterwards. */
export function signInHref(page: 'login' | 'signup', back = location.pathname) {
  return validNext(back) && back !== '/' ? `/${page}?next=${encodeURIComponent(back)}` : `/${page}`;
}

/** The path of a route. */
export function pathOf(route: Route): string {
  if (route.page === 'write') return route.group ? `/write/g/${route.group}` : route.to ? `/write/${route.to}` : route.letter ? '/write/letter' : '/write';
  if (route.page === 'group') return `/g/${route.id}`;
  if (route.page === 'user') return route.username ? `/@${route.username}` : `/u/${route.id}`;
  if (route.page === 'legal') return `/${route.doc}`;
  if (route.page === 'complaint') return `/complaint/${route.id}`;
  return route.page === 'post' ? `/post/${route.id}` : route.page === 'feed' ? '/' : `/${route.page}`;
}

/** Fired after every change of address made here (history.pushState itself fires nothing). */
const NAVIGATED = 'd2m:navigated';

/** To a path of the app, as a new history entry (or in place of this one), at the top of the page. */
export function navigate(path: string, replace = false) {
  // the mock keeps its ?mock from page to page (a reload stays the mock)
  const [, query = ''] = path.split('?');
  const mock = new URLSearchParams(location.search).has('mock') && !new URLSearchParams(query).has('mock');
  const to = mock ? `${path}${path.includes('?') ? '&' : '?'}mock` : path;
  if (to !== location.pathname + location.search) history[replace ? 'replaceState' : 'pushState'](null, '', to);
  window.scrollTo(0, 0);
  window.dispatchEvent(new Event(NAVIGATED));
}

export const go = (route: Route, replace = false) => navigate(pathOf(route), replace);

/** Every change of address, ours and the back and forward buttons'; the unsubscribe. */
export function onNavigate(f: () => void) {
  window.addEventListener(NAVIGATED, f);
  window.addEventListener('popstate', f);
  return () => {
    window.removeEventListener(NAVIGATED, f);
    window.removeEventListener('popstate', f);
  };
}

/** The old hash addresses (/#/post/x, /#/@mira, Stripe's /?paid=...#/me) to their path, in place. */
export function fromHash() {
  if (location.hash.startsWith('#/')) history.replaceState(null, '', location.hash.slice(1) + location.search);
}

/** Paths the server answers itself (not pages of the app). */
const SERVER_PATHS = /^\/(api|media|uploads|ws)(\/|$)/;

type Click = Pick<MouseEvent, 'defaultPrevented' | 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'target' | 'preventDefault'>;

/** A click on a link to a page of the app goes there without loading the site again. A modified
 * click (a new tab), another target, a download, another site or the server's own paths go as usual. */
export function followLink(e: Click) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.('a');
  if (!a || !a.hasAttribute('href') || a.hasAttribute('download')) return;
  if (a.target && a.target !== '_self') return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || SERVER_PATHS.test(url.pathname)) return;
  // a file (/robots.txt, a picture) is not a page of the app; /@veera.k is
  if (/^\/(?!@).*\.[a-z0-9]+$/i.test(url.pathname)) return;
  // a jump within this page only
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
}

/** Once, at the start: an old hash address becomes its path, and link clicks stay in the app. */
export function startNavigation() {
  fromHash();
  document.addEventListener('click', followLink);
}

/** Where someone's profile is: /@username. */
export const profileHref = (user: Pick<User, 'username'>) => `/@${user.username}`;
