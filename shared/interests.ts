// The rules of interests and of the For You order. Every number of them lives here.
//
// The rest (shared/topics.ts reads topics from words, shared/foryou.ts judges and orders the posts)
// reads these; nothing hardcodes a number elsewhere, so every decision traces back to the rule that
// asked for it. No training, no learning: the same posts and the same interests give the same order.

// ---------------- the topics ----------------

/** The fixed topics, in the order they are shown. */
export const TOPIC_IDS = ['food', 'travel', 'nature', 'music', 'books', 'sport', 'art', 'technology', 'games', 'film', 'wellbeing', 'family'] as const;
export type TopicId = (typeof TOPIC_IDS)[number];

export interface Topic {
  id: TopicId;
  emoji: string;
  fi: string;
  en: string;
  /** Word stems, each language. A stem matches a word that starts with it (Finnish inflects at the
   * end: "metsä" finds "metsässä", "metsi" finds "metsiin"); a stem at least INNER_STEM_MIN long
   * also matches inside a compound word ("leipä" in "ruisleipää"); one shorter than
   * PREFIX_STEM_MIN matches only the whole word ("art", "tv"). Written as the normaliser leaves
   * them: lowercase, ä and ö kept. */
  stems: { fi: string[]; en: string[] };
}

export const TOPICS: Topic[] = [
  {
    id: 'food', emoji: '🍳', fi: 'ruoka', en: 'food',
    stems: {
      fi: ['ruok', 'ruoa', 'ruoi', 'resept', 'leipo', 'leivo', 'leipä', 'leivä', 'leiva', 'ruis', 'juures', 'taikin', 'kakku', 'kakun', 'keitto', 'keito', 'kokka', 'kokkaa', 'paist', 'uuni', 'jauho', 'pulla', 'herkku', 'herku', 'illalli', 'lounas', 'lounaa', 'aamiai', 'mauste', 'kastike', 'kahvi', 'jälkiru', 'salaat', 'grilla', 'keittiö', 'syömä', 'syödä'],
      en: ['food', 'recipe', 'bake', 'baking', 'bread', 'cook', 'dough', 'dinner', 'lunch', 'breakfast', 'meal', 'kitchen', 'flour', 'sourdough', 'cake', 'soup', 'coffee', 'dessert', 'salad', 'grill', 'tasty', 'spice'],
    },
  },
  {
    id: 'travel', emoji: '🧳', fi: 'matkat', en: 'travel',
    stems: {
      fi: ['matka', 'matko', 'matkust', 'reissu', 'reissa', 'lento', 'lennol', 'lomal', 'lomaa', 'lomail', 'ulkomail', 'hotell', 'hostel', 'retki', 'retke', 'vaellu', 'vaelta', 'junamatk', 'interrail', 'turist', 'nähtävyy', 'kaupunkiloma', 'lofoot'],
      en: ['travel', 'trip', 'journey', 'flight', 'holiday', 'vacation', 'abroad', 'hotel', 'hostel', 'tourist', 'backpack', 'roadtrip', 'sightsee'],
    },
  },
  {
    id: 'nature', emoji: '🌲', fi: 'luonto', en: 'nature',
    stems: {
      fi: ['luonto', 'luonno', 'luontee', 'metsä', 'metsi', 'järvi', 'järve', 'meri', 'meren', 'merel', 'tunturi', 'lintu', 'linnu', 'lintuj', 'kasvi', 'sieni', 'sienes', 'sienie', 'marja', 'eläim', 'eläin', 'puita', 'puiden', 'kukka', 'kukki', 'vuori', 'vuore', 'vuorel', 'erämaa', 'kansallispuist', 'leirin', 'teltta', 'teltas'],
      en: ['nature', 'forest', 'woods', 'lake', 'sea', 'mountain', 'bird', 'plant', 'mushroom', 'berry', 'berries', 'animal', 'tree', 'flower', 'wild', 'hiking', 'hike', 'camping', 'tent'],
    },
  },
  {
    id: 'music', emoji: '🎵', fi: 'musiikki', en: 'music',
    stems: {
      fi: ['musiik', 'musiki', 'laulu', 'laula', 'laulo', 'biisi', 'bändi', 'keikka', 'keika', 'konsert', 'kitar', 'piano', 'rumpu', 'rumpal', 'levy', 'soitto', 'soita', 'soitin', 'kuoro', 'sävel', 'festivaal'],
      en: ['music', 'song', 'singing', 'singer', 'band', 'gig', 'concert', 'guitar', 'piano', 'drum', 'album', 'record', 'choir', 'melody', 'festival'],
    },
  },
  {
    id: 'books', emoji: '📚', fi: 'kirjat', en: 'books',
    stems: {
      fi: ['kirja', 'kirjo', 'kirjasto', 'romaan', 'runo', 'runoj', 'novelli', 'lukemi', 'lukija', 'luin', 'tarina', 'kertomu', 'dekkari', 'sarjaku', 'kirjailij', 'sanaa', 'sanat'],
      en: ['book', 'novel', 'poem', 'poetry', 'library', 'reading', 'reader', 'writing', 'write', 'writer', 'author', 'story', 'stories', 'chapter', 'comic'],
    },
  },
  {
    id: 'sport', emoji: '⚽', fi: 'urheilu', en: 'sport',
    stems: {
      fi: ['urheil', 'juoks', 'juoksu', 'juosta', 'jalkapallo', 'jääkiekko', 'kiekko', 'hiihto', 'hiihd', 'hiihtä', 'pyöräil', 'uinti', 'uima', 'kuntosal', 'salil', 'treeni', 'treena', 'harjoitu', 'maraton', 'ottelu', 'joukkue', 'pelaaja', 'kilpailu', 'sulkapallo', 'tennis', 'golf', 'kiipeil'],
      en: ['sport', 'running', 'run', 'football', 'soccer', 'hockey', 'ski', 'skiing', 'cycling', 'bike', 'swim', 'gym', 'workout', 'training', 'marathon', 'match', 'team', 'tennis', 'golf', 'climbing'],
    },
  },
  {
    id: 'art', emoji: '🎨', fi: 'taide', en: 'art',
    stems: {
      fi: ['taide', 'taitee', 'taitei', 'taiteil', 'maalau', 'maalaa', 'maalasi', 'piirus', 'piirtä', 'piirsi', 'valokuva', 'näyttely', 'galleria', 'museo', 'veistos', 'keramiik', 'käsityö', 'neulo', 'virkka', 'ompel', 'teatteri', 'tanssi', 'design'],
      en: ['art', 'arts', 'artist', 'painting', 'paint', 'drawing', 'draw', 'photograph', 'exhibition', 'gallery', 'museum', 'sculpture', 'ceramic', 'craft', 'knit', 'sewing', 'theatre', 'theater', 'dance', 'design'],
    },
  },
  {
    id: 'technology', emoji: '💻', fi: 'teknologia', en: 'technology',
    stems: {
      fi: ['tekniik', 'teknolog', 'tietokone', 'kone', 'ohjelmoi', 'ohjelmisto', 'koodi', 'koodaa', 'sovellu', 'puhelin', 'puhelim', 'äly', 'tekoäly', 'robot', 'netti', 'internet', 'digi', 'laite', 'laitte', 'sähköaut', 'elektroniik'],
      en: ['tech', 'technology', 'computer', 'software', 'code', 'coding', 'programming', 'app', 'apps', 'phone', 'internet', 'robot', 'digital', 'gadget', 'electronic', 'ai'],
    },
  },
  {
    id: 'games', emoji: '🎮', fi: 'pelit', en: 'games',
    stems: {
      fi: ['peli', 'pelej', 'pelaa', 'pelas', 'videopel', 'lautapel', 'konsoli', 'shakki', 'shaki', 'roolipel', 'korttipel', 'pelikone'],
      en: ['game', 'gaming', 'gamer', 'videogame', 'console', 'chess', 'boardgame', 'puzzle', 'esport'],
    },
  },
  {
    id: 'film', emoji: '🎞️', fi: 'elokuvat', en: 'film',
    stems: {
      fi: ['elokuv', 'leffa', 'leffo', 'sarja', 'elokuvateatter', 'ohjaaja', 'näyttelijä', 'dokument', 'trailer', 'tv'],
      en: ['film', 'movie', 'cinema', 'series', 'director', 'actor', 'actress', 'documentary', 'trailer', 'tv', 'netflix'],
    },
  },
  {
    id: 'wellbeing', emoji: '🧘', fi: 'hyvinvointi', en: 'wellbeing',
    stems: {
      fi: ['hyvinvoin', 'jaksami', 'jaksa', 'uni', 'unen', 'unta', 'nukku', 'nukui', 'nukah', 'stressi', 'stressa', 'mieliala', 'mielenterv', 'mielenrauh', 'jooga', 'meditoi', 'meditaat', 'terveys', 'tervey', 'lepo', 'levät', 'rauha', 'hiljaisuu', 'hiljaa', 'kiire', 'uupu', 'rutiini', 'aamurutiini', 'sauna', 'hengit'],
      en: ['wellbeing', 'wellness', 'sleep', 'stress', 'mindful', 'yoga', 'meditat', 'health', 'calm', 'quiet', 'burnout', 'routine', 'habit', 'sauna', 'breath'],
    },
  },
  {
    id: 'family', emoji: '👪', fi: 'perhe', en: 'family',
    stems: {
      fi: ['perhe', 'perhee', 'lapsi', 'lapse', 'lasta', 'lapsu', 'vauva', 'äiti', 'äidi', 'isä', 'isän', 'isoäiti', 'isoäidi', 'isoisä', 'mummo', 'mummu', 'pappa', 'vaari', 'sisko', 'veli', 'velje', 'serkku', 'raskau', 'synnyty', 'vanhemmu', 'kotona', 'muutto', 'muutettiin'],
      en: ['family', 'child', 'children', 'kid', 'baby', 'mother', 'mum', 'mom', 'father', 'dad', 'grandmother', 'grandma', 'grandfather', 'grandpa', 'sister', 'brother', 'cousin', 'parent', 'pregnan', 'home'],
    },
  },
];

