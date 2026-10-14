import { useCallback, useEffect, useState } from 'react';
import type { Config, ServerEvent, User } from '../shared/types';
import { MOCK, SIGNED_OUT, VERIFY_NEEDED, api, currentUser, remember, type ApiError } from './api';
import { disconnect, useLive } from './live';
import { onLang, t } from './text';
import { Avatar } from './components/Avatar';
import { Login } from './pages/Login';
import { Landing } from './pages/Landing';
import { Feed } from './pages/Feed';
import { PostPage } from './pages/PostPage';
import { Compose } from './pages/Compose';
import { Friends } from './pages/Friends';
import { Place } from './pages/Place';
import { Letters } from './pages/Letters';
import { ForYou } from './pages/ForYou';
import { Search } from './pages/Search';
import { ProfilePage } from './pages/ProfilePage';
import { Legal } from './pages/Legal';
import { Welcome } from './pages/Welcome';
import { People, go, isPublicPage, navigate, nextPath, onNavigate, parse, type Route } from './nav';
import { Icon, rich } from './components/Icon';
import { PublicShell, Waiting } from './components/Public';
import { Forgot, Reset, Verify } from './pages/Email';
import { BetaBanner, VerifyBanner } from './components/Banners';
import { Mod } from './pages/Mod';
import { Complaint, ReportContent } from './pages/Complaint';
import { Groups } from './pages/Groups';
import { GroupView } from './pages/GroupPage';

/** Pages whose posts are laid out three side by side. */
const GRID_PAGES: Route['page'][] = ['feed', 'fyp', 'letters', 'me', 'user'];

