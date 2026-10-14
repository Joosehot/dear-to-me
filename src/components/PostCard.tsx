import type { PostSummary, User } from '../../shared/types';
import { t } from '../text';
import { excerpt as firstText } from './Prose';
import { usePeople } from '../nav';
import { Avatar, Faces } from './Avatar';
import { lifeLabel } from './Life';
import { Icon, rich } from './Icon';
import { Handle } from './Username';
import { BecauseLine } from './Topics';

/** A post in a list: the feed, or someone's own place (`me` null: a public profile, for a visitor who is not signed in). */
export function PostCard({ post: p, me, showAuthor = true }: { post: PostSummary; me: User | null; showAuthor?: boolean }) {
  const people = usePeople();
  const author = people.get(p.authorId);
  const live = p.present.length > 0;
  const excerpt = firstText(p.body);
  const to = p.letter && Array.isArray(p.audience) ? people.get(p.audience[0]) : undefined;
  const audience = p.letter
    ? t.letterFor(p.audience[0] === me?.id ? t.toYou : to?.name ?? '')
    : p.audience === 'public'
      ? p.paid
        ? p.price
          ? t.priceBadge(t.euros(p.price))
          : t.paidBadge
        : t.public
      : p.audience === 'friends'
      ? t.forAll
      : p.audience === 'group'
        ? t.groups.to(p.group?.name ?? '')
        : t.forSome(p.audience.length);
  const meta = (
    <>
      {rich(p.kind === 'vlog' ? `🎥 ${t.vlog}` : `✍️ ${t.blog}`)} · {t.ago(Date.now() - p.createdAt)} · {rich(audience)} · {rich(lifeLabel(p, author))}
    </>
  );
  return (
    <a className="card" href={`/post/${p.id}`}>
      <div className="card-head">
        {showAuthor ? (
          <>
            <Avatar user={author} />
            <div>
              <div className="name">
                {author && author.id === me?.id ? `${author?.name} (${t.you})` : author?.name} <Handle user={author} />
              </div>
              <div className="meta">{meta}</div>
            </div>
          </>
        ) : (
          <div className="meta">{meta}</div>
        )}
        {live && (
          <span className="live-pill">
            <span className="dot" /> {t.liveNow}
          </span>
        )}
      </div>
      {p.notesForMe > 0 && <div className="note-badge">{rich(t.bovNoteForYou)}</div>}
      {p.imageUrl && <img className="card-cover" src={p.imageUrl} alt="" loading="lazy" />}
      <h2>{p.title}</h2>
      {p.videoUrl && <video className="card-video" src={p.videoUrl} muted preload="metadata" />}
      {excerpt && <p className="excerpt">{excerpt}</p>}
      {p.because && <BecauseLine because={p.because} />}
      <div className="card-foot">
        <span><Icon name="bubble" /> {t.comments(p.messageCount)}</span>
        {live && <Faces users={p.present.map((id) => people.get(id))} live />}
        <span className="more">{t.readMore} →</span>
      </div>
    </a>
  );
}
