// The mock: the whole app without a server. Data lives in memory, and the friends are played by
// a script, so one person can walk through the flow alone: friends come into a conversation,
// answer what you write, react when you post, and post something of their own.

import { MAX_PRICE } from '../shared/pricing';
import { LIFE_CHOICES, PLANS, POST_PRICE, beyondLite, isLive, liteLife, quota, sellsPosts, sellsSubscriptions, type PlanName, type Space } from '../shared/plans';
import { t } from './text';
import { USERNAME_HOLD_DAYS, normalUsername, usernameFrom, usernameProblem, type UsernameReason } from '../shared/usernames';
import type { ClientEvent, Config, Group, GroupInvite, GroupKind, GroupMember, GroupPage, GroupsOverview, Interests, Message, Note, PlanState, Post, PostSummary, Profile, ProfilePage, PurchaseEntry, ServerEvent, TopicPage, User, UsernameCheck } from '../shared/types';
import { MAX_POST_TOPICS, TOPIC_POSTS_MAX, TOPIC_WRITERS_MAX, type TopicId } from '../shared/interests';
import { cleanTopics, cleanWords, isTopic, postTopics, type PostTopic } from '../shared/topics';
import { rank, suggestGroups } from '../shared/foryou';
import { cleanGroupDescription, cleanGroupName } from '../shared/groups';
import type { ComplaintPage, Decision, LogEntry, ModQueue, PostAction, Rule, Suspension } from '../shared/moderation';

const COLORS: Record<string, string> = { Joose: '#5b7fbf', Aino: '#c0577a', Mikko: '#3f9d7f', Sara: '#d08a3c', Leo: '#4a9bb0', Mira: '#8a63b8', Eeva: '#c4573c' };
let n = 0;
const PARA = String.fromCharCode(10, 10);
const id = () => `m${++n}`;
const ago = (min: number) => Date.now() - min * 60_000;

// Leo, Mira and Eeva are nobody's friends: they write in public; Mira sells a subscription (Unlimited),
// Eeva single posts (Exclusive)
const users: User[] = ['Joose', 'Aino', 'Mikko', 'Sara', 'Leo', 'Mira', 'Eeva'].map((name) => ({ id: name.toLowerCase(), name, username: name.toLowerCase(), color: COLORS[name] }));
users.find((u) => u.id === 'mira')!.price = 499;
// the public writers are on the paid plans; the friends start on Lite, as everyone does
for (const id of ['leo', 'mira']) users.find((u) => u.id === id)!.plan = 'pro';
users.find((u) => u.id === 'eeva')!.plan = 'exclusive';
// their public profiles
Object.assign(users.find((u) => u.id === 'leo')!, { publicProfile: true, bio: 'Kävelen metsissä ja kirjoitan siitä, mitä siellä kuulen.', wallpaperUrl: '/seed/metsa.jpg' });
Object.assign(users.find((u) => u.id === 'mira')!, { publicProfile: true, bio: 'Kirjoitan joka aamu. Tilaajat saavat kaiken, mitä opin matkalla.', wallpaperUrl: '/seed/kahvi.jpg' });
Object.assign(users.find((u) => u.id === 'eeva')!, { publicProfile: true, bio: 'Leivon ruisleipää isoäidin juurella. Osa jutuista on ilmaisia, osan myyn yksitellen.', wallpaperUrl: '/seed/meri.jpg' });
const H = 60 * 60 * 1000;
const subscriptions: [string, string][] = [];
/** [buyer, post]: Exclusive posts bought */
const purchases: [string, string][] = [];
/** [post, reporter, reason] */
const reports: [string, string, string][] = [];
/** the mock's moderation: its decisions and its log (Joose moderates, as in the demo) */
const decisions: Decision[] = [];
const modLog: LogEntry[] = [];
const suspended: Suspension[] = [];
/** usernames changed away from: [username, its previous owner, when] (held for them, as on the server) */
const released: [string, string, number][] = [];
function usernameRefused(name: string, userId?: string): UsernameReason | undefined {
  const problem = usernameProblem(name);
  if (problem) return problem;
  const since = Date.now() - USERNAME_HOLD_DAYS * 24 * H;
  if (users.some((u) => u.username === name && u.id !== userId) || released.some(([n, u, at]) => n === name && u !== userId && at > since)) return 'taken';
}
const byName = (name: string) => users.find((u) => u.name === name)!;
const friends: [string, string][] = [
  // (Leo and Mira have no friends here)
  ['joose', 'aino'], ['joose', 'mikko'], ['joose', 'sara'], ['aino', 'mikko'], ['aino', 'sara'], ['mikko', 'sara'],
];

const posts: Post[] = [
  {
    id: 'lofoten',
    authorId: 'aino',
    kind: 'blog',
    title: 'Kolme viikkoa Lofooteilla',
    body: [
      'Lupasin kirjoittaa kunnolla, joten tässä se on. Ei mitään kohokohtakoostetta, vaan miltä tämä oikeasti on tuntunut.',
      'Ensimmäinen viikko satoi joka päivä. Istuin vuokramökin ikkunassa ja mietin, miksi lähdin. Sitten neljäntenä päivänä taivas aukesi, ja ymmärsin.',
      'Olen oppinut perkaamaan turskan, kävelemään vuorelle ilman että jalat pettävät, ja olemaan hiljaa pitkiä aikoja. Kaipaan teitä silti. Kertokaa mitä sinne kuuluu.',
    ].join('\n\n'),
    imageUrl: '/seed/lofoten.jpg',
    audience: 'friends',
    createdAt: ago(300),
    expiresAt: ago(300) + 24 * H,
  },
  {
    id: 'muutto',
    authorId: 'mikko',
    kind: 'blog',
    title: 'Muutettiin, ja tältä se tuntuu',
    body: [
      'Kaksikymmentä laatikkoa, yksi rikki mennyt lamppu ja kolme päivää ilman nettiä. Mutta nyt ollaan perillä.',
      'Uusi kämppä on pienempi, mutta ikkunasta näkyy meri. Aamulla join kahvit parvekkeella ja mietin, että tätä varten tämä kaikki tehtiin.',
      'Tupaantuliaiset ehkä kuun lopussa. Tulkaa!',
    ].join('\n\n'),
    imageUrl: '/seed/meri.jpg',
    audience: ['joose', 'sara'],
    createdAt: ago(60 * 20),
    expiresAt: ago(60 * 20) + 24 * H,
  },
];

posts.push({
  id: 'miksi',
  authorId: 'joose',
  kind: 'blog',
  title: 'Miksi tein Dear to Me:n',
  body: [
    'Huomasin, että tiedän kavereideni elämästä vain kohokohdat. Kuvan lomalta, storyn juhlista. En sitä, miltä heistä oikeasti tuntuu.',
    'Halusin paikan, jossa saa kertoa pidemmin, ja jossa vastaus on keskustelu eikä tykkäys. Siksi tämä.',
  ].join('\n\n'),
  imageUrl: '/seed/miksi.jpg',
  audience: 'friends',
  createdAt: ago(60 * 10),
  expiresAt: ago(60 * 10) + 24 * H,
});

// a letter from Sara, for Joose only
posts.push({
  id: 'sara-kirje',
  authorId: 'sara',
  kind: 'blog',
  letter: true,
  title: 'Sulle, Joose',
  body: [
    'Halusin kirjoittaa tämän sulle eikä kaikille. Kiitos siitä illasta viime kuussa, kun jaksoit kuunnella koko illan.',
    'En tiedä olisinko uskaltanut hakea sitä työpaikkaa ilman sitä keskustelua. Nyt mä aloitan maanantaina.',
    'Sä oot hyvä ystävä. Halusin että tiedät sen.',
  ].join('\n\n'),
  imageUrl: '/seed/miksi.jpg',
  audience: ['joose'],
  createdAt: ago(60 * 8),
  expiresAt: ago(60 * 8) + 7 * 24 * H,
});

