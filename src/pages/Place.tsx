import { useCallback, useEffect, useState } from 'react';
import type { PlanState, PostKind, PostSummary, PurchaseEntry, User } from '../../shared/types';
import { PLANS, STORAGE_PACKS, beyondLite, bytes, sellsSubscriptions, type PlanName, type Space } from '../../shared/plans';
import { api, type ApiError, type Payouts } from '../api';
import { useLive } from '../live';
import { t } from '../text';
import { Avatar } from '../components/Avatar';
import { PostCard } from '../components/PostCard';
import { useLivePosts } from './Feed';
import { LangSwitch } from '../components/LangSwitch';
import { MAX_PRICE, PLATFORM_FEE, VAT, split } from '../../shared/pricing';
import { Icon, rich } from '../components/Icon';
import { LegalLinks } from './Legal';
import { Consent } from '../components/Buy';
import { Handle, UsernameField, useUsernameCheck } from '../components/Username';
import { profileHref } from '../nav';
import { normalUsername, usernameProblem } from '../../shared/usernames';
import type { TopicId } from '../../shared/interests';
import { InterestsEditor } from '../components/Topics';

/** Your own place: all your blogs and vlogs. Only you see it as a place; friends see your posts in their feed. */
export function Place({ me, onSignOut, onPlan, onDeleted, onEmail }: { me: User; onSignOut: () => void; onPlan: () => void; onDeleted: () => void; onEmail: () => void }) {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [tab, setTab] = useState<'all' | PostKind | 'archive'>('all');
  const [archive, setArchive] = useState<PostSummary[]>([]);
  useEffect(() => {
    if (tab === 'archive') api.archive().then(setArchive).catch(() => {});
  }, [tab]);

  const load = useCallback(() => {
    api.myPosts().then(setPosts).catch(() => setPosts([]));
  }, []);
  useEffect(load, [load]);
  useLive(useLivePosts(setPosts, load));

  const blogs = posts?.filter((p) => p.kind === 'blog').length ?? 0;
  const vlogs = posts?.filter((p) => p.kind === 'vlog').length ?? 0;
  const shown = tab === 'archive' ? archive : posts?.filter((p) => tab === 'all' || p.kind === tab) ?? [];

  return (
    <div className="place">
      {me.wallpaperUrl && <div className="wallpaper small" style={{ backgroundImage: `url(${me.wallpaperUrl})` }} />}
      <div className="place-head">
        <Avatar user={me} size={72} />
        <div>
          <h1>{t.myPlace}</h1>
          <p className="place-who">
            {me.name} <Handle user={me} />
          </p>
          <p className="meta">{t.counts(blogs, vlogs)}</p>
        </div>
        <button className="ghost signout" onClick={onSignOut}>
          {t.signOut}
        </button>
      </div>

      <Looks me={me} onSaved={onPlan} />
      <Username me={me} onSaved={onPlan} />
      <EmailCard me={me} onSaved={onEmail} />
      <PlanCard onPlan={onPlan} />
      <PublicProfile me={me} onSaved={onPlan} />
      <InterestsCard />
      <Payouts plan={me.plan ?? 'lite'} />
      <Subscription plan={me.plan ?? 'lite'} />
      <Purchases onChange={onPlan} />
      <div className="place-lang">
        <span className="meta">{t.language}</span>
        <LangSwitch />
      </div>
      <p className="place-links">
        <a href="/friends"><Icon name="friends" /> {t.yourFriends}</a>
        {me.moderator && <a className="mod-link" href="/mod"><Icon name="flag" /> {t.modLink}</a>}
      </p>
      <div className="place-legal"><LegalLinks /></div>

      <div className="seg">
        <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{t.all}</button>
        <button className={tab === 'blog' ? 'on' : ''} onClick={() => setTab('blog')}><Icon name="pen" /> {t.blogs}</button>
        <button className={tab === 'vlog' ? 'on' : ''} onClick={() => setTab('vlog')}><Icon name="camcorder" /> {t.vlogs}</button>
        {beyondLite(me.plan ?? 'lite') && (
          <button className={tab === 'archive' ? 'on' : ''} onClick={() => setTab('archive')}><Icon name="archive" /> {t.archive}</button>
        )}
      </div>

      {posts === null && <p className="quiet">…</p>}
      {posts !== null && shown.length === 0 && (
        <div className="empty-place">
          <p className="quiet">{tab === 'archive' ? t.emptyArchive : t.nothingYetMine}</p>
          {tab !== 'archive' && <a className="write-button inline" href="/write">{t.write}</a>}
        </div>
      )}
      <div className="feed">
        {shown.map((p) => (
          <PostCard key={p.id} post={p} me={me} showAuthor={false} />
        ))}
      </div>

      <DeleteAccount onDeleted={onDeleted} />
    </div>
  );
}

