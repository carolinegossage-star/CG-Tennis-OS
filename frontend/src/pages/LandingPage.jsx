import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import nettyGuide from '../assets/courttoons/netty-guide-crop.webp';
import aceThumbsUp from '../assets/courttoons/ace-thumbs-up-crop.webp';
import acePoster from '../assets/courttoons/ace.svg';
import nettyPoster from '../assets/courttoons/netty.svg';
import lobsPoster from '../assets/courttoons/lobs.svg';
import spinPoster from '../assets/courttoons/spin.svg';
import smashPoster from '../assets/courttoons/smash.svg';
import actionCourtScene from '../assets/courttoons/action-court-scene.webp';

const identityCards = [
  {
    number: '01',
    title: 'Your week lives in too many places.',
    body: 'Messages, notes and bookings should not need a treasure hunt.',
    icon: 'calendar',
  },
  {
    number: '02',
    title: 'You remember the useful details on the drive home.',
    body: 'The right thought deserves a home before the next session begins.',
    icon: 'note',
  },
  {
    number: '03',
    title: 'Each player needs a clearer next step.',
    body: 'See the story, then make the next session count.',
    icon: 'path',
  },
  {
    number: '04',
    title: 'Your coaching time is the valuable part.',
    body: 'Let the admin sit quietly in the background.',
    icon: 'clock',
  },
];

const featureLines = [
  {
    number: '01',
    title: 'The week, in one view.',
    line: 'Book, track and message from one calendar.',
    voice: 'The bit where you stop chasing your own diary.',
    accent: 'mint',
  },
  {
    number: '02',
    title: 'Every player, more clearly.',
    line: "See every player's progress at a glance.",
    voice: 'The sessions where it all clicks — right there, not buried in a notebook.',
    accent: 'sun',
  },
  {
    number: '03',
    title: 'Notes that keep their meaning.',
    line: 'Turn a quick voice note into a useful session record.',
    voice: 'Say it while it is fresh. Pick it up when it matters.',
    accent: 'clay',
  },
  {
    number: '04',
    title: 'A calmer parent conversation.',
    line: 'Share the right update at the right time.',
    voice: 'Less explaining from memory. More trust in the journey.',
    accent: 'ink',
  },
];

const pillars = [
  {
    name: 'Ace',
    line: 'Hope for the next point, confidence for the next try, and room to begin again.',
    tone: 'ace',
    artwork: acePoster,
  },
  {
    name: 'Netty',
    line: 'Wise choices, fair play and respect for the lines that make the game work.',
    tone: 'netty',
    artwork: nettyPoster,
  },
  {
    name: 'Lobs',
    line: 'A longer view, a patient mind and the space to choose what matters now.',
    tone: 'lobs',
    artwork: lobsPoster,
  },
  {
    name: 'Spin',
    line: 'Fresh ideas, quick adjustment and the joy of trying a different angle.',
    tone: 'spin',
    artwork: spinPoster,
  },
  {
    name: 'Smash',
    line: 'The courage to commit, step forward and take the next brave action.',
    tone: 'smash',
    artwork: smashPoster,
  },
];

function LineIcon({ type }) {
  const common = {
    viewBox: '0 0 48 48',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2.5',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  if (type === 'calendar') {
    return <svg {...common}><rect x="7" y="10" width="34" height="31" rx="5" /><path d="M15 7v7M33 7v7M7 20h34M15 27h6M15 34h12" /></svg>;
  }
  if (type === 'note') {
    return <svg {...common}><path d="M12 7h19l7 7v27H12a4 4 0 0 1-4-4V11a4 4 0 0 1 4-4Z" /><path d="M31 7v9h9M15 25h16M15 32h11" /></svg>;
  }
  if (type === 'path') {
    return <svg {...common}><circle cx="12" cy="35" r="4" /><circle cx="36" cy="12" r="4" /><path d="M15 33c4-1 4-11 10-11s5-7 8-8M22 11h6M22 18h5" /></svg>;
  }
  return <svg {...common}><circle cx="24" cy="24" r="17" /><path d="M24 14v11l7 4" /><path d="M15 8 11 5M33 8l4-3" /></svg>;
}

