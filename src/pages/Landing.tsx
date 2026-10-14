import { Icon, rich } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { t } from '../text';
import { LegalLinks } from './Legal';

/** The front door: what Dear to Me is, and the way in. Signed-out visitors see it first. `beta`: a
 * closed beta, said beside the brand. */
export function Landing({ onStart, onSignIn = onStart, beta = false }: { onStart: () => void; onSignIn?: () => void; beta?: boolean }) {
  const L = t.landing;
  return (
    <div className="landing">
      <header className="landing-top">
        <span className="brand">
          <Icon name="heart" size={26} className="brand-mark" /> {t.app}
          {beta && <span className="beta-tag">{t.betaTag}</span>}
        </span>
        <div className="landing-top-right">
          <LangSwitch />
          <button className="ghost-pill" onClick={onSignIn}>
            {L.signIn}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-text">
          <h1>{L.heroTitle}</h1>
          <p className="hero-lead">{L.heroLead}</p>
          <div className="row hero-actions">
            <button className="primary big" onClick={onStart}>
              {L.start}
            </button>
            <a className="ghost-pill big" href="#how">
              {L.how}
            </a>
          </div>
          <p className="hint">{L.free}</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="demo-post">
            <img src="/seed/lofoten.jpg" alt="" />
            <div className="demo-body">
              <div className="demo-who">
                <span className="avatar" style={{ background: '#c0577a', width: 28, height: 28, fontSize: 12 }}>A</span>
                <b>Aino</b>
                <span className="live-pill">
                  <span className="dot" /> {t.liveNow}
                </span>
              </div>
              <h3>{L.demoTitle}</h3>
              <p>{L.demoText}</p>
            </div>
          </div>
          <div className="demo-chat">
            <div className="bubble">{L.demoMsg1}</div>
            <div className="bubble mine">{L.demoMsg2}</div>
            <div className="bubble">{L.demoMsg3}</div>
          </div>
          <div className="demo-note">
            <Icon name="note" size={18} /> {L.demoNote}
          </div>
        </div>
      </section>

      <section className="steps" id="how">
        <h2>{L.howTitle}</h2>
        <div className="step-grid">
          {L.steps.map((s, i) => (
            <div className="step" key={i}>
              <Icon name={s.icon} size={48} />
              <div className="step-n">{i + 1}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="features">
        <h2>{L.featuresTitle}</h2>
        <div className="feature-grid">
          {L.features.map((f, i) => (
            <div className="feature" key={i}>
              <Icon name={f.icon} size={40} />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="values">
        <div className="value-card">
          <h2>{L.valuesTitle}</h2>
          <ul>
            {L.values.map((v, i) => (
              <li key={i}>{rich(v, 22)}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="pricing">
        <h2>{L.pricingTitle}</h2>
        <div className="price-grid">
          {[L.lite, L.pro, L.exclusive].map((p, i) => (
            <div className={'price-card' + (i > 0 ? ' pro' : '')} key={i}>
              <h3>{p.name}</h3>
              <div className="price">{p.price}</div>
              <ul>
                {p.points.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="hint center">{L.pricingNote}</p>
      </section>

      <section className="closing">
        <h2>{L.closingTitle}</h2>
        <p>{L.closingText}</p>
        <button className="primary big" onClick={onStart}>
          {L.start}
        </button>
      </section>

      <footer className="landing-foot">
        <span>
          <Icon name="heart" size={16} /> {t.app}
        </span>
        <LegalLinks />
        <span className="hint">{L.footer}</span>
      </footer>
    </div>
  );
}