/** BoVNotes: a note inside a post for chosen readers. Aino left one for Joose inside her Lofoten post. */
const notes: Note[] = [
  {
    id: 'aino-note',
    postId: 'lofoten',
    authorId: 'aino',
    text: 'Joose, tämä juttu on vähän sullekin: muistatko kun sanoit että lähde vaan? Kiitos siitä. 🏔️',
    recipients: ['joose'],
    seenBy: [],
    createdAt: ago(300),
  },
];
const waiting = (postId: string) => notes.filter((x) => x.postId === postId && me && x.recipients.includes(me.id) && !x.seenBy.includes(me.id));

// public posts for the For You page
posts.push(
  {
    id: 'leo-metsa',
    authorId: 'leo',
    kind: 'blog',
    title: 'Kuusi yötä metsässä ilman puhelinta',
    body: [
      'Jätin puhelimen autoon ja kävelin metsään. Ensimmäisenä iltana kaivoin taskua kymmenen kertaa.',
      'Kolmantena päivänä huomasin kuulevani linnut eri tavalla. Kuudentena en halunnut lähteä.',
      'Kirjoitin kaiken vihkoon. Tässä se on, sellaisenaan.',
    ].join(PARA),
    imageUrl: '/seed/metsa.jpg',
    audience: 'public',
    createdAt: ago(180),
    expiresAt: ago(180) + 7 * 24 * H,
  },
  {
    id: 'mira-aamut',
    authorId: 'mira',
    kind: 'blog',
    title: 'Miten kirjoitan joka aamu 1000 sanaa',
    body: [
      'Olen kirjoittanut joka aamu kaksi vuotta. Kerron tässä tarkalleen miten, ja mikä melkein sai minut lopettamaan.',
      'Ensimmäinen sääntö: kirjoitan ennen kuin avaan yhtään viestiä. Toinen: en lue mitä kirjoitin ennen iltaa.',
      'Kolmas sääntö on se, joka muutti kaiken. Se on tylsä, ja juuri siksi se toimii.',
    ].join(PARA),
    imageUrl: '/seed/kahvi.jpg',
    audience: 'public',
    paid: true,
    createdAt: ago(420),
  },
  {
    id: 'eeva-juuri',
    authorId: 'eeva',
    kind: 'blog',
    title: 'Leipäjuuri, joka on elänyt 40 vuotta',
    body: [
      'Isoäitini juuri on vanhempi kuin minä. Tässä on se, miten se pysyy hengissä, ilmaiseksi kaikille.',
      'Ruoki se kerran viikossa, pidä se viileässä, äläkä koskaan pese purkkia saippualla.',
    ].join(PARA),
    imageUrl: '/seed/meri.jpg',
    audience: 'public',
    createdAt: ago(120),
  },
  {
    id: 'eeva-resepti',
    authorId: 'eeva',
    kind: 'blog',
    title: 'Ruisleivän koko resepti grammoilleen',
    body: [
      'Tämä on se resepti, jota on kysytty eniten. Jokainen gramma, jokainen tunti, ja miksi.',
      'Ensin juuri herätetään: 100 g juurta, 300 g vettä, 200 g ruisjauhoja, ja 12 tuntia huoneenlämmössä.',
      'Sitten taikina. Tässä kohtaa melkein kaikki menee pieleen, ja kerron miksi.',
    ].join(PARA),
    imageUrl: '/seed/miksi.jpg',
    audience: 'public',
    paid: true,
    price: 300,
    createdAt: ago(240),
  },
);

/** Public posts' topics, as the server keeps them: the mock's writers chose theirs. */
const topicsOf = new Map<string, PostTopic[]>([
  ['leo-metsa', [{ id: 'nature', how: 'chosen' }, { id: 'wellbeing', how: 'chosen' }]],
  ['mira-aamut', [{ id: 'books', how: 'chosen' }, { id: 'wellbeing', how: 'chosen' }]],
  ['eeva-juuri', [{ id: 'food', how: 'chosen' }, { id: 'family', how: 'chosen' }]],
  ['eeva-resepti', [{ id: 'food', how: 'chosen' }]],
]);
/** Interests, private to each person (by id), as on the server. */
const interestsOf = new Map<string, Interests>();
const interestsFor = (userId: string): Interests => structuredClone(interestsOf.get(userId) ?? { topics: [], words: [], asked: false });

const messages: Message[] = [
  { id: id(), postId: 'lofoten', userId: 'mikko', text: 'Tuo neljäs päivä! Laita kuvia siitä vuoresta.', createdAt: ago(240) },
  { id: id(), postId: 'lofoten', userId: 'sara', text: 'Ihana lukea tällaista. Kuulostaa että tarvitsit tämän matkan.', createdAt: ago(200) },
  { id: id(), postId: 'muutto', userId: 'sara', text: 'Meri ikkunasta 😍 Tullaan ehdottomasti!', createdAt: ago(60 * 20) },
];

// --- presence and the friends' script ---
const rooms = new Map<string, Set<string>>();
let me: User | null = null;
let listener: (e: ServerEvent) => void = () => {};
const timers: number[] = [];

function send(e: ServerEvent) {
  listener(e);
}
function later(ms: number, f: () => void) {
  timers.push(window.setTimeout(f, ms));
}
function present(postId: string) {
  return [...(rooms.get(postId) ?? [])];
}
function enter(postId: string, userId: string) {
  if (!rooms.has(postId)) rooms.set(postId, new Set());
  rooms.get(postId)!.add(userId);
  send({ type: 'presence', postId, present: present(postId) });
}
function exit(postId: string, userId: string) {
  rooms.get(postId)?.delete(userId);
  send({ type: 'presence', postId, present: present(postId) });
}
function say(postId: string, userId: string, text: string) {
  const message = { id: id(), postId, userId, text, createdAt: Date.now() };
  messages.push(message);
  send({ type: 'message', message });
}

/** The friends who can be in a post's conversation, besides you (for a public post: its author and your friends). */
function readers(post: Post) {
  const all = users.filter(
    (u) =>
      u.id !== me?.id &&
      (u.id === post.authorId ||
        (post.audience === 'public' ? !!me && isFriend(me.id, u.id) : post.audience === 'group' ? !!roleIn(post.groupId ?? '', u.id) : post.audience === 'friends' || post.audience.includes(u.id))),
  );
  // the author first: it is their post
  return all.sort((a, b) => (a.id === post.authorId ? -1 : b.id === post.authorId ? 1 : 0));
}

const REPLIES = [
  'Totta! Kerro lisää.',
  'Haha, tunnistan tuon niin hyvin 😄',
  'Tätä mä just mietin itsekin.',
  'Ihanaa että oot täällä juttelemassa ❤️',
  'Mitä sitten tapahtui?',
  'Ollaan pian nähty liian vähän. Kahville ens viikolla?',
];
let reply = 0;

/** You opened a post: friends drop by, one after another. */
const scripted = new Set<string>();

