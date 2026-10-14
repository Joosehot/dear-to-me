// Groups: the limits of a group's name and description, read by the server and the client alike.
// (The numbers of the For You suggestions are in shared/interests.ts, with the other rules of interests.)

/** A group's name: 1 to this many characters (trimmed). */
export const GROUP_NAME_MAX = 60;
/** A group's description: at most this many characters. */
export const GROUP_DESCRIPTION_MAX = 500;
/** The Groups page lists this many interest groups at most; a search finds this many. */
export const GROUP_LIST_MAX = 200;
export const GROUP_SEARCH_MAX = 20;

/** A name as kept: trimmed, inner whitespace one space, at most GROUP_NAME_MAX ('' when there is none). */
export const cleanGroupName = (x: unknown) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, GROUP_NAME_MAX) : '');

/** A description as kept: trimmed, at most GROUP_DESCRIPTION_MAX. */
export const cleanGroupDescription = (x: unknown) => (typeof x === 'string' ? x.trim().slice(0, GROUP_DESCRIPTION_MAX) : '');
