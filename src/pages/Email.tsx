import { useEffect, useState, type ReactNode } from 'react';
import type { User } from '../../shared/types';
import { api, type ApiError } from '../api';
import { t } from '../text';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';

// The pages a link by email leads to, signed in or not: asking for a new password, setting it, and
// confirming an address. Each is a card like the sign-in form's.

/** The words for an error the server gave (its code), or its message; a network failure has neither. */
export const errorText = (e: ApiError) => (e.code && t.authErrors[e.code]) || (e.status ? e.message : t.noServer);

/** The link's token, taken out of the address (it stays out of the history and of any shared screenshot). */
export function useToken() {
  const [token] = useState(() => new URLSearchParams(location.search).get('token') ?? '');
  useEffect(() => {
    if (location.search) history.replaceState(null, '', location.pathname);
  }, []);
  return token;
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="login email-page">
      <div className="login-card">
        <a className="brand big" href="/">
          <Icon name="heart" size={40} className="brand-mark" /> {t.app}
        </a>
        <h2>{title}</h2>
        {children}
        <LangSwitch />
      </div>
    </div>
  );
}

/** "Forgot your password?": an email, and the same answer whether it has an account or not. */
export function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Card title={t.forgotTitle}>
      {sent ? (
        <p className="forgot-sent" role="status">{t.forgotSent(sent)}</p>
      ) : (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy || !email.trim()) return;
            setBusy(true);
            setError('');
            api
              .forgotPassword(email)
              .then(() => setSent(email.trim()))
              .catch((err: ApiError) => setError(errorText(err)))
              .finally(() => setBusy(false));
          }}
        >
          <p className="hint">{t.forgotLead}</p>
          <label>
            {t.emailLabel}
            <input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="primary" disabled={busy || !email.trim()}>
            {t.forgotButton}
          </button>
        </form>
      )}
      <a className="auth-switch" href="/login">{t.backToSignIn}</a>
    </Card>
  );
}

/** The link's page: a new password, and signed in with it (every other session of the account ended). */
export function Reset({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const token = useToken();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bad, setBad] = useState(!token);
  return (
    <Card title={t.resetTitle}>
      {bad ? (
        <p className="error" role="alert">{t.authErrors.token}</p>
      ) : (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy || password.length < 10) return;
            setBusy(true);
            setError('');
            api
              .resetPassword(token, password)
              .then(onSignedIn)
              .catch((err: ApiError) => {
                if (err.code === 'token') setBad(true);
                else setError(errorText(err));
                setBusy(false);
              });
          }}
        >
          <p className="hint">{t.resetLead}</p>
          <label>
            {t.resetLabel}
            <input id="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} maxLength={200} required />
            <span className="hint">{t.passwordHint}</span>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="primary" disabled={busy || password.length < 10}>
            {t.resetButton}
          </button>
        </form>
      )}
      {bad && <a className="auth-switch" href="/forgot">{t.askNewLink}</a>}
    </Card>
  );
}

// a link is used once: React's second draw in development (StrictMode) must not use it again
const verifying = new Map<string, ReturnType<typeof api.verifyEmail>>();

/** The link's page: the address confirmed (or the new one taken into use). `onVerified`: who is signed in learns of it. */
export function Verify({ signedIn, onVerified }: { signedIn: boolean; onVerified: () => void }) {
  const token = useToken();
  const [state, setState] = useState<{ done?: { email: string; changed: boolean }; error?: string }>({});
  useEffect(() => {
    if (!token) return setState({ error: t.authErrors.token });
    if (!verifying.has(token)) verifying.set(token, api.verifyEmail(token));
    verifying
      .get(token)!
      .then((r) => {
        setState({ done: r });
        onVerified();
      })
      .catch((e: ApiError) => setState({ error: errorText(e) }));
    // (once, for the token the page was opened with)
  }, [token]);
  return (
    <Card title={t.verifyTitle}>
      {!state.done && !state.error && <p className="quiet">{t.verifying}</p>}
      {state.done && (
        <p className="verified" role="status">
          ✓ {state.done.changed ? t.verifiedChanged(state.done.email) : t.verifiedDone}
        </p>
      )}
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <a className="button primary" href={signedIn ? '/' : '/login'}>
        {signedIn ? t.toApp : t.landing.signIn}
      </a>
    </Card>
  );
}
