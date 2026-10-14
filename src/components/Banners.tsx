import { useState } from 'react';
import type { Config, User } from '../../shared/types';
import { api, type ApiError } from '../api';
import { t } from '../text';

// The slim notices at the top: a closed beta (and how payments stand in it), and an email address
// not confirmed yet.

/** "Beta: …", with the payments as they are: off, Stripe's test mode (the test card), or live (no hint). */
export function BetaBanner({ config }: { config: Config | null }) {
  if (!config?.beta) return null;
  return (
    <div className="beta-banner" role="note">
      {t.betaBanner[config.payments ?? 'off']}
    </div>
  );
}

/** Your email is not confirmed yet: what waits for it, and the link sent again (braked by the server). */
export function VerifyBanner({ me }: { me: User }) {
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  if (me.verified !== false) return null;
  return (
    <div className="verify-banner" role="status">
      <b>{t.verifyBanner}</b>
      <span className="verify-text">{t.verifyBannerText(me.email ?? '')}</span>
      <button
        className="ghost-pill small"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          api
            .resendVerification()
            .then(() => setSaid(t.verifyResent))
            .catch((e: ApiError) => setSaid(e.status === 429 ? t.verifyTooSoon : (e.code && t.authErrors[e.code]) || e.message))
            .finally(() => setBusy(false));
        }}
      >
        {t.verifyResend}
      </button>
      {said && <span className="verify-said">{said}</span>}
    </div>
  );
}