// ---------------- the words ----------------

/** A stem shorter than this matches only the whole word ("tv", "art", "sea"), not its start. */
export const PREFIX_STEM_MIN = 4;
/** A stem at least this long also matches inside a compound word ("leipä" in "ruisleipää"). */
export const INNER_STEM_MIN = 5;

/** A post carries this many topics at most, chosen or read. */
export const MAX_POST_TOPICS = 3;
/** A word in the title counts this many times (a title says what the post is about). */
export const TITLE_WEIGHT = 2;
/** A topic is read from a post's words when its hits (title ones weighed by TITLE_WEIGHT) reach this. */
export const READ_MIN_SCORE = 2;

/** A person's own free words, at most. */
export const MAX_FREE_WORDS = 10;
/** A free word is at least this long (shorter ones would match nearly everything) and at most the other. */
export const FREE_WORD_MIN = 3;
export const FREE_WORD_MAX = 30;

// ---------------- the judges ----------------
// Each scores one aspect of a post in 0..1, and never sees where it came from.

/** interest: a topic the reader chose, carried by the post as its author chose it. */
export const TRUST_CHOSEN = 1;
/** interest: the same, but the topic was read from the post's words (less sure). */
export const TRUST_READ = 0.7;
/** interest: what one of the reader's own words found in the post adds (several add up, to 1). */
export const FREE_WORD_HIT = 0.5;

