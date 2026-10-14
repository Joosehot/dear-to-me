// Who moderates: D2M_MODERATORS, a comma-separated list of usernames (an @ before one, spaces and any
// case are fine). In demo mode without it, @joose moderates, so the demo can be tried. Every
// /api/mod/* endpoint asks the server, never the client.

import { normalUsername, usernameProblem } from '../shared/usernames.js';

/** The moderators' usernames, normalised; the entries that are not usernames at all are left out. */
export function parseModerators(env: string | undefined, demo: boolean): Set<string> {
  if (!env?.trim()) return new Set(demo ? ['joose'] : []);
  return new Set(
    env
      .split(',')
      .map((u) => normalUsername(u))
      .filter((u) => u && !usernameProblem(u)),
  );
}
