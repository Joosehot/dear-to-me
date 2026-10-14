import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../../shared/types';
import { RULES, factsText, type Decision, type LogEntry, type ModQueue, type PostAction, type QueueItem, type Rule } from '../../shared/moderation';
import { api, type ApiError } from '../api';
import { lang, t } from '../text';
import { Prose } from '../components/Prose';

// The moderation queue (/mod), for moderators only (the server refuses everyone else): reported posts
// with the post itself, complaints, notices without a post, the suspended, and the log. Every decision
// asks for the rule broken (when it restricts) and a written reason: a ready one, edited or not.

interface Choice {
  key: string;
  label: string;
  /** the rule broken must be named */
  rule?: boolean;
  presets: string[];
  danger?: boolean;
}

/** Pick a decision, the rule it rests on, and a written reason; then confirm it. */
function Decide({ choices, onDecide, extra }: { choices: Choice[]; onDecide: (key: string, rule: Rule | undefined, reason: string) => Promise<unknown>; extra?: ReactNode }) {
  const [key, setKey] = useState<string | null>(null);
  const [rule, setRule] = useState<Rule | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = choices.find((c) => c.key === key);
  const ready = !!chosen && reason.trim().length >= 3 && (!chosen.rule || !!rule);
  return (
    <div className="decide">
      <div className="row wrap">
        {choices.map((c) => (
          <button key={c.key} className={(key === c.key ? 'primary' : 'ghost-pill') + (c.danger ? ' danger' : '')} onClick={() => setKey(c.key)}>
            {c.label}
          </button>
        ))}
        {extra}
      </div>
      {chosen && (
        <div className="decide-form">
          {chosen.rule && (
            <label>
              {t.mod.rule}
              <select className="decide-rule" value={rule} onChange={(e) => setRule(e.target.value as Rule)}>
                <option value="">{t.mod.chooseRule}</option>
                {RULES.map((r) => (
                  <option key={r} value={r}>
                    {t.rules[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="hint">{t.mod.presets}</p>
          <div className="presets">
            {chosen.presets.map((p) => (
              <button key={p} type="button" className="chip preset" onClick={() => setReason(p)}>
                {p}
              </button>
            ))}
          </div>
          <label>
            {t.mod.reason}
            <textarea className="decide-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button
            className={'primary' + (chosen.danger ? ' danger' : '')}
            disabled={!ready || busy}
            onClick={() => {
              setBusy(true);
              setError('');
              onDecide(chosen.key, rule || undefined, reason.trim())
                .catch((e: ApiError) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            {t.mod.confirm(chosen.label)}
          </button>
        </div>
      )}
    </div>
  );
}

const when = (ms: number) => new Date(ms).toLocaleString(lang() === 'fi' ? 'fi-FI' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

/** One earlier decision, in a line. */
function DecisionLine({ d }: { d: Decision }) {
  return (
    <li>
      <strong>{t.mod.actions[d.action]}</strong> · {when(d.createdAt)} · @{d.moderator ?? '?'}
      {d.rule && <> · {t.rules[d.rule]}</>}
      {d.postTitle && <> · “{d.postTitle}”</>}
      {d.reversedAt && <> · <em>{t.mod.reversed}</em></>}
      <div className="quiet">{d.reason}</div>
    </li>
  );
}

function audienceOf(item: QueueItem) {
  const a = item.post.audience;
  if (item.post.letter) return t.mod.audience.letter;
  return a === 'public' ? t.mod.audience.public : a === 'friends' ? t.mod.audience.friends : a === 'group' ? t.mod.audience.group : t.mod.audience.chosen;
}

/** A reported post: the post itself, its author, why it is here, what was decided before, and the decision. */
function Reported({ item, me, onDone, onSuspend }: { item: QueueItem; me: User; onDone: () => void; onSuspend: (username: string) => void }) {
  const { post, author } = item;
  const total = Object.values(item.reports).reduce((a, b) => a + b, 0) + item.notices.length;
  const actions: PostAction[] = post.restricted ? ['keep', 'lift', 'remove'] : ['keep', 'restrict', 'remove'];
  const presets: Record<PostAction, string[]> = { keep: t.mod.keepPresets, remove: t.mod.removePresets, restrict: t.mod.removePresets, lift: t.mod.liftPresets };
  return (
    <article className="mod-item plan-card">
      <header>
        <h3>{post.title}</h3>
        <p className="meta">
          {author.name} <span className="handle">@{author.username}</span> · {audienceOf(item)} · {when(post.createdAt)}
          {post.hidden && <> · <span className="tag">{t.mod.hidden}</span></>}
          {post.restricted && <> · <span className="tag">{t.mod.restricted}</span></>}
        </p>
        <p className="mod-reports">
          <strong>{t.mod.reports(total)}</strong>
          {Object.entries(item.reports).map(([r, n]) => (
            <span key={r} className="tag">
              {t.reportReasons[r] ?? r} {n}
            </span>
          ))}
        </p>
        {item.notices.map((n) => (
          <p key={n.id} className="mod-notice hint">
            {t.mod.noticeFrom}: {t.rules[n.reason]} · {n.explanation}
          </p>
        ))}
      </header>
      <div className="mod-content">
        {post.imageUrl && <img src={post.imageUrl} alt="" />}
        {post.videoUrl && <video src={post.videoUrl} controls />}
        <Prose body={post.body} pictures={post.pictures} />
      </div>
      {item.history.length > 0 && (
        <details className="mod-history">
          <summary>
            {t.mod.history} ({item.history.length})
          </summary>
          <ul>
            {item.history.map((d) => (
              <DecisionLine key={d.id} d={d} />
            ))}
          </ul>
        </details>
      )}
      {author.id === me.id ? (
        <p className="hint">{t.mod.ownPost}</p>
      ) : (
        <Decide
          choices={actions.map((a) => ({ key: a, label: t.mod.actions[a], rule: a === 'remove' || a === 'restrict', presets: presets[a], danger: a === 'remove' }))}
          onDecide={(a, rule, reason) => api.decidePost(post.id, a as PostAction, rule, reason).then(onDone)}
          extra={
            <button className="ghost" onClick={() => onSuspend(author.username)}>
              {t.mod.suspendAuthor(author.username)}
            </button>
          }
        />
      )}
    </article>
  );
}

/** What a decision was, in a line for a complaint about it. */
const decisionTitle = (d: Decision) => `${t.mod.actions[d.action]}: ${d.postTitle ? `“${d.postTitle}” (@${d.username ?? '?'})` : `@${d.username ?? '?'}`}`;

function Queue({ me, onSuspend }: { me: User; onSuspend: (username: string) => void }) {
  const [q, setQ] = useState<ModQueue | null>(null);
  const [said, setSaid] = useState('');
  const load = useCallback(() => {
    api.modQueue().then(setQ).catch(() => setQ({ posts: [], notices: [], complaints: [], suspended: [] }));
  }, []);
  useEffect(load, [load]);
  const done = () => {
    setSaid(t.mod.done);
    load();
  };
  if (!q) return <p className="quiet">…</p>;
  const empty = !q.posts.length && !q.notices.length && !q.complaints.length;
  return (
    <>
      {said && (
        <p className="mod-said" role="status">
          {said}
        </p>
      )}
      {empty && <p className="quiet mod-empty">{t.mod.empty}</p>}
      {q.complaints.length > 0 && (
        <section className="mod-complaints">
          <h2>{t.mod.complaints}</h2>
          {q.complaints.map((c) => (
            <article key={c.id} className="mod-item plan-card">
              <h3>{t.mod.complaintAbout(decisionTitle(c.decision))}</h3>
              <p className="meta">
                {when(c.decision.createdAt)} · @{c.decision.moderator ?? '?'} {c.decision.rule && <>· {t.rules[c.decision.rule]}</>}
              </p>
              <p className="quiet">{c.decision.reason}</p>
              <p className="hint">{factsText(c.decision.facts, lang())}</p>
              <blockquote className="complaint-text">{c.text}</blockquote>
              <Decide
                choices={[
                  { key: 'upheld', label: t.mod.uphold, presets: [t.mod.complaintPresets[0]] },
                  { key: 'reversed', label: t.mod.reverse, presets: [t.mod.complaintPresets[1]] },
                ]}
                onDecide={(o, _rule, reason) => api.decideComplaint(c.id, o as 'upheld' | 'reversed', reason).then(done)}
              />
            </article>
          ))}
        </section>
      )}
      {q.posts.length > 0 && (
        <section className="mod-posts">
          <h2>{t.mod.posts}</h2>
          {q.posts.map((item) => (
            <Reported key={item.post.id} item={item} me={me} onDone={done} onSuspend={onSuspend} />
          ))}
        </section>
      )}
      {q.notices.length > 0 && (
        <section className="mod-notices">
          <h2>{t.mod.notices}</h2>
          {q.notices.map((n) => (
            <article key={n.id} className="mod-item plan-card">
              <h3 className="mod-url">{n.url}</h3>
              <p className="meta">
                {when(n.createdAt)} · {t.rules[n.reason]}
              </p>
              <p>{n.explanation}</p>
              <Decide choices={[{ key: 'close', label: t.mod.closeNotice, presets: t.mod.noticePresets }]} onDecide={(_k, _r, reason) => api.closeNotice(n.id, reason).then(done)} />
            </article>
          ))}
        </section>
      )}
    </>
  );
}

function People({ prefill }: { prefill: string }) {
  const [q, setQ] = useState<ModQueue | null>(null);
  const [username, setUsername] = useState(prefill);
  const [until, setUntil] = useState('');
  const [said, setSaid] = useState('');
  const load = useCallback(() => {
    api.modQueue().then(setQ).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useEffect(() => setUsername(prefill), [prefill]);
  const done = () => {
    setSaid(t.mod.done);
    load();
  };
  return (
    <>
      {said && (
        <p className="mod-said" role="status">
          {said}
        </p>
      )}
      <section className="plan-card mod-suspend">
        <h2>{t.mod.suspendTitle}</h2>
        <label>
          {t.mod.suspendWho}
          <input id="suspend-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@" />
        </label>
        <label>
          {t.mod.suspendUntil}
          <input id="suspend-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <Decide
          choices={[{ key: 'suspend', label: t.mod.actions.suspend, rule: true, presets: t.mod.suspendPresets, danger: true }]}
          onDecide={(_k, rule, reason) =>
            api
              // the end of the chosen day, in the moderator's time
              .suspend(username, rule!, reason, until ? new Date(`${until}T23:59:59`).getTime() : null)
              .then(() => {
                setUsername('');
                setUntil('');
                done();
              })
          }
        />
      </section>
      <section className="mod-suspended">
        <h2>{t.mod.suspended}</h2>
        {q && q.suspended.length === 0 && <p className="quiet">{t.mod.noSuspended}</p>}
        {q?.suspended.map((s) => (
          <article key={s.user.id} className="mod-item plan-card">
            <h3>
              {s.user.name} <span className="handle">@{s.user.username}</span>
            </h3>
            <p className="meta">
              {when(s.since)} · {t.mod.until(s.until)} {s.rule && <>· {t.rules[s.rule]}</>}
            </p>
            <p className="quiet">{s.reason}</p>
            <Decide choices={[{ key: 'unsuspend', label: t.mod.actions.unsuspend, presets: t.mod.liftPresets }]} onDecide={(_k, _r, reason) => api.unsuspend(s.user.id, reason).then(done)} />
          </article>
        ))}
      </section>
    </>
  );
}

function Log() {
  const [log, setLog] = useState<LogEntry[] | null>(null);
  useEffect(() => {
    api.modLog().then(setLog).catch(() => setLog([]));
  }, []);
  if (!log) return <p className="quiet">…</p>;
  return (
    <section className="mod-log">
      <p className="hint">{t.mod.logHint}</p>
      {log.length === 0 && <p className="quiet">{t.mod.logEmpty}</p>}
      <ul>
        {log.map((e, i) => (
          <li key={i}>
            <span className="meta">{when(e.at)}</span> · @{e.moderator} · <strong>{e.action}</strong> · {e.target}
            <div className="quiet">{e.reason}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The moderation page. Not a moderator: a plain no (the server would refuse every call anyway). */
export function Mod({ me }: { me: User }) {
  const [tab, setTab] = useState<'queue' | 'people' | 'log'>('queue');
  const [prefill, setPrefill] = useState('');
  if (!me.moderator) return <p className="quiet">{t.mod.title}: 403</p>;
  return (
    <div className="mod">
      <h1>{t.mod.title}</h1>
      <p className="hint">{t.mod.lead}</p>
      <div className="seg mod-tabs">
        {(['queue', 'people', 'log'] as const).map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t.mod.tabs[k]}
          </button>
        ))}
      </div>
      {tab === 'queue' && (
        <Queue
          me={me}
          onSuspend={(u) => {
            setPrefill(u);
            setTab('people');
          }}
        />
      )}
      {tab === 'people' && <People prefill={prefill} />}
      {tab === 'log' && <Log />}
    </div>
  );
}
