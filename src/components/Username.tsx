import { useEffect, useState } from 'react';
import type { User, UsernameCheck } from '../../shared/types';
import { USERNAME_MAX, normalUsername, usernameProblem } from '../../shared/usernames';
import { api } from '../api';
import { t } from '../text';

/** Someone's @username, small and quiet beside their name. */
export function Handle({ user }: { user?: Pick<User, 'username'> }) {
  if (!user?.username) return null;
  return <span className="handle">@{user.username}</span>;
}

/** The live check of a username as it is typed: the rule at once, then the server (after a pause in
 * the typing). `mine`: your own username now, which is no news. Null while nothing is known yet. */
export function useUsernameCheck(raw: string, mine?: string) {
  const name = normalUsername(raw);
  const [check, setCheck] = useState<(UsernameCheck & { name: string }) | null>(null);
  useEffect(() => {
    setCheck(null);
    if (!name || name === mine) return;
    const problem = usernameProblem(name);
    if (problem && problem !== 'reserved') return setCheck({ name, available: false, reason: problem });
    const timer = setTimeout(() => {
      api
        .checkUsername(name)
        .then((c) => setCheck({ ...c, name }))
        // no answer (the brake, no server): the server says it on saving
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [name, mine]);
  // an answer for an older name is no answer
  return check?.name === name ? check : null;
}

/** A username field: @ before it, what the check says under it, and a free one to take if it is not. */
export function UsernameField({ id, value, onChange, check, hint }: { id: string; value: string; onChange: (v: string) => void; check: UsernameCheck | null; hint?: string }) {
  return (
    <>
      <span className="handle-input">
        <span className="at">@</span>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/^@/, '').toLowerCase())}
          maxLength={USERNAME_MAX + 1}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </span>
      {check?.available && <span className="hint username-ok">{t.usernameFree}</span>}
      {check && !check.available && (
        <span className="username-no">
          <span className="error" role="alert">{t.usernameReasons[check.reason ?? 'taken']}</span>
          {check.suggestion && (
            <button type="button" className="chip" onClick={() => onChange(check.suggestion!)}>
              {t.usernameTake(check.suggestion)}
            </button>
          )}
        </span>
      )}
      {!check && hint && <span className="hint">{hint}</span>}
    </>
  );
}
