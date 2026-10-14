import { t } from '../text';

/** The two home pages side by side: your friends, and For You (public posts from anyone). */
export function HomeSwitch({ on }: { on: 'friends' | 'fyp' }) {
  return (
    <div className="home-switch">
      <a className={on === 'friends' ? 'on' : ''} href="/">
        {t.homeFriends}
      </a>
      <a className={on === 'fyp' ? 'on' : ''} href="/fyp">
        {t.homeForYou}
      </a>
    </div>
  );
}