export function App() {
  // the tab's last known user draws the page at once; the server's session says who it really is
  const [me, setMe] = useState<User | null>(MOCK ? null : currentUser());
  const [known, setKnown] = useState(MOCK || !!me);
  const [route, setRoute] = useState<Route>(parse(location.pathname));
  // a new key draws the page again (after a payment, so it shows what was bought)
  const [routeKey, setRouteKey] = useState(0);
  const [people, setPeople] = useState<Map<string, User>>(new Map());
  const [toast, setToast] = useState<{ text: string; postId?: string } | null>(null);
  // the server's settings: a closed beta's banner, and how payments stand
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    api.config().then(setConfig).catch(() => {});
  }, []);
  // a new language: draw everything again
  const [, setLangTick] = useState(0);
  useEffect(() => onLang(() => setLangTick((n) => n + 1)), []);

  const signedOut = useCallback(() => {
    disconnect();
    remember(null);
    setMe(null);
  }, []);
  useEffect(() => {
    if (MOCK) return;
    api
      .me()
      .then((u) => {
        remember(u);
        setMe(u);
      })
      // only "not signed in" signs out; without the server the tab goes on as it was
      .catch((e: ApiError) => e.status === 401 && signedOut())
      .finally(() => setKnown(true));
    window.addEventListener(SIGNED_OUT, signedOut);
    return () => window.removeEventListener(SIGNED_OUT, signedOut);
  }, [signedOut]);

  /** Who is signed in, as the server has them now (an email confirmed, a plan changed). */
  const refreshMe = useCallback(() => {
    api
      .me()
      .then((u) => {
        remember(u);
        setMe(u);
      })
      .catch(() => {});
  }, []);

  // something waited for a confirmed email: say so (the banner at the top has the way to confirm it)
  useEffect(() => {
    const f = () => setToast({ text: t.verifyFirst });
    window.addEventListener(VERIFY_NEEDED, f);
    return () => window.removeEventListener(VERIFY_NEEDED, f);
  }, []);

  useEffect(() => {
    return onNavigate(() => {
      setRoute(parse(location.pathname));
      // the server's title was for the address the site was opened at
      document.title = t.app;
    });
  }, []);

  // signed in: the sign-in pages are the page they came from (?next=), or the feed
  useEffect(() => {
    if (me && (route.page === 'login' || route.page === 'signup')) navigate(nextPath(), true);
  }, [me, route.page]);

  // back from Stripe Checkout (/<page>?paid=<session>): the server confirms the payment with Stripe
  useEffect(() => {
    const session = new URLSearchParams(location.search).get('paid');
    if (!session || !me) return;
    history.replaceState(null, '', location.pathname);
    api
      .confirmPayment(session)
      .then(() => api.me())
      .then((next) => {
        remember(next);
        setMe(next);
        setToast({ text: t.paidThanks });
        // the page it came back to loads again, with what was paid for
        setRouteKey((k) => k + 1);
      })
      .catch((e) => setToast({ text: `${t.paidFailed} (${(e as Error).message})` }));
  }, [me?.id]);

  const loadPeople = useCallback(() => {
    api.users().then((us) => setPeople(new Map(us.map((u) => [u.id, u])))).catch(() => {});
  }, []);
  useEffect(() => {
    if (me) loadPeople();
  }, [loadPeople, me]);

  // the groups' badge: invitations waiting for you, and members' suggestions waiting for you as an admin
  // (asked again on every page, and when the live channel says something came)
  const [pending, setPending] = useState(0);
  const loadPending = useCallback(() => {
    api.groupsPending().then((p) => setPending(p.invitations + p.toApprove)).catch(() => {});
  }, []);
  useEffect(() => {
    if (me) loadPending();
  }, [loadPending, me?.id, route]);

  // a friend posted: say so, with a way in; something waits in the groups: the badge
  const onLive = useCallback(
    (e: ServerEvent) => {
      if (e.type === 'groups') loadPending();
      if (e.type === 'posted' && me && e.post.authorId !== me.id) {
        loadPeople();
        const name = people.get(e.post.authorId)?.name ?? '';
        setToast({ text: t.posted(name), postId: e.post.id });
      }
    },
    [me, people, loadPeople, loadPending],
  );
  const badge = pending > 0 && (
    <span className="badge" aria-label={String(pending)}>
      {pending}
    </span>
  );
  // a visitor who is not signed in has no live channel
  useLive(onLive, !!me);

  const toastBox = toast && (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.postId && (
        <button
          onClick={() => {
            go({ page: 'post', id: toast.postId! });
            setToast(null);
          }}
        >
          {t.open}
        </button>
      )}
      <button className="ghost" aria-label="close" onClick={() => setToast(null)}>✕</button>
    </div>
  );

  // not yet known whether the cookie signs someone in: nothing, rather than the landing page for a
  // moment (a public page: the server's readable version of it stays meanwhile)
  if (!me && !known) return isPublicPage(route) ? <Waiting /> : null;
  const beta = <BetaBanner config={config} />;
  // a link by email: its own page, signed in or not
  if (route.page === 'forgot' || route.page === 'reset' || route.page === 'verify') {
    return (
      <>
        {beta}
        {route.page === 'forgot' && <Forgot />}
        {route.page === 'reset' && (
          <Reset
            onSignedIn={(u) => {
              remember(u);
              setMe(u);
              navigate('/', true);
            }}
          />
        )}
        {route.page === 'verify' && <Verify signedIn={!!me} onVerified={() => me && refreshMe()} />}
      </>
    );
  }
  // a complaint about a moderation decision (a suspended person cannot sign in), and a notice from anyone: their own page, signed in or not
  if (route.page === 'complaint' || route.page === 'report-content') {
    return (
      <>
        {beta}
        {route.page === 'complaint' ? <Complaint id={route.id} /> : <ReportContent />}
      </>
    );
  }
  // the legal pages are for everyone, signed in or not
  if (!me && route.page === 'legal')
    return (
      <>
        {beta}
        <Legal doc={route.doc} standalone />
      </>
    );
  // a public profile or post: the page itself, in a light frame with the way in
  if (!me && isPublicPage(route)) {
    return (
      <PublicShell wide={route.page === 'post'} banner={beta}>
        {route.page === 'post' && <PostPage me={null} id={route.id} onToast={(text) => setToast({ text })} />}
        {route.page === 'user' && <ProfilePage key={route.username ?? route.id} me={null} userId={route.id} username={route.username} onChange={() => {}} />}
        {toastBox}
      </PublicShell>
    );
  }
  const signingUp = route.page === 'signup';
  if (!me && route.page !== 'login' && !signingUp) {
    return (
      <>
        {beta}
        <Landing beta={!!config?.beta} onStart={() => go({ page: 'signup' })} onSignIn={() => go({ page: 'login' })} />
      </>
    );
  }
  if (!me) {
    return (
      <>
        {beta}
        <Login
          signUp={signingUp}
          onSignedIn={(u, signedUp) => {
            remember(u);
            setMe(u);
            // back to the page they came from (?next=); someone new is first asked once for a few
            // interests (skippable), and goes there after
            const next = nextPath();
            if (signedUp) navigate(next === '/' ? '/welcome' : `/welcome?next=${encodeURIComponent(next)}`);
            else navigate(next);
          }}
        />
      </>
    );
  }

  return (
    <People.Provider value={people}>
      {MOCK && <div className="mock-banner">{t.mockBanner}</div>}
      {beta}
      <header className="top">
        <a className="brand" href="/">
          <Icon name="heart" size={26} className="brand-mark" /> {t.app}
        </a>
        <nav>
          <a className={route.page === 'fyp' ? 'on' : ''} href="/fyp">{t.forYouTab}</a>
          <a className={route.page === 'feed' ? 'on' : ''} href="/">{t.feed}</a>
          <a className={route.page === 'letters' ? 'on' : ''} href="/letters"><Icon name="envelope" /> {t.letters}</a>
          <a className={'nav-groups' + (route.page === 'groups' || route.page === 'group' ? ' on' : '')} href="/groups"><Icon name="friends" /> {t.groups.tab}{badge}</a>
          {/* (on a phone the magnifier alone stays here: the tab bar has the groups in its place) */}
          <a className={'nav-search' + (route.page === 'search' ? ' on' : '')} href="/search" aria-label={t.search}><Icon name="magnifier" /> <span className="nav-label">{t.search}</span></a>
          <a className="write-button" href="/write">{t.write}</a>
          <a className={'me' + (route.page === 'me' ? ' on' : '')} href="/me" title={t.myPlace}>
            <Avatar user={me} size={30} />
          </a>
        </nav>
      </header>
      <VerifyBanner me={me} />
      <main key={routeKey} className={route.page === 'post' ? 'wide' : GRID_PAGES.includes(route.page) ? 'grid-page' : ''}>
        {route.page === 'feed' && <Feed me={me} />}
        {route.page === 'post' && <PostPage me={me} id={route.id} onToast={(text) => setToast({ text })} />}
        {route.page === 'write' && <Compose key={`${route.letter}-${route.to}-${route.group}`} me={me} letter={route.letter} to={route.to} group={route.group} />}
        {route.page === 'groups' && <Groups onPending={loadPending} />}
        {route.page === 'group' && <GroupView key={route.id} me={me} id={route.id} onPending={loadPending} />}
        {route.page === 'letters' && <Letters me={me} />}
        {route.page === 'fyp' && <ForYou me={me} />}
        {route.page === 'search' && <Search me={me} onChange={loadPeople} />}
        {route.page === 'welcome' && <Welcome />}
        {route.page === 'user' && <ProfilePage key={route.username ?? route.id} me={me} userId={route.id} username={route.username} onChange={loadPeople} />}
        {route.page === 'friends' && <Friends me={me} onChange={loadPeople} />}
        {route.page === 'legal' && <Legal doc={route.doc} />}
        {route.page === 'mod' && <Mod me={me} />}
        {route.page === 'me' && (
          <Place
            me={me}
            onPlan={() =>
              api.me().then((next) => {
                remember(next);
                setMe(next);
                loadPeople();
              })
            }
            onEmail={refreshMe}
            // the server ends the session (and its sockets); the tab forgets either way
            onSignOut={() => void api.logout().catch(() => {}).then(signedOut)}
            // the server has ended every session of the account; back to the landing page
            onDeleted={() => {
              navigate('/', true);
              signedOut();
            }}
          />
        )}
      </main>
      <nav className="tabbar" aria-label="tabs">
        <a className={route.page === 'feed' || route.page === 'fyp' ? 'on' : ''} href="/">
          <span><Icon name="house" size={24} /></span>
          {t.homeFriends}
        </a>
        <a className={'tab-groups' + (route.page === 'groups' || route.page === 'group' ? ' on' : '')} href="/groups">
          <span>
            <Icon name="friends" size={24} />
            {badge}
          </span>
          {t.groups.tab}
        </a>
        <a className="tab-write" href="/write">
          <span><Icon name="plus" size={22} /></span>
        </a>
        <a className={route.page === 'letters' ? 'on' : ''} href="/letters">
          <span><Icon name="envelope" size={24} /></span>
          {t.letters}
        </a>
        <a className={route.page === 'me' ? 'on' : ''} href="/me">
          <span>
            <Avatar user={me} size={22} />
          </span>
          {t.tabMe}
        </a>
      </nav>
      {toastBox}
    </People.Provider>
  );
}