/** freshness: a post this many hours old scores half, twice that a quarter. */
export const HALF_LIFE_HOURS = 24;

/** conversation: this many messages score half; each more adds less (m / (m + TALK_HALF)). */
export const TALK_HALF = 5;

/** The judges' weights when the reader has interests. They sum to 1. */
export const WEIGHTS = { interest: 0.55, freshness: 0.25, conversation: 0.15, friend: 0.05 } as const;
/** With no interests chosen: freshness and conversation only, as For You ordered before. */
export const WEIGHTS_NO_INTERESTS = { interest: 0, freshness: 0.65, conversation: 0.35, friend: 0 } as const;
export type JudgeName = keyof typeof WEIGHTS;

/** A judge "carried" a post (named in its trace) when it gave at least this share of its score. */
export const CARRY_SHARE = 0.25;
/** The trace names at most this many judges. */
export const TRACE_JUDGES = 2;

// ---------------- the beam ----------------

/** For You returns this many posts at most (one page). */
export const PAGE_SIZE = 30;
/** Within the page, one author has at most this many posts (while others are left to show). */
export const MAX_PER_AUTHOR = 3;
/** Orders kept at each step of the beam. */
export const BEAM_WIDTH = 4;
/** A place lower on the page is worth this much of the one above it (the top is seen first). */
export const POSITION_DISCOUNT = 0.9;

// ---------------- search by topic ----------------

/** A topic's page: its newest public posts, at most. */
export const TOPIC_POSTS_MAX = 30;
/** And the people who write about it most, at most. */
export const TOPIC_WRITERS_MAX = 10;

// ---------------- interest groups suggested on For You ----------------
// A small strip above the posts, never mixed into them: open interest groups the reader is not in
// (nor banned from), matched to their interests as the interest judge matches a post. No interests
// chosen: no suggestions (nothing to match). Among equal matches, more members first, then the newer.

/** For You suggests this many interest groups at most. */
export const GROUP_SUGGESTIONS = 3;
/** A group whose topic is one of the reader's topics: this much. */
export const GROUP_TOPIC_MATCH = 1;
/** Each of the reader's own words found in a group's name or description: this much (several add up, to 1). */
export const GROUP_WORD_HIT = 0.5;
/** A group is suggested when its match (the topic and the words together, as either-or) reaches this. */
export const GROUP_SUGGEST_MIN = 0.5;
