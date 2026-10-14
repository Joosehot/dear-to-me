import type { Post, User } from '../../shared/types';
import { beyondLite } from '../../shared/plans';
import { t } from '../text';

/** How long a post stays: disappears (Lite), goes to the archive (the paid plans), permanent, or archived. */
export function lifeLabel(post: Post, author: User | undefined) {
  if (post.archived || (post.expiresAt != null && post.expiresAt <= Date.now())) return t.archived;
  if (post.expiresAt == null) return t.permanent;
  const left = t.inTime(post.expiresAt - Date.now());
  return beyondLite(author?.plan ?? 'lite') ? t.archivesIn(left) : t.goesIn(left);
}
