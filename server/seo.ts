// What search engines and link previews see: each page's <head> (title, description, canonical
// address, Open Graph, robots, JSON-LD) and a plain readable version of a public page inside the
// root element, which the app replaces when it starts. Also robots.txt, the sitemap, and the check
// of a Checkout `back` page. Nothing here reads the store: the server hands in what is public, so
// this file has no imports and the checks load it as it is.

/** The site's name, and what it is (Finnish, the main language). */
export const SITE = 'Dear to Me';
export const SITE_DESCRIPTION = 'Some ystävillesi, ei yleisölle. Kerro kunnolla: blogi tai vlogi kavereille. Jokaisen jutun alle avautuu oma keskustelu, ja siihen voi tulla mukaan livenä.';
/** The picture a page without one of its own shows in a link preview. */
const DEFAULT_IMAGE = '/icons/heart.png';

/** The legal pages and their Finnish titles: anyone may read them, so they are indexed. */
export const LEGAL_TITLES = {
  terms: 'Käyttöehdot',
  privacy: 'Tietosuojaseloste',
  refunds: 'Peruutus- ja palautusehdot',
  rules: 'Sisältösäännöt',
  contact: 'Yhteystiedot',
} as const;

/** Text made safe inside HTML, an attribute's value too. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** JSON safe inside a <script> element (no "</script>", no "<!--"). */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** A page of this site to come back to after Stripe: a path, never another site ("//evil",
 * "/\evil", which browsers read as another host, or "https://..."), and a bare path (the query is Stripe's). */
export function validBack(back: unknown): back is string {
  return typeof back === 'string' && back.length <= 200 && /^\/(?![/\\])[^\s\\?#]*$/.test(back);
}

/** The words of a text as one short description. */
export function snippet(text: string, max = 200) {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

/** The first paragraph of a post's text (all that a paid post shows to those who have not paid). */
export const opening = (body: string) => body.split(/\n\s*\n/)[0].trim();

// --- the public data a page is made of ---

export interface PublicPerson {
  id: string;
  name: string;
  username: string;
  bio?: string;
  avatarUrl?: string;
  wallpaperUrl?: string;
  /** their profile is public (only then is it linked to, or named) */
  publicProfile?: boolean;
}

export interface PublicPost {
  id: string;
  kind: 'blog' | 'vlog';
  title: string;
  /** for a paid post: its opening only */
  body: string;
  paid?: boolean;
  imageUrl?: string;
  /** a free vlog's video (a paid one's is never in the page) */
  videoUrl?: string;
  duration?: number;
  createdAt: number;
}

/** What a page has in its head and, for a public one, in its body. */
export interface Meta {
  title: string;
  description: string;
  /** the page's own address (its path); none: none is given */
  canonical?: string;
  image?: string;
  /** a large picture (a cover, a wallpaper) rather than a small square one */
  largeImage?: boolean;
  type: 'website' | 'profile' | 'article' | 'video.other';
  index: boolean;
  jsonLd?: object;
  /** readable HTML of the page (already escaped) */
  body?: string;
}

/** A page with nothing public about it: no title of its own, not indexed. */
export const hidden = (): Meta => ({ title: SITE, description: SITE_DESCRIPTION, type: 'website', index: false });

export const landing = (): Meta => ({
  title: `${SITE} · Pidempiä juttuja kavereille`,
  description: SITE_DESCRIPTION,
  canonical: '/',
  type: 'website',
  index: true,
  jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, description: SITE_DESCRIPTION, inLanguage: 'fi', url: '/' },
});

export function legalPage(doc: keyof typeof LEGAL_TITLES): Meta {
  const title = LEGAL_TITLES[doc];
  return { title: `${title} · ${SITE}`, description: `${title}: ${SITE}.`, canonical: `/${doc}`, type: 'website', index: true };
}

const iso = (ms: number) => new Date(ms).toISOString();
const profilePath = (p: PublicPerson) => `/@${p.username}`;

/** A public profile: name, bio, picture, and links to their public posts. */
export function profile(person: PublicPerson, posts: PublicPost[]): Meta {
  const path = profilePath(person);
  const description = person.bio ? snippet(person.bio) : `${person.name} (@${person.username}) on ${SITE}.`;
  const items = posts.map((p) => `<li><a href="/post/${esc(p.id)}">${esc(p.title)}</a></li>`).join('');
  return {
    title: `${person.name} (@${person.username}) · ${SITE}`,
    description,
    canonical: path,
    image: person.wallpaperUrl ?? person.avatarUrl,
    largeImage: !!person.wallpaperUrl,
    type: 'profile',
    index: true,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      url: path,
      mainEntity: { '@type': 'Person', name: person.name, alternateName: `@${person.username}`, identifier: person.username, url: path, ...(person.bio ? { description: person.bio } : {}), ...(person.avatarUrl ? { image: person.avatarUrl } : {}) },
    },
    body:
      `<article class="prerender"><h1>${esc(person.name)}</h1><p>@${esc(person.username)}</p>` +
      (person.bio ? `<p>${esc(person.bio)}</p>` : '') +
      (items ? `<ul>${items}</ul>` : '') +
      '</article>',
  };
}

/** A live public post: its title, its opening, its cover, and who wrote it (linked if their profile is public). */
export function post(p: PublicPost, author: PublicPerson): Meta {
  const path = `/post/${p.id}`;
  // a paid post's body is its opening only, as the server hands it in; once more here to be sure
  const text = p.paid ? opening(p.body) : p.body;
  const first = opening(text);
  const authorUrl = author.publicProfile ? profilePath(author) : undefined;
  const person = { '@type': 'Person', name: author.name, ...(authorUrl ? { url: authorUrl } : {}) };
  const video = p.kind === 'vlog';
  const jsonLd = video
    ? {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: p.title,
        description: snippet(first || p.title, 300),
        uploadDate: iso(p.createdAt),
        datePublished: iso(p.createdAt),
        author: person,
        url: path,
        ...(p.imageUrl ? { thumbnailUrl: p.imageUrl } : {}),
        ...(!p.paid && p.videoUrl ? { contentUrl: p.videoUrl } : {}),
        ...(p.duration ? { duration: `PT${Math.round(p.duration)}S` } : {}),
        ...(p.paid ? { isAccessibleForFree: false } : {}),
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: p.title,
        description: snippet(first || p.title, 300),
        datePublished: iso(p.createdAt),
        author: person,
        url: path,
        mainEntityOfPage: path,
        inLanguage: 'fi',
        ...(p.imageUrl ? { image: p.imageUrl } : {}),
        ...(p.paid ? { isAccessibleForFree: false } : {}),
      };
  const byline = authorUrl ? `<a href="${esc(authorUrl)}">${esc(author.name)}</a>` : esc(author.name);
  return {
    title: `${p.title} · ${author.name} · ${SITE}`,
    description: snippet(first || p.title),
    canonical: path,
    image: p.imageUrl,
    largeImage: !!p.imageUrl,
    type: video ? 'video.other' : 'article',
    index: true,
    jsonLd,
    body:
      `<article class="prerender"><h1>${esc(p.title)}</h1><p>${byline} · <time datetime="${iso(p.createdAt)}">${iso(p.createdAt).slice(0, 10)}</time></p>` +
      (first ? `<p>${esc(first)}</p>` : '') +
      '</article>',
  };
}

// --- into the page ---

/** Absolute, on this site, unless it already is. */
const absolute = (url: string, origin: string) => (/^https?:\/\//.test(url) ? url : origin + (url.startsWith('/') ? url : `/${url}`));

/** The tags of a page's head. */
export function headTags(m: Meta, origin: string) {
  const image = absolute(m.image ?? DEFAULT_IMAGE, origin);
  const url = m.canonical ? absolute(m.canonical, origin) : undefined;
  // the JSON-LD's own paths are made absolute too
  const ld = m.jsonLd && JSON.parse(JSON.stringify(m.jsonLd), (k, v) => (typeof v === 'string' && ['url', 'mainEntityOfPage', 'image', 'thumbnailUrl', 'contentUrl'].includes(k) ? absolute(v, origin) : v));
  return [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<meta name="robots" content="${m.index ? 'index, follow' : 'noindex, nofollow'}" />`,
    url && `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:locale" content="fi_FI" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:type" content="${m.type}" />`,
    url && `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta name="twitter:card" content="${m.largeImage ? 'summary_large_image' : 'summary'}" />`,
    ld && `<script type="application/ld+json">${scriptJson(ld)}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');
}

/** index.html with this page's head, and its readable body inside the root element. */
export function render(template: string, m: Meta, origin: string) {
  // the defaults in index.html give way to the page's own, where its title was (high in the head)
  const tags = headTags(m, origin);
  const plain = template.replace(/\s*<meta\s+name="(description|robots)"[^>]*>/g, '');
  const head = /<title>[\s\S]*?<\/title>/.test(plain) ? plain.replace(/<title>[\s\S]*?<\/title>/, () => tags) : plain.replace('</head>', () => `  ${tags}\n  </head>`);
  // (replaced through a function: a "$&" or "$'" in someone's text stays text)
  return m.body ? head.replace(/<div id="root"><\/div>/, () => `<div id="root">${m.body}</div>`) : head;
}

// --- robots.txt and the sitemap ---

export function robots(origin: string) {
  // pictures stay open: a public page's og:image and cover live under /media/ (or /uploads/), and their
  // addresses are random, so a crawler finds only those a public page links to
  const allow = ['/', '/@', '/post/', '/media/', '/uploads/', ...Object.keys(LEGAL_TITLES).map((d) => `/${d}`)];
  // (a group is never public: a friend group is its members', an interest group is for everyone signed in)
  const disallow = ['/api/', '/me', '/write', '/letters', '/friends', '/search', '/fyp', '/login', '/signup', '/welcome', '/u/', '/mod', '/complaint/', '/report-content', '/groups', '/g/'];
  return ['User-agent: *', ...allow.map((p) => `Allow: ${p}`), ...disallow.map((p) => `Disallow: ${p}`), '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}

/** The sitemap: each page's path and when it last changed. */
export function sitemap(origin: string, pages: { path: string; lastmod?: number }[]) {
  const urls = pages.map((p) => `  <url><loc>${esc(origin + p.path)}</loc>${p.lastmod ? `<lastmod>${iso(p.lastmod)}</lastmod>` : ''}</url>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>', ''].join('\n');
}