/** Your purchases (D2M's log of them), and withdrawing from a monthly contract within 14 days. */
function Purchases({ onChange }: { onChange: () => void }) {
  const [list, setList] = useState<PurchaseEntry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.purchases().then(setList).catch(() => setList([]));
  }, []);
  if (!list) return null;
  const open14 = list.filter((p) => p.withdrawable);
  const name = (p: PurchaseEntry) => t.purchaseName(p.kind, p.name);
  return (
    <div className="plan-card purchases">
      <h3>{t.purchasesTitle}</h3>
      <p className="hint">{t.purchasesHint}</p>
      {list.length === 0 && <p className="quiet">{t.noPurchases}</p>}
      <ul className="purchase-list">
        {list.map((p) => (
          <li key={p.id}>
            <b>{name(p)}</b> · {t.euros(p.amount)} · {t.when(p.createdAt)}
            {p.consentAt && <span className="meta"> · {t.purchaseConsent(t.when(p.consentAt))}</span>}
            {p.withdrawnAt && <span className="meta"> · {t.withdrawn}</span>}
            {!!p.refunded && <span className="meta"> · {t.refunded(t.euros(p.refunded))}</span>}
          </li>
        ))}
      </ul>
      <button className="ghost-pill small withdraw-open" onClick={() => setOpen(!open)}>
        {t.withdrawTitle}
      </button>
      {open && (
        <div className="withdraw">
          <p className="hint">{t.withdrawHint}</p>
          {open14.length === 0 && <p className="quiet">{t.withdrawNone}</p>}
          {open14.map((p) => (
            <div className="plan-foot withdraw-row" key={p.id}>
              <span className="meta">
                <b>{name(p)}</b> · {t.when(p.createdAt)}
              </span>
              <button
                className={asking === p.id ? 'primary small' : 'ghost-pill small'}
                onClick={() => {
                  if (asking !== p.id) return setAsking(p.id);
                  setError('');
                  api
                    .withdraw(p.id)
                    .then((next) => {
                      setList(next);
                      setAsking(null);
                      onChange();
                    })
                    .catch((e) => setError((e as Error).message));
                }}
              >
                {asking === p.id ? t.withdrawConfirm : t.withdraw}
              </button>
            </div>
          ))}
          <p className="hint">{t.withdrawPosts}</p>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Deleting your account, apart from everything else: the password, then a second yes. */
function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const [password, setPassword] = useState('');
  const [sure, setSure] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="plan-card danger delete-account">
      <h3>{t.deleteAccountTitle}</h3>
      <p className="hint">{t.deleteAccountHint}</p>
      <p className="hint">{t.deleteAccountPayouts}</p>
      <input id="delete-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.deleteAccountPassword} />
      {!sure ? (
        <button className="ghost-pill" disabled={!password} onClick={() => setSure(true)}>
          {t.deleteAccountGo}
        </button>
      ) : (
        <div className="row">
          <span className="error">{t.deleteAccountSure}</span>
          <button
            className="primary danger"
            onClick={() => {
              setError('');
              api
                .deleteAccount(password)
                .then(onDeleted)
                .catch(() => {
                  setError(t.wrongPassword);
                  setSure(false);
                });
            }}
          >
            {t.deleteAccountFinal}
          </button>
          <button className="ghost" onClick={() => setSure(false)}>
            {t.cancel}
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Your subscription: the monthly price of your paid public posts, and how many subscribe (Unlimited;
 * Exclusive sells single posts instead). */
function Subscription({ plan }: { plan: PlanName }) {
  const pro = sellsSubscriptions(plan);
  const [price, setPrice] = useState('');
  const [subscribers, setSubscribers] = useState(0);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const cents = Math.round((Number(price.replace(',', '.')) || 0) * 100);
  useEffect(() => {
    api
      .subscription()
      .then((s) => {
        setPrice(s.price ? (s.price / 100).toFixed(2) : '');
        setSubscribers(s.subscribers);
      })
      .catch(() => {});
  }, []);
  return (
    <div className="subscription">
      <div>
        <h3>{t.subscription}</h3>
        <p className="hint">{t.subscriptionHint}</p>
      </div>
      {!pro && <p className="hint pro-only"><Icon name="lock" size={14} /> {plan === 'exclusive' ? t.exclusiveNoSubs : t.proOnlySubs}</p>}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          if (!pro) return setError(t.proOnlySubs);
          if (cents > MAX_PRICE) return setError(t.priceMax);
          api
            .setPrice(Number(price.replace(',', '.')) || 0)
            .then((s) => {
              setSubscribers(s.subscribers);
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
            })
            .catch((err: ApiError) => setError(err.code === 'verify-email' ? err.message : t.priceMax));
        }}
      >
        <input className="price" inputMode="decimal" disabled={!pro} max={MAX_PRICE / 100} value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t.priceLabel} />
        <button type="submit">{saved ? '✓' : t.save}</button>
      </form>
      <span className="meta">{t.subscribers(subscribers)}</span>
      <p className="hint price-max">{t.priceMaxHint}</p>
      {error && <p className="error price-max">{error}</p>}
      {cents > 0 && cents <= MAX_PRICE && <SplitTable cents={cents} subscribers={subscribers} />}
    </div>
  );
}

/** Where a buyer's money goes: VAT, the platform fee, and you. For a month of a subscription
 * (Unlimited) or one post sold (Exclusive). */
export function SplitTable({ cents, subscribers = 0, per = 'month' }: { cents: number; subscribers?: number; per?: 'month' | 'post' }) {
  const s = split(cents);
  const pct = (x: number) => (x * 100).toLocaleString('fi-FI', { maximumFractionDigits: 1 });
  return (
    <div className="split">
      <h4>{per === 'post' ? t.splitTitlePost : t.splitTitle}</h4>
      <table>
        <tbody>
          <tr>
            <td>{per === 'post' ? t.splitPricePost : t.splitPrice}</td>
            <td>{t.euros(s.price)}</td>
          </tr>
          <tr className="minus">
            <td>{t.splitVat(pct(VAT))}</td>
            <td>− {t.euros(s.vat)}</td>
          </tr>
          <tr className="minus">
            <td>{t.splitFee(pct(PLATFORM_FEE))}</td>
            <td>− {t.euros(s.fee)}</td>
          </tr>
          <tr className="total">
            <td>{t.splitYou}</td>
            <td>{t.euros(s.author)}</td>
          </tr>
        </tbody>
      </table>
      {subscribers > 0 && <p className="meta">{t.splitTotal(subscribers, t.euros(s.author * subscribers))}</p>}
      <p className="hint">{t.splitNote}</p>
    </div>
  );
}

const PLAN_ORDER: PlanName[] = ['lite', 'pro', 'exclusive'];
const SPACES: Space[] = ['video', 'media'];

/** Your plan: Lite, Unlimited or Exclusive; your two storage spaces, and (the paid plans) more of each.
 * The prototype charges nothing. */
function PlanCard({ onPlan }: { onPlan: () => void }) {
  const [plan, setPlan] = useState<PlanState | null>(null);
  // a paid plan or a pack waits for the express consent (it begins at once) before Checkout
  const [buying, setBuying] = useState<{ plan: PlanName } | { space: Space } | null>(null);
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    api.plan().then(setPlan).catch(() => {});
  }, []);
  if (!plan) return null;
  const paid = beyondLite(plan.plan);
  const change = (p: Promise<PlanState>) =>
    p
      .then((s) => {
        setPlan(s);
        setBuying(null);
        onPlan();
      })
      // (a refusal is told by the app: the email to confirm first)
      .catch(() => setBuying(null));
  const ask = (what: { plan: PlanName } | { space: Space }) => {
    setConsent(false);
    setBuying(what);
  };
  return (
    <div className={'plan-card' + (paid ? ' pro' : '')}>
      <div className="plan-head">
        <h3>
          {t.planTitle}: <span className="plan-name">{PLANS[plan.plan].name}</span>
        </h3>
      </div>
      <div className="seg wrap plan-choice">
        {PLAN_ORDER.map((p) => (
          <button key={p} className={plan.plan === p ? 'on' : ''} onClick={() => plan.plan !== p && (p === 'lite' ? change(api.setPlan(p)) : ask({ plan: p }))}>
            {t.planChoice(PLANS[p].name, PLANS[p].price ? t.euros(PLANS[p].price) : '')}
          </button>
        ))}
      </div>
      <p className="hint">{plan.plan === 'exclusive' ? t.exclusiveDesc : paid ? t.proDesc : t.liteDesc}</p>
      {SPACES.map((s) => (
        <div className={'storage ' + s} key={s}>
          <div className="storage-bar">
            <div style={{ width: `${Math.min(100, (plan.used[s] / plan.quota[s]) * 100)}%` }} />
          </div>
          <div className="plan-foot">
            <span className="meta">
              <b>{s === 'video' ? t.spaceVideo : t.spaceMedia}</b> · {t.storageUsed(bytes(plan.used[s]), bytes(plan.quota[s]))}
            </span>
            {paid && (
              <button className="ghost-pill small" onClick={() => ask({ space: s })}>
                {t.buyStorage(bytes(STORAGE_PACKS[s].bytes), t.euros(STORAGE_PACKS[s].price))}
              </button>
            )}
          </div>
        </div>
      ))}
      {buying && (
        <div className="consent-buy">
          <p className="meta">
            <b>{'plan' in buying ? t.planChoice(PLANS[buying.plan].name, t.euros(PLANS[buying.plan].price)) : t.buyStorage(bytes(STORAGE_PACKS[buying.space].bytes), t.euros(STORAGE_PACKS[buying.space].price))}</b>
          </p>
          <Consent kind="service" checked={consent} onChange={setConsent} />
          <div className="row">
            <button className="primary small" disabled={!consent} onClick={() => change('plan' in buying ? api.setPlan(buying.plan, true) : api.buyStorage(buying.space, true))}>
              {t.consentGo}
            </button>
            <button className="ghost" onClick={() => setBuying(null)}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
      <p className="hint">{t.noCharge}</p>
    </div>
  );
}

/** Being paid: a Stripe account money from your sales goes to (the paid plans, when payments are on). */
function Payouts({ plan }: { plan: PlanName }) {
  const [state, setState] = useState<Payouts | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.payouts().then(setState).catch(() => {});
  }, []);
  if (!state?.enabled || !beyondLite(plan)) return null;
  return (
    <div className="plan-card payouts">
      <h3>{t.payoutsTitle}</h3>
      <p className="hint">{t.payoutsHint}</p>
      {state.ready ? (
        <p className="meta">✓ {t.payoutsReady}</p>
      ) : (
        <div className="plan-foot">
          <span className="meta">{state.linked ? t.payoutsUnfinished : t.payoutsNone}</span>
          <button
            className="primary small"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError('');
              api.linkPayouts().catch((e) => {
                setError((e as Error).message);
                setBusy(false);
              });
            }}
          >
            {state.linked ? t.payoutsFinish : t.payoutsLink}
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {state.live && <p className="hint">{t.payoutsLive}</p>}
    </div>
  );
}