function onJoin(postId: string) {
  const post = posts.find((p) => p.id === postId);
  if (!post || !me || !canRead(me.id, post)) return;
  enter(postId, me.id);
  // each conversation's friends drop by once (opening the post again finds them there)
  if (scripted.has(postId)) return;
  scripted.add(postId);
  const [first, second] = readers(post);
  if (first) {
    later(1800, () => enter(postId, first.id));
    later(4200, () => say(postId, first.id, first.id === post.authorId ? `Hei ${me!.name}! Kiva että luit.` : `Moi ${me!.name}! Luitko jo koko jutun?`));
  }
  if (second) {
    later(9000, () => enter(postId, second.id));
    later(11500, () => say(postId, second.id, 'Mäkin tulin tänne. Mistä puhutaan?'));
  }
}

/** You wrote something: whoever is in the conversation answers. */
function onSay(postId: string, text: string) {
  if (!me) return;
  say(postId, me.id, text);
  const here = present(postId).filter((u) => u !== me!.id);
  const who = here[Math.floor(Math.random() * here.length)];
  if (who) later(2200 + Math.random() * 1500, () => say(postId, who, REPLIES[reply++ % REPLIES.length]));
}

/** You posted: your friends get the word and come to talk. */
function onPosted(post: Post) {
  scripted.add(post.id);
  const [a, b] = readers(post);
  if (a) {
    later(3500, () => enter(post.id, a.id));
    later(6000, () => say(post.id, a.id, 'Ihana että kirjoitit tästä! Luin heti.'));
  }
  if (b) {
    later(9000, () => enter(post.id, b.id));
    later(11500, () => say(post.id, b.id, 'Sama täällä. Tällaisia juttuja haluan lukea ❤️'));
  }
}

/** A while after you sign in, a friend posts something new (the notification flow). */
function friendPostsLater() {
  later(25_000, () => {
    const sara = byName('Sara');
    const post: Post = {
      id: 'sara-tyo',
      authorId: sara.id,
      kind: 'blog',
      title: 'Ensimmäinen viikko uudessa työssä',
      body: [
        'Jännitti niin paljon, että nukuin sunnuntaina ehkä kolme tuntia. Turhaan.',
        'Tiimi on lämmin, kahvi on huonoa ja opittavaa on ihan valtavasti. Tuntuu siltä, että olen oikeassa paikassa.',
      ].join('\n\n'),
      imageUrl: '/seed/tyo.jpg',
      audience: 'friends',
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * H,
    };
    posts.push(post);
    // with a BoVNote inside for you
    notes.push({ id: id(), postId: post.id, authorId: sara.id, text: 'Joose, sun takia mä uskalsin hakea tätä. Kiitos ❤️', recipients: [me!.id], seenBy: [], createdAt: Date.now() });
    send({ type: 'posted', post });
    later(1500, () => enter(post.id, sara.id));
  });
}

// --- groups, in memory, as the server keeps them: Eeva's open interest group to find and join ---
interface MockGroup {
  id: string;
  kind: GroupKind;
  name: string;
  description?: string;
  topic?: TopicId;
  pictureUrl?: string;
  createdAt: number;
}
const groupList: MockGroup[] = [{ id: 'ruisleipa', kind: 'interest', name: 'Ruisleipäpiiri', description: 'Juuret, taikinat ja uunit: kaikki ruisleivästä.', topic: 'food', createdAt: ago(60 * 30) }];
const groupMembers: (GroupMember & { groupId: string })[] = [{ groupId: 'ruisleipa', userId: 'eeva', role: 'admin', joinedAt: ago(60 * 30) }];
const groupInvites: (GroupInvite & { groupId: string })[] = [];
const groupBans: { groupId: string; userId: string }[] = [];
const roleIn = (groupId: string, userId: string | undefined) => groupMembers.find((m) => m.groupId === groupId && m.userId === userId)?.role;
const seesGroup = (userId: string, groupId: string | undefined) => {
  const g = groupList.find((x) => x.id === groupId);
  return !!g && (g.kind === 'interest' || !!roleIn(g.id, userId));
};
function asGroup(g: MockGroup): Group {
  const out: Group = { ...g, members: groupMembers.filter((m) => m.groupId === g.id).length };
  const role = roleIn(g.id, me?.id);
  if (role) out.role = role;
  if (groupBans.some((b) => b.groupId === g.id && b.userId === me?.id)) out.banned = true;
  return out;
}
/** A group the signed-in user may see (the same 404 for a friend group they are not in as for none). */
function visibleGroup(groupId: string) {
  const g = groupList.find((x) => x.id === groupId);
  return g && me && seesGroup(me.id, g.id) ? g : undefined;
}
function groupPageOf(g: MockGroup): Promise<GroupPage> {
  const group = asGroup(g);
  const admin = group.role === 'admin';
  const all = groupMembers.filter((m) => m.groupId === g.id).sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.joinedAt - b.joinedAt);
  const page: GroupPage = {
    group,
    posts: summaries((p) => p.groupId === g.id),
    members: (g.kind === 'friends' || admin ? all : all.filter((m) => m.role === 'admin')).map(({ groupId: _, ...m }) => m),
  };
  if (g.kind === 'friends') page.invites = groupInvites.filter((i) => i.groupId === g.id && (i.status === 'invited' || admin || i.by === me?.id)).map(({ groupId: _, ...i }) => i);
  if (g.kind === 'interest' && admin) page.bans = groupBans.filter((b) => b.groupId === g.id).map((b) => b.userId);
  return pause(page);
}
const noGroup = () => notFound<GroupPage>('no such group');
function deleteMockGroup(groupId: string) {
  for (let j = posts.length - 1; j >= 0; j--) if (posts[j].groupId === groupId) posts.splice(j, 1);
  for (const list of [groupMembers, groupInvites, groupBans] as { groupId: string }[][]) for (let j = list.length - 1; j >= 0; j--) if (list[j].groupId === groupId) list.splice(j, 1);
  groupList.splice(groupList.findIndex((g) => g.id === groupId), 1);
}

// --- the same surface as the real API and live channel ---
const visible = (userId: string, p: Post) =>
  p.authorId === userId || p.audience === 'public' || p.audience === 'friends' || (p.audience === 'group' ? seesGroup(userId, p.groupId) : p.audience.includes(userId));
const subscribed = (userId: string, authorId: string) => subscriptions.some(([s, a]) => s === userId && a === authorId);
const bought = (userId: string, postId: string) => purchases.some(([b, p]) => b === userId && p === postId);
const canRead = (userId: string, p: Post) => !p.paid || p.authorId === userId || (p.price ? bought(userId, p.id) : subscribed(userId, p.authorId));
/** A paid post this reader has not subscribed to or bought (or anyone's, for a visitor who is not signed in): its opening only. */
const view = (p: Post): Post => ((me ? canRead(me.id, p) : !p.paid) ? p : { ...p, body: p.body.split(PARA)[0], videoUrl: undefined, pictures: undefined, locked: true });
const isFriend = (a: string, b: string) => friends.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const pause = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 120));

const planOf = (userId: string): PlanName => users.find((u) => u.id === userId)?.plan ?? 'lite';
const packs = new Map<string, Record<Space, number>>();

/** Posts whose time is up: a Lite author's disappear, a paid plan's go to their archive. */
function sweep() {
  const now = Date.now();
  for (const p of [...posts]) {
    if (p.archived || p.expiresAt == null || p.expiresAt > now) continue;
    if (beyondLite(planOf(p.authorId))) p.archived = true;
    else posts.splice(posts.indexOf(p), 1);
  }
}

function postedLastDay(userId: string, kind: Post['kind']) {
  return posts.filter((p) => p.authorId === userId && p.kind === kind && !p.letter && p.createdAt > Date.now() - 24 * H).length;
}

