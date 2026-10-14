// The three plans: Lite (everyone starts here), Unlimited and Exclusive. Every number of them lives here.
//
// Lite: posts disappear. A blog lives 24 hours (at most 3 in 24 hours), a vlog two days (one a
// day, at most 10 minutes), a letter a week.
// Unlimited (9,99 EUR/mo; its key is 'pro', the name it had first): you choose how long each post
// stays live and change it whenever you like; a post whose time is up goes to your archive. A vlog
// may be as long as your storage allows, you can buy more storage, and you may sell a monthly
// subscription to your paid public posts.
// Exclusive (20 EUR/mo): all of Unlimited, but instead of a monthly subscription your audience pays
// for each paid post (no monthly payment for them): a blog at most 5 EUR, a vlog at most 50 EUR and
// at least 30 minutes long. Free posts sit among the paid ones.
//
// Storage is two spaces, kept apart: video, and text and pictures.
// The plan prices are the owner's decisions. The storage sizes and the packs' prices are the
// prototype's assumptions.

import type { Post } from './types';

export type PlanName = 'lite' | 'pro' | 'exclusive';
export type Space = 'video' | 'media';

const HOUR = 60 * 60 * 1000;
const GB = 1024 ** 3;

export const PLANS = {
  lite: {
    name: 'Lite',
    blogLife: 24 * HOUR,
    blogsPer24h: 3,
    vlogLife: 48 * HOUR,
    vlogsPer24h: 1,
    letterLife: 7 * 24 * HOUR,
    vlogMaxSeconds: 10 * 60,
    storage: { video: 1 * GB, media: 0.5 * GB },
    price: 0,
  },
  pro: {
    name: 'Unlimited',
    storage: { video: 20 * GB, media: 5 * GB },
    /** a vlog may be as long as the storage allows */
    vlogMaxSeconds: Infinity,
    price: 999,
  },
  exclusive: {
    name: 'Exclusive',
    storage: { video: 100 * GB, media: 20 * GB },
    vlogMaxSeconds: Infinity,
    price: 2000,
  },
} as const;

/** Unlimited and Exclusive: choosing how long a post lives, the archive, buying storage. */
export const beyondLite = (plan: PlanName) => plan !== 'lite';
/** Selling a monthly subscription is Unlimited's. */
export const sellsSubscriptions = (plan: PlanName) => plan === 'pro';
/** Selling single posts is Exclusive's. */
export const sellsPosts = (plan: PlanName) => plan === 'exclusive';

/** Exclusive's paid posts: a blog at most 5 EUR, a vlog at most 50 EUR and at least 30 minutes long. */
export const POST_PRICE = { blogMax: 5_00, vlogMax: 50_00, vlogMinSeconds: 30 * 60 };

/** More storage, for the paid plans only: one pack a month, of either space. */
export const STORAGE_PACKS: Record<Space, { bytes: number; price: number }> = {
  video: { bytes: 50 * GB, price: 299 },
  media: { bytes: 10 * GB, price: 99 },
};

/** How long a post may stay live on the paid plans; null: until you end it. */
export const LIFE_CHOICES: { label: string; ms: number | null }[] = [
  { label: '24 h', ms: 24 * HOUR },
  { label: '2 päivää', ms: 48 * HOUR },
  { label: '1 viikko', ms: 7 * 24 * HOUR },
  { label: '1 kuukausi', ms: 30 * 24 * HOUR },
  { label: 'Pysyvä', ms: null },
];

/** When a Lite post's time is up, from its kind. */
export function liteLife(post: Pick<Post, 'kind' | 'letter'>) {
  const lite = PLANS.lite;
  return post.letter ? lite.letterLife : post.kind === 'vlog' ? lite.vlogLife : lite.blogLife;
}

/** A user's storage, each space: the plan's, and the packs bought on a paid plan. */
export function quota(plan: PlanName, packs: Partial<Record<Space, number>> = {}): Record<Space, number> {
  const base = PLANS[plan].storage;
  const extra = (s: Space) => (beyondLite(plan) ? (packs[s] ?? 0) * STORAGE_PACKS[s].bytes : 0);
  return { video: base.video + extra('video'), media: base.media + extra('media') };
}

/** Is the post live now (not archived, its time not up)? */
export function isLive(post: Pick<Post, 'expiresAt' | 'archived'>, now = Date.now()) {
  return !post.archived && (post.expiresAt == null || post.expiresAt > now);
}

export function bytes(n: number) {
  if (n >= GB) return `${(n / GB).toLocaleString('fi-FI', { maximumFractionDigits: 1 })} Gt`;
  return `${Math.max(0, n / 1024 ** 2).toLocaleString('fi-FI', { maximumFractionDigits: 1 })} Mt`;
}