/** Your username: changed with the live check; the old one stays yours for 30 days. */
function Username({ me, onSaved }: { me: User; onSaved: () => void }) {
  const [value, setValue] = useState(me.username);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setValue(me.username), [me.username]);
  const check = useUsernameCheck(value, me.username);
  const name = normalUsername(value);
  const changed = name !== me.username;
  const ok = changed && !usernameProblem(name) && check?.available !== false;
  return (
    <div className="plan-card username-card">
      <h3>{t.usernameTitle}</h3>
      <p className="hint">{t.usernameChangeHint}</p>
      <form
        className="username-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          setError('');
          api
            .setUsername(name)
            .then(() => {
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
              onSaved();
            })
            .catch((err: ApiError) => setError((err.code && t.authErrors[err.code]) || err.message));
        }}
      >
        <UsernameField id="username-change" value={value} onChange={setValue} check={changed ? check : null} />
        <div className="plan-foot">
          <span />
          <button type="submit" className="small" disabled={!ok}>
            {saved ? '✓' : t.save}
          </button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Your email: what it is and whether it is confirmed; changed with your password, through a link to the new one. */
function EmailCard({ me, onSaved }: { me: User; onSaved: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');
  if (!me.email) return null;
  return (
    <div className="plan-card email-card">
      <h3>{t.emailTitle}</h3>
      <p className="hint">{t.emailHint}</p>
      <p className="meta email-now">
        <b>{me.email}</b> · {me.verified ? `✓ ${t.emailVerified}` : t.emailUnverified}
      </p>
      {me.pendingEmail && <p className="hint email-pending">{t.emailPending(me.pendingEmail)}</p>}
      <form
        className="email-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || !email.trim() || !password) return;
          setBusy(true);
          setError('');
          setSaid('');
          api
            .changeEmail(email, password)
            .then(() => {
              setSaid(t.emailChangeSent(email.trim()));
              setEmail('');
              setPassword('');
              onSaved();
            })
            .catch((err: ApiError) => setError((err.code && t.authErrors[err.code]) || err.message))
            .finally(() => setBusy(false));
        }}
      >
        <input id="email-new" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailNew} autoComplete="email" />
        <input id="email-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.emailPassword} autoComplete="current-password" />
        <div className="plan-foot">
          <span />
          <button type="submit" className="small" disabled={busy || !email.trim() || !password}>
            {t.emailChange}
          </button>
        </div>
      </form>
      {said && <p className="hint" role="status">{said}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Your public profile: anyone may make one. */
function PublicProfile({ me, onSaved }: { me: User; onSaved: () => void }) {
  const [on, setOn] = useState(!!me.publicProfile);
  const [bio, setBio] = useState(me.bio ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="plan-card">
      <h3>{t.profileTitle}</h3>
      <p className="hint">{t.profileHint}</p>
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        {t.profileOn}
      </label>
      {on && <textarea className="bio-input" rows={2} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t.bioPlaceholder} />}
      <div className="plan-foot">
        {me.publicProfile ? <a className="profile-link" href={profileHref(me)}>{t.viewProfile}</a> : <span />}
        <button
          className="small"
          onClick={() => {
            setError('');
            api
              .setProfile(on, bio)
              .then(() => {
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
                onSaved();
              })
              .catch((err: ApiError) => setError(err.message));
          }}
        >
          {saved ? '✓' : t.save}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Your interests: topics and your own words, private, ordering your For You. */
function InterestsCard() {
  const [topics, setTopics] = useState<TopicId[] | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api
      .interests()
      .then((i) => {
        setTopics(i.topics);
        setWords(i.words);
      })
      .catch(() => setTopics([]));
  }, []);
  if (!topics) return null;
  return (
    <div className="plan-card interests-card">
      <h3>{t.interestsTitle}</h3>
      <p className="hint">{t.interestsHint}</p>
      <InterestsEditor topics={topics} words={words} onTopics={setTopics} onWords={setWords} />
      <div className="plan-foot">
        <span className="meta">{saved ? t.interestsSaved : ''}</span>
        <button
          className="small"
          onClick={() =>
            api.setInterests(topics, words).then((i) => {
              setTopics(i.topics);
              setWords(i.words);
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
            })
          }
        >
          {saved ? '✓' : t.save}
        </button>
      </div>
    </div>
  );
}