function planState(): PlanState {
  const plan = me ? planOf(me.id) : 'lite';
  const n = (me && packs.get(me.id)) || { video: 0, media: 0 };
  const lite = plan === 'lite';
  const mine = posts.filter((p) => p.authorId === me?.id);
  return {
    plan,
    packs: { ...n },
    used: { video: mine.reduce((s, p) => s + (p.videoSize ?? 0), 0), media: mine.reduce((s, p) => s + (p.size ?? 0), 0) },
    quota: quota(plan, n),
    blogsLeft: lite && me ? Math.max(0, PLANS.lite.blogsPer24h - postedLastDay(me.id, 'blog')) : null,
    vlogsLeft: lite && me ? Math.max(0, PLANS.lite.vlogsPer24h - postedLastDay(me.id, 'vlog')) : null,
  };
}

/** The posts the signed-in user may see, that pass `keep`, newest first, as the feed shows them. */
function summaries(keep: (p: Post) => boolean, live = true): PostSummary[] {
  sweep();
  return posts
    .filter((p) => !live || isLive(p))
    .filter((p) => me && visible(me.id, p) && (p.authorId === me.id || p.audience === 'public' || p.audience === 'group' || isFriend(me.id, p.authorId)) && keep(p))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => ({ ...view(p), messageCount: messages.filter((m) => m.postId === p.id).length, present: present(p.id), notesForMe: waiting(p.id).length, ...(topicsOf.has(p.id) ? { topics: topicsOf.get(p.id) } : {}) }));
}

/** For You as the server orders it: the same judges and beam (shared/foryou.ts), on the same candidates. */
function forYou(): PostSummary[] {
  const shown = summaries((p) => p.audience === 'public' && p.authorId !== me?.id && !p.hidden);
  const byId = new Map(shown.map((p) => [p.id, p]));
  const mine = me ? interestsFor(me.id) : { topics: [], words: [] };
  const ranked = rank(
    shown.map((p) => ({ id: p.id, authorId: p.authorId, createdAt: p.createdAt, title: p.title, body: posts.find((x) => x.id === p.id)!.body, messages: p.messageCount, topics: p.topics ?? [], friend: !!me && isFriend(me.id, p.authorId) })),
    mine,
    Date.now(),
  );
  return ranked.map((r) => ({ ...byId.get(r.id)!, because: r.because }));
}

// --- a visitor who is not signed in (me null): only what is public, as on the server ---

/** A post anyone may see: live, public, not a letter, not hidden by reports, not restricted. */
const isOpen = (p: Post) => p.audience === 'public' && !p.letter && !p.hidden && !p.restricted && isLive(p);
/** The server's 404 to a visitor who is not signed in: the same for what is private and what is not there. */
const notFound = <T,>(message: string) => Promise.reject<T>(Object.assign(new Error(message), { status: 404 }));
/** Someone as a visitor sees them (the server's publicUser). */
const publicUser = (u: User): User => ({
  id: u.id,
  name: u.name,
  username: u.username,
  color: u.color,
  avatarUrl: u.avatarUrl,
  ...(u.publicProfile ? { publicProfile: true, bio: u.bio, wallpaperUrl: u.wallpaperUrl } : {}),
  ...(u.price ? { price: u.price } : {}),
  ...(u.plan && u.plan !== 'lite' ? { plan: u.plan } : {}),
});
/** A post in a list for a visitor: no one present, no BoVNotes. */
const openSummary = (p: Post): PostSummary => ({ ...view(p), messageCount: messages.filter((m) => m.postId === p.id).length, present: [], notesForMe: 0, ...(topicsOf.has(p.id) ? { topics: topicsOf.get(p.id) } : {}) });

const profileFor = (u: User): Profile => ({ user: u, friend: !!me && isFriend(me.id, u.id), subscribed: !!me && subscribed(me.id, u.id), publicPosts: posts.filter((p) => p.authorId === u.id && p.audience === 'public').length });

/** Refused as the server would refuse it, with its code. */
const refused = <T>(code: string) => Promise.reject<T>(Object.assign(new Error(code), { code }));

/** The mock's people sign in as <id>@demo.d2m with any password; a new one signs up. */
const mockEmail = (u: User) => `${u.id}@demo.d2m`;
const signedUp = new Map<string, User>();

function signIn(u: User) {
  me = u.id === 'joose' ? { ...u, moderator: true } : u;
  friendPostsLater();
  return pause(u);
}

