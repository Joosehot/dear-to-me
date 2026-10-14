import { LANGS, lang, setLang, t } from '../text';

/** Suomi | English: the texts change at once and the choice is remembered. */
export function LangSwitch() {
  return (
    <div className="lang-switch" role="group" aria-label={t.language}>
      {LANGS.map((l) => (
        <button key={l.lang} className={lang() === l.lang ? 'on' : ''} onClick={() => setLang(l.lang)}>
          {l.name}
        </button>
      ))}
    </div>
  );
}
