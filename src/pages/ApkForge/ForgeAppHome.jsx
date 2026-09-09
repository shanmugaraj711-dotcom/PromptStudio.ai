import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/forge-mobile.css';

function Icon({ children }) {
  return <span className="forge-home-icon" aria-hidden="true">{children}</span>;
}

const features = [
  {
    eyebrow: 'VISUAL LANGUAGE',
    title: 'Image → Prompt',
    description: 'Turn a reference into a detailed AI prompt.',
    icon: '✦',
    path: '/image-to-prompt',
  },
  {
    eyebrow: 'PRODUCT BLUEPRINT',
    title: 'Reference → Code',
    description: 'Turn a UI reference into a build-ready prompt.',
    icon: '⌘',
    path: '/reference-coding',
  },
];

export default function ForgeAppHome() {
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.style.backgroundColor = '#080a0f';
    document.body.style.backgroundColor = '#080a0f';
    return () => {
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, []);

  return (
    <div className="forge-app-shell">
      <div className="forge-app-frame">
        <header className="forge-app-topbar">
          <button type="button" onClick={() => navigate('/')} className="forge-app-brand" aria-label="PromptStudio home">
            <span className="forge-app-mark">P</span>
            <span>PromptStudio <em>AI</em></span>
          </button>
          <button type="button" onClick={() => navigate('/account')} className="forge-menu-button" aria-label="Open account">•••</button>
        </header>

        <main className="forge-home-content">
          <section className="forge-welcome" aria-labelledby="home-title">
            <div className="forge-welcome-copy">
              <p className="forge-welcome-kicker"><span /> CREATIVE COMMAND CENTER</p>
              <h1 id="home-title">Make the idea<br /><span>impossible to miss.</span></h1>
              <p className="forge-welcome-description">Transform references into prompts that move projects forward.</p>
            </div>
            <div className="forge-orbit-art" aria-hidden="true"><span className="forge-orbit-ring forge-orbit-ring-one" /><span className="forge-orbit-ring forge-orbit-ring-two" /><span className="forge-orbit-core">P</span></div>
          </section>

          <section aria-labelledby="create-heading" className="forge-create-section">
            <div className="forge-section-heading forge-create-heading">
              <div><p className="forge-section-eyebrow">START FROM A REFERENCE</p><h2 id="create-heading">Choose your starting point</h2></div>
              <span className="forge-section-count">02 paths</span>
            </div>
            <div className="forge-feature-list">
              {features.map((feature, index) => (
                <button key={feature.path} type="button" onClick={() => navigate(feature.path)} className={`forge-feature-tile forge-feature-tile-${index + 1}`}>
                  <span className="forge-feature-index">0{index + 1}</span>
                  <span className="forge-feature-icon"><Icon>{feature.icon}</Icon></span>
                  <span className="forge-feature-copy"><small>{feature.eyebrow}</small><strong>{feature.title}</strong><span>{feature.description}</span></span>
                  <span className="forge-feature-arrow" aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </section>

          <section className="forge-recent-section" aria-labelledby="recent-heading">
            <div className="forge-section-heading"><div><p className="forge-section-eyebrow">YOUR WORKSPACE</p><h2 id="recent-heading">Recent activity</h2></div><button type="button" onClick={() => navigate('/history')} className="forge-section-link">View all <span aria-hidden="true">↗</span></button></div>
            <button type="button" onClick={() => navigate('/history')} className="forge-recent-card"><span className="forge-recent-icon">◷</span><span><strong>Your prompt history</strong><small>Sign in to save and revisit every creative direction.</small></span><span aria-hidden="true">→</span></button>
          </section>
        </main>

        <nav className="forge-bottom-nav" aria-label="App navigation">
          <button type="button" onClick={() => navigate('/')} className="forge-nav-item is-active"><span>⌂</span><small>Home</small></button>
          <button type="button" onClick={() => navigate('/image-to-prompt')} className="forge-nav-item"><span>✦</span><small>Create</small></button>
          <button type="button" onClick={() => navigate('/history')} className="forge-nav-item"><span>◷</span><small>History</small></button>
          <button type="button" onClick={() => navigate('/account')} className="forge-nav-item"><span>◉</span><small>Account</small></button>
        </nav>
      </div>
    </div>
  );
}
