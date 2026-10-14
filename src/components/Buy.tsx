import { useState } from 'react';
import type { User } from '../../shared/types';
import { api } from '../api';
import { t } from '../text';

/** What a purchase asks before Checkout (EU consumer law): a single post is digital content (the right
 * of withdrawal ends when access begins); a monthly contract is a digital service (it begins at once,
 * and a withdrawal within 14 days refunds only the unused part). */
export type ConsentKind = 'content' | 'service';

export function Consent({ kind, checked, onChange }: { kind: ConsentKind; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="check consent">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {kind === 'content' ? t.consentContent : t.consentService}
    </label>
  );
}

/** A buy button that asks for the express consent first: the button opens it (or it is `open` at once),
 * and buying waits for the box to be ticked. */
export function ConsentBuy({ kind, label, onBuy, open: openAtOnce = false, small }: { kind: ConsentKind; label: string; onBuy: () => Promise<unknown>; open?: boolean; small?: boolean }) {
  const [open, setOpen] = useState(openAtOnce);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const cls = 'primary' + (small ? ' small' : '');
  if (!open) {
    return (
      <button className={cls} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="consent-buy">
      <Consent kind={kind} checked={consent} onChange={setConsent} />
      <div className="row">
        <button
          className={cls}
          disabled={!consent || busy}
          onClick={() => {
            setBusy(true);
            onBuy().catch(() => setBusy(false));
          }}
        >
          {openAtOnce ? label : t.consentGo}
        </button>
        {!openAtOnce && (
          <button className="ghost" onClick={() => setOpen(false)}>
            {t.cancel}
          </button>
        )}
      </div>
    </div>
  );
}

/** "Subscribed ✓", and a way to cancel; a cancelled one says until when it stays open. */
export function Subscribed({ author, until, onChange }: { author: User; until?: number; onChange: () => void }) {
  const [asking, setAsking] = useState(false);
  if (until) return <span className="tag ok">{t.subscribedUntil(t.when(until))}</span>;
  return (
    <span className="subscribed">
      <span className="tag ok">{t.subscribed}</span>
      {!asking ? (
        <button className="ghost small unsubscribe" onClick={() => setAsking(true)}>
          {t.unsubscribe}
        </button>
      ) : (
        <span className="unsubscribe-ask">
          <span className="hint">{t.unsubscribeHint}</span>
          <button className="ghost-pill small" onClick={() => api.unsubscribe(author.id).then(onChange)}>
            {t.unsubscribeConfirm}
          </button>
          <button className="ghost small" onClick={() => setAsking(false)}>
            {t.cancel}
          </button>
        </span>
      )}
    </span>
  );
}
