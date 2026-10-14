import { useEffect } from 'react';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { LEGAL_DRAFT, LEGAL_PAGES, legal, type LegalPage } from '../legal';
import { t } from '../text';

/** Text with its [placeholders] marked, so the owner sees at a glance what is still to fill, and its
 * {words|/path} as links to a page of the site. */
function marked(text: string) {
  return text.split(/(\[[^\]]+\]|\{[^|}]+\|\/[^}]*\})/).map((part, i) => {
    if (part.startsWith('[') && part.endsWith(']')) return <mark className="legal-ph" key={i}>{part}</mark>;
    const link = /^\{([^|}]+)\|(\/[^}]*)\}$/.exec(part);
    return link ? <a key={i} href={link[2]}>{link[1]}</a> : part;
  });
}

/** Small links to every legal page (the landing page's footer, the bottom of My place). */
export function LegalLinks() {
  const L = legal();
  return (
    <nav className="legal-links" aria-label={L.docs.terms.title}>
      {LEGAL_PAGES.map((p) => (
        <a key={p} href={`/${p}`}>
          {L.labels[p]}
        </a>
      ))}
    </nav>
  );
}

/** One legal page. Signed-out visitors get it `standalone`, with the brand and the language switch above. */
export function Legal({ doc, standalone }: { doc: LegalPage; standalone?: boolean }) {
  const L = legal();
  const d = L.docs[doc];
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [doc]);

  const page = (
    <article className="legal">
      {LEGAL_DRAFT && (
        <p className="legal-draft" role="note">
          {L.draft}
        </p>
      )}
      <h1>{d.title}</h1>
      <p className="legal-lead">{marked(d.lead)}</p>
      <p className="hint">{marked(L.effective)}</p>
      {d.sections.map((s, i) => (
        <section key={i}>
          <h2>{s.title}</h2>
          {s.body.map((b, j) =>
            typeof b === 'string' ? (
              <p key={j}>{marked(b)}</p>
            ) : (
              <ul key={j}>
                {b.map((x, k) => (
                  <li key={k}>{marked(x)}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
      <LegalLinks />
    </article>
  );

  if (!standalone) return page;
  return (
    <div className="legal-standalone">
      <header className="landing-top">
        <a className="brand" href="/">
          <Icon name="heart" size={26} className="brand-mark" /> {t.app}
        </a>
        <div className="landing-top-right">
          <LangSwitch />
          <a className="ghost-pill" href="/">
            {L.back}
          </a>
        </div>
      </header>
      {page}
    </div>
  );
}
