import { useState, type ReactNode } from 'react';
import { t } from '../text';
import { signInHref } from '../nav';
import { Icon } from './Icon';
import { LangSwitch } from './LangSwitch';

// The public pages (a public profile, a public post) for a visitor who is not signed in: the same
// pages as for everyone else, in a light frame, with the way in wherever an account is needed.

/** The frame: the brand (its heart alone on a phone), the language, and the way in (back to this
 * page afterwards). No tabs. `banner`: above it all (a closed beta's). */
export function PublicShell({ wide, banner, children }: { wide?: boolean; banner?: ReactNode; children: ReactNode }) {
  return (
    <>
      {banner}
      <header className="top public-top">
        <a className="brand" href="/" aria-label={t.app}>
          <Icon name="heart" size={26} className="brand-mark" /> <span className="brand-name">{t.app}</span>
        </a>
        <div className="public-actions">
          <LangSwitch />
          <a className="button" href={signInHref('login')}>
            {t.landing.signIn}
          </a>
          <a className="button primary" href={signInHref('signup')}>
            {t.join}
          </a>
        </div>
      </header>
      <main className={wide ? 'wide' : 'grid-page'}>{children}</main>
    </>
  );
}

/** "Sign in or join to …", with both ways in; either comes back to this page. */
export function JoinPrompt({ action }: { action: string }) {
  return (
    <div className="join-prompt" role="note">
      <p>{t.joinTo(action)}</p>
      <div className="row">
        <a className="button primary" href={signInHref('login')}>
          {t.landing.signIn}
        </a>
        <a className="button" href={signInHref('signup')}>
          {t.join}
        </a>
      </div>
    </div>
  );
}

/** The button of something that needs an account, for a visitor who is not signed in: it looks as it
 * does for everyone, and clicked it tells what an account is needed for, with the way in. */
export function NeedsAccount({ label, action, className = 'primary' }: { label: ReactNode; action: string; className?: string }) {
  const [asked, setAsked] = useState(false);
  if (asked) return <JoinPrompt action={action} />;
  return (
    <button className={className} onClick={() => setAsked(true)}>
      {label}
    </button>
  );
}

/** A profile or post that is not there, or not public: the same for both, so nothing is told about it. */
export function NotPublic() {
  return (
    <div className="not-public">
      <h1>{t.notPublicTitle}</h1>
      <p className="hint">{t.notPublicText}</p>
      <div className="row">
        <a className="button" href="/">
          {t.notPublicHome}
        </a>
        <a className="button primary" href="/signup">
          {t.signUpButton}
        </a>
      </div>
    </div>
  );
}

/** The readable page the server drew for the address the site was opened at (a public profile or
 * post), taken before the app starts: it stays on screen while the page's own data loads, so the
 * content does not blink away. */
const drawn = (() => {
  const html = document.getElementById('root')?.querySelector(':scope > .prerender')?.outerHTML;
  return html ? { path: location.pathname, html } : undefined;
})();

/** While a page loads: the server's readable version of it, if it drew this one, or "…". */
export function Waiting() {
  // (the server's own HTML, its text already escaped there)
  if (drawn && location.pathname === drawn.path) return <div className="prerendered" dangerouslySetInnerHTML={{ __html: drawn.html }} />;
  return <p className="quiet">…</p>;
}