function Reveal({ children, className = '', delay = 0 }) {
  return <div className={`reveal ${className}`} style={{ '--reveal-delay': `${delay}ms` }}>{children}</div>;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const handleLeadCapture = (event) => {
    event.preventDefault();
    navigate('/archetype-assessment', { state: { email } });
  };

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 16);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    const items = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    items.forEach((item) => observer.observe(item));
    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-[#fbf8f1] text-[#20251f]">
      <header className={`site-header ${isScrolled ? 'site-header-scrolled' : ''}`}>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link to="/" className="brand" onClick={closeMenu} aria-label="CG Tennis OS home">
            <span className="brand-ball" aria-hidden="true"><span /></span>
            <span>CG Tennis OS<sup>™</sup></span>
          </Link>

          <div className="desktop-nav">
            <a href="#how-it-helps">How it helps</a>
            <a href="#five-pillars">Five Pillars</a>
            <Link to="/pricing">Pricing</Link>
          </div>

          <div className="nav-actions">
            <Link to="/login" className="login-link">Login</Link>
            <button type="button" onClick={() => navigate('/archetype-assessment')} className="nav-cta">
              Start here <span aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              className="menu-toggle"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={menuOpen}
            >
              <span /><span />
            </button>
          </div>
        </nav>

        <div className={`mobile-nav ${menuOpen ? 'mobile-nav-open' : ''}`}>
          <a href="#how-it-helps" onClick={closeMenu}>How it helps</a>
          <a href="#five-pillars" onClick={closeMenu}>Five Pillars</a>
          <Link to="/pricing" onClick={closeMenu}>Pricing</Link>
          <Link to="/login" onClick={closeMenu}>Login</Link>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-orbit hero-orbit-one" aria-hidden="true" />
          <div className="hero-orbit hero-orbit-two" aria-hidden="true" />
          <div className="hero-grid" aria-hidden="true" />

          <div className="hero-content page-shell">
            <Reveal className="hero-copy">
              <p className="eyebrow"><span /> A steadier way to coach</p>
              <h1>Are you a high-performing coach? <em>Build better players, faster.</em></h1>
              <p className="hero-strapline">Coaching Intelligence. Human Wisdom.</p>
              <p className="hero-intro">One home for the coaching work that matters: the people, the plans and the small details that make a big difference.</p>

              <form onSubmit={handleLeadCapture} className="lead-form">
                <label className="sr-only" htmlFor="early-access-email">Your coaching email</label>
                <input
                  id="early-access-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Your coaching email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <button type="submit">Start your trial <span aria-hidden="true">↗</span></button>
              </form>
              <p className="form-note">A clear first step, with no fuss.</p>
              <Link to="/pricing" className="pricing-link">View pricing and plans <span aria-hidden="true">→</span></Link>
            </Reveal>

            <Reveal className="hero-side" delay={100}>
              <div className="hero-netty-wrap">
                <div className="guide-label"><span aria-hidden="true">↘</span> Your next move starts here</div>
                <img
                  src={nettyGuide}
                  className="hero-netty courttoon-artwork"
                  alt="Netty, the CourtToon guide, holding a rules book"
                />
                <div className="guide-card">
                  <span className="guide-card-dot" aria-hidden="true" />
                  <p>Make room for the coaching.</p>
                  <span>We will hold the admin.</span>
                </div>
              </div>
            </Reveal>
          </div>

          <div className="hero-bottom page-shell" aria-label="CG Tennis OS helps with your calendar, player notes and communication">
            <span>Calendar</span><i aria-hidden="true" /><span>Player story</span><i aria-hidden="true" /><span>Clear updates</span>
          </div>
        </section>

        <section className="identity-section" aria-labelledby="identity-title">
          <div className="page-shell">
            <Reveal className="section-heading section-heading-wide">
              <p className="eyebrow eyebrow-dark"><span /> A familiar feeling</p>
              <div>
                <h2 id="identity-title">Is this you?</h2>
                <p>Good coaching is personal. The admin around it does not have to be a daily scramble.</p>
              </div>
            </Reveal>

            <div className="identity-grid">
              {identityCards.map((card, index) => (
                <Reveal key={card.number} delay={index * 70}>
                  <article className="identity-card">
                    <div className="identity-card-top">
                      <span className="card-number">{card.number}</span>
                      <span className="identity-icon"><LineIcon type={card.icon} /></span>
                    </div>
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="five-pillars" className="pillars-section" aria-labelledby="pillars-title">
          <div className="page-shell">
            <Reveal className="pillars-intro">
              <p className="eyebrow eyebrow-light"><span /> Meet the family</p>
              <h2 id="pillars-title">More human, <em>on purpose.</em></h2>
              <p>CourtToons turns the habits that shape tennis into stories children, parents, players and coaches can understand, enjoy and carry with them. These five friends help make each lesson feel useful on court and off.</p>
            </Reveal>

            <div className="pillars-grid">
              {pillars.map((pillar, index) => (
                <Reveal key={pillar.name} delay={index * 70}>
                  <article className={`pillar-card pillar-${pillar.tone}`}>
                    <img
                      src={pillar.artwork}
                      className="pillar-poster"
                      alt={`${pillar.name} CourtToon pillar poster`}
                    />
                    <div className="pillar-copy">
                      <h3>{pillar.name}</h3>
                      <p>{pillar.line}</p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-helps" className="features-section" aria-labelledby="features-title">
          <div className="page-shell">
            <Reveal className="features-heading">
              <div>
                <p className="eyebrow eyebrow-dark"><span /> For the everyday work</p>
                <h2 id="features-title">Let the useful bits <em>stay useful.</em></h2>
              </div>
              <p>CG Tennis OS gives the working parts of your week a place to land, so you can keep your attention where it belongs.</p>
            </Reveal>

            <div className="feature-list">
              {featureLines.map((feature, index) => (
                <Reveal key={feature.number} delay={index * 70}>
                  <article className={`feature-row feature-${feature.accent}`}>
                    <span className="feature-number">{feature.number}</span>
                    <div className="feature-title"><span className="feature-orb" aria-hidden="true" />{feature.title}</div>
                    <div className="feature-body">
                      <p className="feature-line">{feature.line}</p>
                      <p className="feature-voice">{feature.voice}</p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="trial-section" aria-labelledby="trial-title">
          <div className="page-shell trial-grid">
            <Reveal>
              <div className="trial-copy">
                <p className="eyebrow eyebrow-dark"><span /> A good place to begin</p>
                <h2 id="trial-title">Keep the care. <em>Lose the clutter.</em></h2>
                <p>Take your time. Start with the part of your week that needs a little more breathing room.</p>
                <button type="button" onClick={() => navigate('/archetype-assessment')} className="trial-button">See your next step <span aria-hidden="true">→</span></button>
              </div>
            </Reveal>
            <Reveal className="ace-spot" delay={90}>
              <div className="ace-copy-note">You have got this.</div>
              <img
                src={aceThumbsUp}
                className="trial-ace courttoon-artwork"
                alt="Ace giving an encouraging thumbs up"
              />
              <div className="ace-confirmation"><span aria-hidden="true">✓</span> Ready when you are</div>
            </Reveal>
          </div>
        </section>

        <section className="rhythm-break" aria-label="CourtToons action scene">
          <img
            src={actionCourtScene}
            className="rhythm-scene"
            alt="CourtToons action scene with the five characters learning and playing tennis on court"
          />
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-shell footer-content">
          <div className="footer-brand"><span className="brand-ball" aria-hidden="true"><span /></span>CG Tennis OS<sup>™</sup></div>
          <p>Coaching Intelligence. Human Wisdom.</p>
          <div className="footer-links">
            <a href="#">Terms</a>
            <a href="#">Privacy</a>
            <a href="#">Contact</a>
          </div>
          <span className="footer-copy">© 2026 CG Tennis Academies.</span>
        </div>
      </footer>
    </div>
  );
}
