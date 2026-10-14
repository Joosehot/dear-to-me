import { useEffect, useState } from 'react';
import { RULES, factsText, isRule, type ComplaintPage, type Rule } from '../../shared/moderation';
import { api, type ApiError } from '../api';
import { lang, t } from '../text';
import { Card, errorText, useToken } from './Email';
import { legal } from '../legal';

// A complaint about a moderation decision (/complaint/<decision id>): the person it is about, signed in,
// or anyone with the link from its statement of reasons (?token=, used once: a suspended person cannot
// sign in). The decision as its statement gave it, and a form while there is time.

export function Complaint({ id }: { id: string }) {
  const token = useToken();
  const [page, setPage] = useState<ComplaintPage | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    api
      .complaint(id, token || undefined)
      .then(setPage)
      .catch((e: ApiError) => setError(errorText(e)));
  }, [id, token]);
  const d = page?.decision;
  const what = d
    ? d.action === 'remove'
      ? t.complaint.what.remove(d.postTitle ?? '')
      : d.action === 'restrict'
        ? t.complaint.what.restrict(d.postTitle ?? '')
        : t.complaint.what.suspend(d.until ?? null)
    : '';
  return (
    <Card title={t.complaint.title}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {page && d && (
        <div className="complaint">
          <dl className="statement">
            <dt>{t.complaint.decided}</dt>
            <dd className="statement-what">{what}</dd>
            {d.rule && (
              <>
                <dt>{t.complaint.rule}</dt>
                <dd>
                  {t.rules[d.rule]} (<a href="/rules">{legal().labels.rules}</a>)
                </dd>
              </>
            )}
            <dt>{t.complaint.reason}</dt>
            <dd>{d.reason}</dd>
            <dt>{t.complaint.facts}</dt>
            <dd>{factsText(d.facts, lang())}</dd>
          </dl>
          <p className="hint">{t.complaint.by}</p>
          {d.reversedAt && <p className="verified">{t.complaint.reversed}</p>}
          {page.complaint ? (
            <p className="complaint-status" role="status">
              {page.complaint.outcome ? t.complaint.outcome[page.complaint.outcome] : t.complaint.sent}
            </p>
          ) : page.canComplain && !sent ? (
            <form
              className="auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                api
                  .complain(id, text, token || undefined)
                  .then((p) => {
                    setPage(p);
                    setSent(true);
                  })
                  .catch((err: ApiError) => setError(errorText(err)))
                  .finally(() => setBusy(false));
              }}
            >
              <p className="hint">{t.complaint.deadline(page.deadline)}</p>
              <label>
                {t.complaint.label}
                <textarea id="complaint-text" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={4000} required />
              </label>
              <button type="submit" className="primary" disabled={busy || text.trim().length < 10}>
                {t.complaint.send}
              </button>
            </form>
          ) : (
            !sent && <p className="quiet">{t.complaint.closed}</p>
          )}
        </div>
      )}
    </Card>
  );
}

/** A notice about content, from anyone (an account or not): the address, the rule, why, and a statement of good faith. */
export function ReportContent() {
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState(() => new URLSearchParams(location.search).get('url') ?? '');
  const [reason, setReason] = useState<Rule | ''>('');
  const [explanation, setExplanation] = useState('');
  const [goodFaith, setGoodFaith] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const ready = !!email.trim() && !!url.trim() && isRule(reason) && explanation.trim().length >= 10 && goodFaith;
  return (
    <Card title={t.notice.title}>
      {sent ? (
        <p className="notice-sent" role="status">
          {t.notice.sent}
        </p>
      ) : (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready || !isRule(reason)) return;
            setBusy(true);
            setError('');
            api
              .sendNotice({ email, url, reason, explanation, goodFaith })
              .then(() => setSent(true))
              .catch((err: ApiError) => setError(err.code === 'too-many' ? t.notice.tooMany : errorText(err)))
              .finally(() => setBusy(false));
          }}
        >
          <p className="hint">{t.notice.lead}</p>
          <label>
            {t.notice.email}
            <input id="notice-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            {t.notice.url}
            <input id="notice-url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} required />
          </label>
          <label>
            {t.notice.reason}
            <select id="notice-reason" value={reason} onChange={(e) => setReason(e.target.value as Rule)} required>
              <option value="">{t.mod.chooseRule}</option>
              {RULES.map((r) => (
                <option key={r} value={r}>
                  {t.rules[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.notice.explanation}
            <textarea id="notice-explanation" value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={4} maxLength={4000} required />
          </label>
          <label className="check">
            <input id="notice-good-faith" type="checkbox" checked={goodFaith} onChange={(e) => setGoodFaith(e.target.checked)} />
            <span>{t.notice.goodFaith}</span>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary" disabled={busy || !ready}>
            {t.notice.send}
          </button>
        </form>
      )}
      <a className="auth-switch" href="/rules">
        {legal().labels.rules}
      </a>
    </Card>
  );
}
