import { t } from '../text';

// A blog's text with pictures and GIFs among its paragraphs: a paragraph that is only a marker,
// "[kuva 2]" (or "[picture 2]"), is the post's second picture, shown there. Pictures no marker
// names come after the text.

const MARKER = /^\[(?:kuva|picture) (\d+)\]$/i;

export const paragraphs = (body: string) => body.split(/\n\s*\n/);

/** The picture a paragraph stands for (1-based), or 0 if it is text. */
export function pictureOf(para: string) {
  const m = MARKER.exec(para.trim());
  return m ? Number(m[1]) : 0;
}

/** The first paragraph that is text: a card's excerpt. */
export const excerpt = (body: string) => paragraphs(body).find((p) => p.trim() && !pictureOf(p)) ?? '';

export function Prose({ body, pictures = [] }: { body: string; pictures?: string[] }) {
  const paras = paragraphs(body);
  const placed = new Set(paras.map(pictureOf).filter(Boolean));
  return (
    <div className="prose">
      {paras.map((para, i) => {
        const n = pictureOf(para);
        if (!n) return <p key={i}>{para}</p>;
        const url = pictures[n - 1];
        return url ? <img key={i} className="prose-picture" src={url} alt={t.pictureAlt(n)} loading="lazy" /> : null;
      })}
      {pictures.map((url, i) => (placed.has(i + 1) ? null : <img key={`rest${i}`} className="prose-picture" src={url} alt={t.pictureAlt(i + 1)} loading="lazy" />))}
    </div>
  );
}