export const mockApi = {
  config: () => pause<Config>({ demo: true, demoEmails: users.filter((u) => !signedUp.has(u.id)).map(mockEmail), demoPassword: '(mikä tahansa / any)' }),
  me: () => (me ? pause(me) : refused<User>('not signed in')),
  // (the mock asks for no invite code)
  signUp: (name: string, username: string, email: string, password: string, terms: boolean, _invite?: string) => {
    const clean = name.trim();
    const handle = normalUsername(username);
    const mail = email.trim().toLowerCase();
    if (!clean) return refused<User>('name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return refused<User>('email');
    if (password.length < 10) return refused<User>('short-password');
    if (!terms) return refused<User>('terms');
    const no = usernameRefused(handle);
    if (no) return refused<User>(no === 'taken' ? 'username-taken' : 'username-invalid');
    if ([...signedUp.keys()].includes(mail) || users.some((u) => mockEmail(u) === mail)) return refused<User>('email-taken');
    const u: User = { id: id(), name: clean, username: handle, color: '#8a63b8' };
    users.push(u);
    signedUp.set(mail, u);
    for (const f of ['aino', 'mikko', 'sara']) friends.push([u.id, f]);
    return signIn(u);
  },
  login: (email: string, _password: string) => {
    const mail = email.trim().toLowerCase();
    const u = signedUp.get(mail) ?? users.find((x) => mockEmail(x) === mail);
    if (u && suspended.some((s) => s.user.id === u.id)) return refused<User>('suspended');
    return u ? signIn(u) : refused<User>('wrong-login');
  },
  logout: () => {
    me = null;
    return pause({ ok: true });
  },
  // the mock sends no email: asking is answered as the server answers it, and no link is ever valid
  forgotPassword: (_email: string) => pause({ ok: true }),
  resetPassword: (_token: string, _password: string) => refused<User>('token'),
  verifyEmail: (_token: string) => refused<{ ok: boolean; email: string; changed: boolean }>('token'),
  resendVerification: () => pause({ ok: true }),
  changeEmail: (_email: string, _password: string) => (me ? pause(me) : refused<User>('not signed in')),
  users: () => pause(users),
  friends: () => pause(users.filter((u) => me && isFriend(me.id, u.id))),
  addFriend: (username: string) => {
    const handle = normalUsername(username);
    const u = users.find((x) => x.username === handle);
    if (!u || !me) return refused<User[]>('no-username');
    if (!isFriend(me.id, u.id)) friends.push([me.id, u.id]);
    return mockApi.friends();
  },
  checkUsername: (username: string) => {
    const name = normalUsername(username);
    const reason = usernameRefused(name, me?.id);
    const check: UsernameCheck = reason ? { available: false, reason } : { available: true };
    if (reason === 'taken' || reason === 'reserved') check.suggestion = usernameFrom(name, (x) => !usernameRefused(x, me?.id));
    return pause(check);
  },
  setUsername: (username: string) => {
    const name = normalUsername(username);
    const u = users.find((x) => x.id === me?.id);
    if (!u || !me) return refused<User>('not signed in');
    const no = name === u.username ? undefined : usernameRefused(name, u.id);
    if (no) return refused<User>(no === 'taken' ? 'username-taken' : 'username-invalid');
    if (name !== u.username) {
      // taking back one's own held name frees it; the old one is held now
      for (let i = released.length - 1; i >= 0; i--) if (released[i][0] === name) released.splice(i, 1);
      released.push([u.username, u.id, Date.now()]);
      u.username = me.username = name;
    }
    return pause(u);
  },
  feed: () => pause(summaries((p) => p.authorId !== me?.id && !p.letter && p.audience !== 'group' && !!me && isFriend(me.id, p.authorId))),
  forYou: () => pause(forYou()),
  interests: () => (me ? pause(interestsFor(me.id)) : refused<Interests>('not signed in')),
  setInterests: (topics: TopicId[], words: string[]) => {
    if (!me) return refused<Interests>('not signed in');
    interestsOf.set(me.id, { topics: cleanTopics(topics), words: cleanWords(words), asked: true });
    return pause(interestsFor(me.id));
  },
  skipInterests: () => {
    if (!me) return refused<Interests>('not signed in');
    interestsOf.set(me.id, { ...interestsFor(me.id), asked: true });
    return pause(interestsFor(me.id));
  },
  topic: (topic: TopicId) => {
    const shown = summaries((p) => p.audience === 'public' && !p.hidden && !!topicsOf.get(p.id)?.some((t) => t.id === topic)).slice(0, TOPIC_POSTS_MAX);
    const count = (u: User) => shown.filter((p) => p.authorId === u.id).length;
    const writers = users
      .filter((u) => u.publicProfile && u.id !== me?.id && count(u) > 0)
      .sort((a, b) => count(b) - count(a) || users.indexOf(a) - users.indexOf(b))
      .slice(0, TOPIC_WRITERS_MAX)
      .map(profileFor);
    return pause<TopicPage>({ topic, posts: shown, writers });
  },
  search: (q: string) => {
    const words = q.toLowerCase().split(/\s+/).map((w) => w.replace(/^@+/, '')).filter(Boolean);
    const exact = normalUsername(q);
    const found: Profile[] = users
      .filter((u) => u.id !== me?.id && words.length > 0 && words.every((w) => u.name.toLowerCase().includes(w) || u.username.includes(w)))
      .sort((a, b) => Number(b.username === exact) - Number(a.username === exact))
      .map((u) => ({ user: u, friend: !!me && isFriend(me.id, u.id), subscribed: !!me && subscribed(me.id, u.id), publicPosts: posts.filter((p) => p.authorId === u.id && p.audience === 'public').length }));
    return pause(found);
  },
  plan: () => pause(planState()),
  setPlan: (plan: PlanName) => {
    const u = users.find((x) => x.id === me?.id);
    if (u && me) {
      u.plan = plan;
      me.plan = plan;
      // storage packs are the paid plans'; a monthly subscription is Unlimited's
      if (plan === 'lite') packs.delete(me.id);
      if (plan !== 'pro') {
        delete u.price;
        delete me.price;
      }
    }
    return pause(planState());
  },
  buyStorage: (space: Space) => {
    if (!me || !beyondLite(planOf(me.id))) return Promise.reject(new Error('more storage is for the paid plans'));
    const n = packs.get(me.id) ?? { video: 0, media: 0 };
    packs.set(me.id, { ...n, [space]: n[space] + 1 });
    return pause(planState());
  },
  archive: () => pause(summaries((p) => p.authorId === me?.id && !isLive(p), false)),
  setLife: (postId: string, life: number | null | 'end') => {
    const post = posts.find((p) => p.id === postId);
    if (!post || !me || post.authorId !== me.id || !beyondLite(planOf(me.id))) return Promise.reject(new Error('choosing how long a post stays is for the paid plans'));
    if (life === 'end') post.archived = true;
    else {
      post.archived = false;
      post.expiresAt = life === null ? null : Date.now() + life;
    }
    return pause(post);
  },
  deletePost: (postId: string) => {
    const i = posts.findIndex((p) => p.id === postId && p.authorId === me?.id);
    if (i >= 0) posts.splice(i, 1);
    return pause({ ok: true });
  },
  profileByUsername: (username: string) => {
    const them = users.find((u) => u.username === normalUsername(username));
    return mockApi.profile(them?.id ?? '');
  },
  profile: (userId: string) => {
    const them = users.find((u) => u.id === userId);
    if (!me) {
      if (!them?.publicProfile) return notFound<ProfilePage>(t.noProfile);
      sweep();
      const open = posts.filter((p) => p.authorId === them.id && isOpen(p)).sort((a, b) => b.createdAt - a.createdAt).map(openSummary);
      return pause<ProfilePage>({ user: publicUser(them), friend: false, subscribed: false, publicPosts: open.length, posts: open });
    }
    if (!them || !me || (them.id !== me.id && !them.publicProfile)) return Promise.reject(new Error(t.noProfile));
    const list = summaries((p) => p.authorId === them.id && p.audience === 'public');
    const page: ProfilePage = { user: them, friend: isFriend(me.id, them.id), subscribed: subscribed(me.id, them.id), publicPosts: list.length, posts: list };
    return pause(page);
  },
  setPicture: (which: 'avatar' | 'wallpaper', file: File | null) => {
    const u = users.find((x) => x.id === me?.id);
    if (!u || !me) return Promise.reject(new Error('not signed in'));
    const field = which === 'avatar' ? 'avatarUrl' : 'wallpaperUrl';
    if (file) u[field] = URL.createObjectURL(file);
    else delete u[field];
    Object.assign(me, { [field]: u[field] });
    return pause(u);
  },
  setProfile: (publicProfile: boolean, bio: string) => {
    const u = users.find((x) => x.id === me?.id);
    if (!u || !me) return Promise.reject(new Error('not signed in'));
    u.publicProfile = publicProfile || undefined;
    u.bio = bio.trim().slice(0, 300) || undefined;
    Object.assign(me, { publicProfile: u.publicProfile, bio: u.bio });
    return pause(u);
  },
  profiles: () => {
    const all: Profile[] = users
      .filter((u) => u.id !== me?.id)
      .map((u) => ({ user: u, friend: !!me && isFriend(me.id, u.id), subscribed: !!me && subscribed(me.id, u.id), publicPosts: posts.filter((p) => p.authorId === u.id && p.audience === 'public').length }))
      .sort((a, b) => b.publicPosts - a.publicPosts || a.user.name.localeCompare(b.user.name));
    return pause(all);
  },
  publicPosts: (userId: string) => pause(summaries((p) => p.authorId === userId && p.audience === 'public')),
  subscription: () => pause({ price: me?.price ?? 0, subscribers: subscriptions.filter(([, a]) => a === me?.id).length }),
  setPrice: (euros: number) => {
    const cents = Math.round(euros * 100);
    if (!Number.isFinite(cents) || cents < 0 || cents > MAX_PRICE) return Promise.reject(new Error(t.priceMax));
    if (cents > 0 && me && !sellsSubscriptions(planOf(me.id))) return Promise.reject(new Error(t.proOnlySubs));
    if (me) {
      if (cents > 0) me.price = cents;
      else delete me.price;
      const u = users.find((x) => x.id === me!.id);
      if (u) u.price = me.price;
    }
    return mockApi.subscription();
  },
  subscribe: (authorId: string, _consent = false) => {
    if (me && !subscribed(me.id, authorId)) subscriptions.push([me.id, authorId]);
    return pause({ ok: true });
  },
  // no payments in the mock: a subscription ends at once, and there is no purchases log to withdraw from
  unsubscribe: (authorId: string) => {
    const i = subscriptions.findIndex(([s, a]) => s === me?.id && a === authorId);
    if (i >= 0) subscriptions.splice(i, 1);
    return pause<{ ok: boolean; until?: number }>({ ok: true });
  },
  purchases: () => pause<PurchaseEntry[]>([]),
  withdraw: (_purchaseId: string) => Promise.reject<PurchaseEntry[]>(new Error('nothing to withdraw from in the mock')),
  deleteAccount: (_password: string) => {
    const gone = me?.id;
    const i = users.findIndex((u) => u.id === gone);
    if (i >= 0) users.splice(i, 1);
    for (let j = posts.length - 1; j >= 0; j--) if (posts[j].authorId === gone) posts.splice(j, 1);
    if (gone) interestsOf.delete(gone);
    // out of the groups (the server also hands over or deletes the groups they were the last admin of)
    for (const list of [groupMembers, groupInvites, groupBans] as { userId: string }[][]) for (let j = list.length - 1; j >= 0; j--) if (list[j].userId === gone) list.splice(j, 1);
    me = null;
    return pause({ ok: true });
  },
  // the mock has no bucket: a video goes with the post
  uploads: () => pause({ direct: false, partSize: 0 }),
  uploadStart: (_name: string, _size: number, _resume?: { key: string; uploadId: string }) =>
    Promise.reject<{ key: string; uploadId: string; done: { PartNumber: number; ETag: string }[] }>(new Error('no uploads in the mock')),
  uploadParts: (_key: string, _uploadId: string, _parts: number[]) => Promise.reject<{ urls: string[] }>(new Error('no uploads in the mock')),
  uploadFinish: (_key: string, _uploadId: string, _parts: { PartNumber: number; ETag: string }[]) => Promise.reject<{ key: string; size: number }>(new Error('no uploads in the mock')),
  // the mock takes no payments
  confirmPayment: (_session: string) => pause({ ok: true }),
  payouts: () => pause({ enabled: false, live: false, linked: false, ready: false }),
  linkPayouts: () => Promise.reject(new Error('payments are off in the mock')),
  buy: (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post?.paid || !post.price) return Promise.reject(new Error('this post is not sold by itself'));
    if (me && !bought(me.id, postId)) purchases.push([me.id, postId]);
    return pause({ ok: true });
  },
  report: (postId: string, reason: string) => {
    if (me && !reports.some(([p, u]) => p === postId && u === me!.id)) reports.push([postId, me.id, reason]);
    const post = posts.find((p) => p.id === postId);
    if (post && new Set(reports.filter(([p]) => p === postId).map(([, u]) => u)).size >= 3) post.hidden = true;
    return pause({ ok: true });
  },
  myPosts: () => pause(summaries((p) => p.authorId === me?.id && !p.letter)),
  letters: () => pause(summaries((p) => !!p.letter)),
  leaveNote: (postId: string, text: string, recipients: string[]) => {
    if (!me) return Promise.reject(new Error('not signed in'));
    const note: Note = { id: id(), postId, authorId: me.id, text, recipients, seenBy: [], createdAt: Date.now() };
    notes.push(note);
    // a reader finds it a while later, and says so in the conversation
    const first = users.find((u) => u.id === recipients[0]);
    if (first) {
      later(7000, () => enter(postId, first.id));
      later(9500, () => say(postId, first.id, 'Avasin jutun ja löysin sun BoVNoten 📝 Kiitos ❤️'));
    }
    return pause(note);
  },
  seenNote: (noteId: string) => {
    const note = notes.find((x) => x.id === noteId);
    if (note && me && !note.seenBy.includes(me.id)) note.seenBy.push(me.id);
    return pause({ ok: true });
  },
  post: (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!me) {
      // a visitor: a public post only, its conversation read-only (none under a locked one), no one present
      if (!post || !isOpen(post)) return notFound<{ post: Post; messages: Message[]; present: string[]; notes: Note[]; people?: User[] }>('no such post');
      const shown = view(post);
      const said = shown.locked ? [] : messages.filter((m) => m.postId === postId);
      const people = [...new Set([post.authorId, ...said.map((m) => m.userId)])].flatMap((id) => users.filter((u) => u.id === id).map(publicUser));
      return pause({ post: shown, messages: said, present: [] as string[], notes: [] as Note[], people });
    }
    if (!post) return Promise.reject(new Error('Juttua ei löydy.'));
    const whole = !!me && canRead(me.id, post);
    return pause({ post: view(post), messages: whole ? messages.filter((m) => m.postId === postId) : [], present: present(postId), notes: whole ? waiting(postId) : [] });
  },
  publish: (form: FormData) => {
    if (!me) return Promise.reject(new Error('not signed in'));
    const video = form.get('video') as File | null;
    const image = form.get('image') as File | null;
    const kind = form.get('kind') === 'vlog' ? 'vlog' : 'blog';
    const isLetter = form.get('letter') === '1';
    const plan = planOf(me.id);
    const duration = Number(form.get('duration')) || undefined;
    const pictures = form.getAll('pictures') as File[];
    const videoSize = kind === 'vlog' ? video?.size ?? 0 : 0;
    const size = (image?.size ?? 0) + pictures.reduce((s, f) => s + f.size, 0) + new TextEncoder().encode(String(form.get('title')) + String(form.get('body') ?? '')).length;
    if (plan === 'lite' && !isLetter && postedLastDay(me.id, kind) >= (kind === 'blog' ? PLANS.lite.blogsPer24h : PLANS.lite.vlogsPer24h))
      return Promise.reject(new Error(kind === 'blog' ? t.quotaNoneBlog : t.quotaNoneVlog));
    if (plan === 'lite' && kind === 'vlog' && duration && duration > PLANS.lite.vlogMaxSeconds)
      return Promise.reject(new Error(t.vlogTooLong(PLANS.lite.vlogMaxSeconds / 60)));
    const state = planState();
    if (state.used.video + videoSize > state.quota.video) return Promise.reject(new Error(t.storageFullVideo));
    if (state.used.media + size > state.quota.media) return Promise.reject(new Error(t.storageFullMedia));
    const lifeField = form.get('life');
    const life = lifeField === null || lifeField === 'forever' ? null : Number(lifeField);
    if (beyondLite(plan) && life !== null && !LIFE_CHOICES.some((c) => c.ms === life)) return Promise.reject(new Error('choose how long it stays'));
    const paid = form.get('audience') === 'public' && form.get('paid') === '1';
    if (paid && !beyondLite(plan)) return Promise.reject(new Error(t.proOnlyPaid));
    // Exclusive: the post's own price, a blog at most 5 euros, a vlog at most 50 and at least 30 minutes
    let price: number | undefined;
    if (paid && sellsPosts(plan)) {
      price = Math.round(Number(String(form.get('price') ?? '').replace(',', '.')) * 100);
      const max = kind === 'vlog' ? POST_PRICE.vlogMax : POST_PRICE.blogMax;
      if (!Number.isFinite(price) || price <= 0 || price > max) return Promise.reject(new Error(t.postPriceBad(t.euros(max))));
      if (kind === 'vlog' && (duration ?? 0) < POST_PRICE.vlogMinSeconds) return Promise.reject(new Error(t.vlogTooShortPaid(POST_PRICE.vlogMinSeconds / 60)));
    }
    const expiresAt = plan === 'lite' ? Date.now() + liteLife({ kind, letter: isLetter }) : life === null ? null : Date.now() + life;
    const audience = String(form.get('audience'));
    // to a group: one of yours (never public, paid or with topics)
    const groupId = audience === 'group' ? String(form.get('group') ?? '') : undefined;
    if (groupId !== undefined && (!roleIn(groupId, me.id) || groupBans.some((b) => b.groupId === groupId && b.userId === me!.id))) return refused<Post>('no-group');
    const post: Post = {
      id: id(),
      authorId: me.id,
      kind,
      expiresAt,
      size,
      videoSize: videoSize || undefined,
      duration,
      title: String(form.get('title')),
      body: String(form.get('body') ?? ''),
      videoUrl: video && video.size ? URL.createObjectURL(video) : undefined,
      imageUrl: image && image.size ? URL.createObjectURL(image) : undefined,
      pictures: pictures.length ? pictures.map((f) => URL.createObjectURL(f)) : undefined,
      audience: audience === 'friends' || audience === 'public' || audience === 'group' ? audience : JSON.parse(audience),
      ...(groupId ? { groupId, group: { id: groupId, name: groupList.find((g) => g.id === groupId)!.name, kind: groupList.find((g) => g.id === groupId)!.kind } } : {}),
      paid: paid || undefined,
      price,
      letter: form.get('letter') === '1' || undefined,
      createdAt: Date.now(),
    };
    posts.push(post);
    if (post.audience === 'public') {
      const chosen = JSON.parse(String(form.get('topics') ?? '[]')) as unknown[];
      topicsOf.set(post.id, postTopics(chosen.filter(isTopic).slice(0, MAX_POST_TOPICS), post.title, post.body));
    }
    onPosted(post);
    return pause(post);
  },
  // moderation, in memory: the queue from the reports, decisions that do what the server's do (no emails)
  modQueue: () => {
    const ids = [...new Set(reports.map(([p]) => p))];
    const q: ModQueue = {
      posts: ids.flatMap((pid) => {
        const post = posts.find((p) => p.id === pid);
        const author = post && users.find((u) => u.id === post.authorId);
        if (!post || !author) return [];
        const mine = reports.filter(([p]) => p === pid);
        const by: Record<string, number> = {};
        for (const [, , r] of mine) by[r] = (by[r] ?? 0) + 1;
        return [{ post, author, reports: by, notices: [], since: Date.now(), history: decisions.filter((d) => d.postId === pid || d.userId === author.id) }];
      }),
      notices: [],
      complaints: [],
      suspended: [...suspended],
    };
    return pause(q);
  },
  modLog: () => pause([...modLog].reverse()),
  decidePost: (postId: string, action: PostAction, rule: Rule | undefined, reason: string) => {
    const i = posts.findIndex((p) => p.id === postId);
    const post = posts[i];
    if (!post || !me) return refused<Decision>('no such post');
    const d: Decision = { id: id(), action, postId, postTitle: post.title, userId: post.authorId, rule, reason, facts: { reports: {}, notices: {}, hidden: !!post.hidden }, moderator: me.username, createdAt: Date.now() };
    decisions.push(d);
    modLog.push({ at: d.createdAt, moderator: me.username, action, target: post.title, decisionId: d.id, reason });
    for (let r = reports.length - 1; r >= 0; r--) if (reports[r][0] === postId) reports.splice(r, 1);
    if (action === 'remove') posts.splice(i, 1);
    else Object.assign(post, { hidden: false, restricted: action === 'restrict' ? true : action === 'lift' ? false : post.restricted });
    return pause(d);
  },
  suspend: (username: string, rule: Rule, reason: string, until: number | null) => {
    const user = users.find((u) => u.username === normalUsername(username));
    if (!user || !me) return refused<Decision>('no-username');
    const d: Decision = { id: id(), action: 'suspend', userId: user.id, username: user.username, rule, reason, until, facts: { reports: {}, notices: {}, hidden: false }, moderator: me.username, createdAt: Date.now() };
    decisions.push(d);
    suspended.push({ user, rule, reason, until, since: d.createdAt, decisionId: d.id });
    modLog.push({ at: d.createdAt, moderator: me.username, action: 'suspend', target: '@' + user.username, decisionId: d.id, reason });
    return pause(d);
  },
  unsuspend: (userId: string, reason: string) => {
    const i = suspended.findIndex((s) => s.user.id === userId);
    if (i < 0 || !me) return refused<Decision>('not suspended');
    const [s] = suspended.splice(i, 1);
    const d: Decision = { id: id(), action: 'unsuspend', userId, username: s.user.username, reason, facts: { reports: {}, notices: {}, hidden: false }, moderator: me.username, createdAt: Date.now() };
    decisions.push(d);
    modLog.push({ at: d.createdAt, moderator: me.username, action: 'unsuspend', target: '@' + s.user.username, decisionId: d.id, reason });
    return pause(d);
  },
  decideComplaint: (_complaintId: string, _outcome: 'upheld' | 'reversed', _reason: string) => refused<Decision>('no such open complaint'),
  closeNotice: (_noticeId: string, _reason: string) => refused<{ ok: boolean }>('no such open notice'),
  // (the mock sends no email, so there is no link to complain with)
  complaint: (_decisionId: string, _token?: string) => refused<ComplaintPage>('token'),
  complain: (_decisionId: string, _text: string, _token?: string) => refused<ComplaintPage>('token'),
  sendNotice: (_n: { email: string; url: string; reason: Rule; explanation: string; goodFaith: boolean }) => pause({ ok: true }),
  // groups, in memory, by the server's rules (no one else's script: invitations wait for you alone)
  groups: () => {
    const mine = groupList.filter((g) => roleIn(g.id, me?.id)).map(asGroup).sort((a, b) => a.name.localeCompare(b.name));
    const invitations = groupInvites
      .filter((i) => i.userId === me?.id && i.status === 'invited')
      .flatMap((i) => {
        const g = groupList.find((x) => x.id === i.groupId);
        return g ? [{ group: asGroup(g), by: i.by, createdAt: i.createdAt }] : [];
      });
    const toApprove = groupInvites.filter((i) => i.status === 'suggested' && roleIn(i.groupId, me?.id) === 'admin').length;
    return pause<GroupsOverview>({ mine, invitations, toApprove, interest: groupList.filter((g) => g.kind === 'interest').map(asGroup) });
  },
  groupsPending: () =>
    pause({
      invitations: groupInvites.filter((i) => i.userId === me?.id && i.status === 'invited').length,
      toApprove: groupInvites.filter((i) => i.status === 'suggested' && roleIn(i.groupId, me?.id) === 'admin').length,
    }),
  groupSuggestions: () => {
    if (!me) return pause<Group[]>([]);
    const reader = interestsFor(me.id);
    const open = groupList.filter((g) => g.kind === 'interest' && !roleIn(g.id, me!.id) && !groupBans.some((b) => b.groupId === g.id && b.userId === me!.id)).map(asGroup);
    const picked = suggestGroups(open.map((g) => ({ id: g.id, topic: g.topic!, name: g.name, description: g.description ?? '', members: g.members, createdAt: g.createdAt })), reader);
    return pause(picked.map((p) => open.find((g) => g.id === p.id)!));
  },
  searchGroups: (q: string) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return pause(groupList.filter((g) => me && seesGroup(me.id, g.id) && words.length > 0 && words.every((w) => g.name.toLowerCase().includes(w))).map(asGroup));
  },
  createGroup: (g: { kind: GroupKind; name: string; description: string; topic?: TopicId; picture?: File | null }) => {
    if (!me) return refused<Group>('not signed in');
    const name = cleanGroupName(g.name);
    const description = cleanGroupDescription(g.description);
    if (!name) return refused<Group>('group-name');
    if (g.kind === 'interest' && !isTopic(g.topic)) return refused<Group>('topic');
    if (g.kind === 'interest' && !description) return refused<Group>('group-description');
    if (g.kind === 'interest' && groupList.some((x) => x.kind === 'interest' && x.topic === g.topic && x.name.toLowerCase() === name.toLowerCase())) return refused<Group>('group-name-taken');
    const made: MockGroup = { id: id(), kind: g.kind, name, createdAt: Date.now(), ...(description ? { description } : {}), ...(g.kind === 'interest' ? { topic: g.topic } : {}), ...(g.kind === 'friends' && g.picture ? { pictureUrl: URL.createObjectURL(g.picture) } : {}) };
    groupList.push(made);
    groupMembers.push({ groupId: made.id, userId: me.id, role: 'admin', joinedAt: Date.now() });
    return pause(asGroup(made));
  },
  group: (groupId: string) => {
    const g = visibleGroup(groupId);
    return g ? groupPageOf(g) : noGroup();
  },
  updateGroup: (groupId: string, name: string, description: string) => {
    const g = visibleGroup(groupId);
    if (!g || roleIn(g.id, me?.id) !== 'admin') return noGroup();
    if (!cleanGroupName(name)) return refused<GroupPage>('group-name');
    g.name = cleanGroupName(name);
    g.description = cleanGroupDescription(description) || undefined;
    return groupPageOf(g);
  },
  setGroupPicture: (groupId: string, file: File | null) => {
    const g = visibleGroup(groupId);
    if (!g || g.kind !== 'friends' || roleIn(g.id, me?.id) !== 'admin') return noGroup();
    g.pictureUrl = file ? URL.createObjectURL(file) : undefined;
    return groupPageOf(g);
  },
  deleteGroup: (groupId: string) => {
    const g = visibleGroup(groupId);
    if (!g || roleIn(g.id, me?.id) !== 'admin') return refused<{ ok: boolean }>('not-admin');
    deleteMockGroup(g.id);
    return pause({ ok: true });
  },
  inviteToGroup: (groupId: string, who: { username?: string; userId?: string }) => {
    const g = visibleGroup(groupId);
    const role = g && roleIn(g.id, me?.id);
    if (!g || !role || !me || g.kind !== 'friends') return noGroup();
    const other = users.find((u) => u.id === who.userId || u.username === normalUsername(who.username ?? ''));
    if (!other) return refused<GroupPage>('no-username');
    if (!isFriend(me.id, other.id)) return refused<GroupPage>('not-friend');
    if (roleIn(g.id, other.id)) return refused<GroupPage>('member');
    const had = groupInvites.find((i) => i.groupId === g.id && i.userId === other.id);
    if (!had) groupInvites.push({ groupId: g.id, userId: other.id, by: me.id, status: role === 'admin' ? 'invited' : 'suggested', createdAt: Date.now() });
    else if (role === 'admin') had.status = 'invited';
    return groupPageOf(g);
  },
  groupInvite: (groupId: string, userId: string, action: 'approve' | 'cancel') => {
    const g = visibleGroup(groupId);
    if (!g || roleIn(g.id, me?.id) !== 'admin') return noGroup();
    const i = groupInvites.findIndex((x) => x.groupId === g.id && x.userId === userId);
    if (i < 0) return refused<GroupPage>('no such invitation');
    if (action === 'approve') groupInvites[i].status = 'invited';
    else groupInvites.splice(i, 1);
    return groupPageOf(g);
  },
  acceptInvite: (groupId: string) => {
    const i = groupInvites.findIndex((x) => x.groupId === groupId && x.userId === me?.id && x.status === 'invited');
    const g = groupList.find((x) => x.id === groupId);
    if (i < 0 || !g || !me) return noGroup();
    groupInvites.splice(i, 1);
    groupMembers.push({ groupId, userId: me.id, role: 'member', joinedAt: Date.now() });
    return groupPageOf(g);
  },
  declineInvite: (groupId: string) => {
    const i = groupInvites.findIndex((x) => x.groupId === groupId && x.userId === me?.id && x.status === 'invited');
    if (i >= 0) groupInvites.splice(i, 1);
    return pause({ ok: true });
  },
  joinGroup: (groupId: string) => {
    const g = visibleGroup(groupId);
    if (!g || !me) return noGroup();
    if (g.kind !== 'interest') return refused<GroupPage>('not-interest-group');
    if (groupBans.some((b) => b.groupId === g.id && b.userId === me!.id)) return refused<GroupPage>('banned');
    if (!roleIn(g.id, me.id)) groupMembers.push({ groupId: g.id, userId: me.id, role: 'member', joinedAt: Date.now() });
    return groupPageOf(g);
  },
  leaveGroup: (groupId: string, opts: { successor?: string; delete?: boolean } = {}) => {
    const g = visibleGroup(groupId);
    const role = g && roleIn(g.id, me?.id);
    if (!g || !role || !me) return refused<{ ok: boolean; deleted?: boolean }>('not-member');
    const others = groupMembers.filter((m) => m.groupId === g.id && m.userId !== me!.id).sort((a, b) => a.joinedAt - b.joinedAt);
    if (role === 'admin' && !others.some((m) => m.role === 'admin')) {
      const next = others.find((m) => m.userId === opts.successor) ?? (g.kind === 'interest' && !opts.successor ? others[0] : undefined);
      if (next) next.role = 'admin';
      else if (opts.delete) {
        deleteMockGroup(g.id);
        return pause<{ ok: boolean; deleted?: boolean }>({ ok: true, deleted: true });
      } else return refused<{ ok: boolean; deleted?: boolean }>('last-admin');
    }
    groupMembers.splice(groupMembers.findIndex((m) => m.groupId === g.id && m.userId === me!.id), 1);
    return pause<{ ok: boolean; deleted?: boolean }>({ ok: true });
  },
  groupMember: (groupId: string, userId: string, action: 'remove' | 'admin' | 'ban' | 'unban') => {
    const g = visibleGroup(groupId);
    if (!g || roleIn(g.id, me?.id) !== 'admin' || userId === me?.id) return noGroup();
    const m = groupMembers.find((x) => x.groupId === g.id && x.userId === userId);
    if (m?.role === 'admin' && (action === 'remove' || action === 'ban')) return refused<GroupPage>('admin');
    if (action === 'admin' && m) m.role = 'admin';
    if ((action === 'remove' || action === 'ban') && m) groupMembers.splice(groupMembers.indexOf(m), 1);
    if (action === 'ban' && g.kind === 'interest') groupBans.push({ groupId: g.id, userId });
    if (action === 'unban') groupBans.splice(0, groupBans.length, ...groupBans.filter((b) => !(b.groupId === g.id && b.userId === userId)));
    return groupPageOf(g);
  },
  removeGroupPost: (groupId: string, postId: string) => {
    const g = visibleGroup(groupId);
    if (!g || roleIn(g.id, me?.id) !== 'admin') return noGroup();
    const i = posts.findIndex((p) => p.id === postId && p.groupId === g.id);
    if (i >= 0) posts.splice(i, 1);
    return groupPageOf(g);
  },
};

export const mockLive = {
  listen(l: (e: ServerEvent) => void) {
    listener = l;
  },
  emit(e: ClientEvent) {
    if (e.type === 'join') onJoin(e.postId);
    if (e.type === 'leave' && me) exit(e.postId, me.id);
    if (e.type === 'say') onSay(e.postId, e.text);
  },
  stop() {
    timers.splice(0).forEach(clearTimeout);
    scripted.clear();
    rooms.clear();
    me = null;
  },
};
