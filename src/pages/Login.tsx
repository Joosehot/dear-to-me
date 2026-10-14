import { useEffect, useState } from 'react';
import type { Config, User } from '../../shared/types';
import { api, type ApiError } from '../api';
import { t } from '../text';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { UsernameField, useUsernameCheck } from '../components/Username';
import { normalUsername, usernameBase, usernameProblem } from '../../shared/usernames';

/** Sign in with an email and a password, or make an account; one switch between the two. */
/** `onSignedIn`: the user, and whether the account was made just now. */
export function Login({ signUp = false, onSignedIn }: { signUp?: boolean; onSignedIn: (u: User, signedUp: boolean) => void }) {
  const [up, setUp] = useState(signUp);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  // until the username is typed in, it follows the name (a suggestion made from it)
  const [ownUsername, setOwnUsername] = useState(false);
  const check = useUsernameCheck(up ? username : '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  // a closed beta's invite code (the field shows only when the server asks for one)
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // a suspended account: why, until when, and the way to complain
  const [suspended, setSuspended] = useState<{ reason: string; until: number | null; complaint?: string } | null>(null);
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    api.config().then(setConfig).catch(() => setError(t.noServer));
  }, []);

  const switchTo = (toUp: boolean) => {
    setUp(toUp);
    setError('');
    // (the page to come back to afterwards, ?next=, stays)
    history.replaceState(null, '', (toUp ? '/signup' : '/login') + location.search);
  };

  const submit = () => {
    setBusy(true);
    setError('');
    setSuspended(null);
    (up ? api.signUp(name, username, email, password, terms, config?.invite ? invite : undefined) : api.login(email, password))
      .then((u) => onSignedIn(u, up))
      // the server's code in the reader's language; a network failure has none
      .catch((e: ApiError) => {
        if (e.code === 'suspended') setSuspended({ reason: String(e.data.reason ?? ''), until: typeof e.data.until === 'number' ? e.data.until : null, complaint: typeof e.data.complaint === 'string' ? e.data.complaint : undefined });
        else setError((e.code && t.authErrors[e.code]) || (e.status ? e.message : t.noServer));
      })
      .finally(() => setBusy(false));
  };

  const usernameOk = !usernameProblem(normalUsername(username)) && check?.available !== false;
  const ready = !!email.trim() && !!password && (!up || (!!name.trim() && usernameOk && terms && password.length >= 10 && (!config?.invite || !!invite.trim())));

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand big">
          <Icon name="heart" size={40} className="brand-mark" /> {t.app}
        </div>
        <p className="tagline">{t.tagline}</p>
        <h2>{up ? t.signUpTitle : t.signInTitle}</h2>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !busy) submit();
          }}
        >
          {up && (
            <label>
              {t.nameLabel}
              <input
                id="auth-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!ownUsername) setUsername(e.target.value.trim() ? usernameBase(e.target.value) : '');
                }}
                placeholder={t.namePlaceholder}
                maxLength={40}
                autoComplete="nickname"
                required
              />
              <span className="hint">{t.nameHint}</span>
            </label>
          )}
          {up && (
            <label>
              {t.usernameLabel}
              <UsernameField
                id="auth-username"
                value={username}
                onChange={(v) => {
                  setUsername(v);
                  setOwnUsername(true);
                }}
                check={check}
                hint={t.usernameHint}
              />
            </label>
          )}
          <label>
            {t.emailLabel}
            <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={up ? 'email' : 'username'} required />
          </label>
          <label>
            {t.passwordLabel}
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={up ? 'new-password' : 'current-password'}
              minLength={up ? 10 : undefined}
              maxLength={200}
              required
            />
            {up && <span className="hint">{t.passwordHint}</span>}
          </label>
          {!up && (
            <a className="hint forgot-link" href="/forgot">
              {t.forgotLink}
            </a>
          )}
          {up && config?.invite && (
            <label>
              {t.inviteLabel}
              <input id="auth-invite" value={invite} onChange={(e) => setInvite(e.target.value)} autoComplete="off" maxLength={100} required />
              <span className="hint">{t.inviteHint}</span>
            </label>
          )}
          {up && (
            <label className="check">
              <input id="auth-terms" type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
              <span>
                {t.acceptTerms.before}
                <a href="/terms" target="_blank" rel="noopener">{t.acceptTerms.terms}</a>
                {t.acceptTerms.and}
                <a href="/privacy" target="_blank" rel="noopener">{t.acceptTerms.privacy}</a>
                {t.acceptTerms.after}
              </span>
            </label>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          {suspended && (
            <div className="error suspended-notice" role="alert">
              <p>{t.suspendedLogin(suspended.reason, suspended.until)}</p>
              {suspended.complaint && <a href={suspended.complaint}>{t.suspendedComplain}</a>}
            </div>
          )}
          <button type="submit" className="primary" disabled={!ready || busy}>
            {up ? t.signUpButton : t.signInButton}
          </button>
        </form>
        <button className="ghost auth-switch" onClick={() => switchTo(!up)}>
          {up ? t.toSignIn : t.toSignUp}
        </button>
        {!up && config?.demo && config.demoEmails && (
          <div className="demo-hint">
            <p className="hint">{t.demoHint(config.demoPassword ?? '')}</p>
            <div className="demo-people">
              {config.demoEmails.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setEmail(m);
                    setPassword(config.demoPassword ?? '');
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
        <LangSwitch />
      </div>
    </div>
  );
}