/** Your profile picture and wallpaper. */
function Looks({ me, onSaved }: { me: User; onSaved: () => void }) {
  const pick = (which: 'avatar' | 'wallpaper') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) api.setPicture(which, file).then(onSaved);
    e.target.value = '';
  };
  return (
    <div className="plan-card looks">
      <h3>{t.looksTitle}</h3>
      <p className="hint">{t.looksHint}</p>
      <div
        className="wallpaper edit"
        style={me.wallpaperUrl ? { backgroundImage: `url(${me.wallpaperUrl})` } : { background: me.color }}
      >
        <label className="pic-button">
          <input type="file" accept="image/*" onChange={pick('wallpaper')} />
          <Icon name="picture" size={14} /> {t.changeWallpaper}
        </label>
        {me.wallpaperUrl && (
          <button className="pic-button remove" onClick={() => api.setPicture('wallpaper', null).then(onSaved)}>
            {t.removePicture}
          </button>
        )}
      </div>
      <div className="avatar-edit">
        <Avatar user={me} size={72} />
        <label className="ghost-pill pic-label">
          <input type="file" accept="image/*" onChange={pick('avatar')} />
          <Icon name="camera" /> {t.changeAvatar}
        </label>
        {me.avatarUrl && (
          <button className="ghost" onClick={() => api.setPicture('avatar', null).then(onSaved)}>
            {t.removePicture}
          </button>
        )}
      </div>
    </div>
  );
}
