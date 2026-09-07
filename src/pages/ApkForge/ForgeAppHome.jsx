import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/forge-mobile.css';

function Icon({ children }) {
  return <span className="forge-home-icon" aria-hidden="true">{children}</span>;
}

const features = [
  {
    title: 'Image → Prompt',
    description: 'Turn a reference into a detailed AI prompt.',
    icon: '✦',
    path: '/image-to-prompt',
  },
  {
    title: 'Reference → Code',
    description: 'Turn a UI reference into a build-ready prompt.',
    icon: '⌘',
    path: '/reference-coding',
  },
];

export default function ForgeAppHome() {
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.style.backgroundColor = '#080b10';
    document.body.style.backgroundColor = '#080b10';
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
            <span>PromptStudio AI</span>
          </button>
          <button type="button" onClick={() => navigate('/account')} className="forge-menu-button" aria-label="Open menu">•••</button>
        </header>

        <main className="forge-home-content">
          <section className="forge-welcome">
            <p className="forge-welcome-kicker">AI workspace</p>
            <h1>What are you creating today?</h1>
          </section>

          <section aria-label="Create with PromptStudio" className="forge-feature-list">
            {features.map((feature) => (
              <button key={feature.path} type="button" onClick={() => navigate(feature.path)} className="forge-feature-tile">
                <span className="forge-feature-icon"><Icon>{feature.icon}</Icon></span>
                <span className="forge-feature-copy">
                  <strong>{feature.title}</strong>
                  <small>{feature.description}</small>
                </span>
                <span className="forge-feature-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </section>

          <section className="forge-recent-section">
            <div className="forge-section-heading">
              <h2>Recent</h2>
              <button type="button" onClick={() => navigate('/history')} className="forge-section-link">View all</button>
            </div>
            <button type="button" onClick={() => navigate('/history')} className="forge-recent-card">
              <span className="forge-recent-icon">◷</span>
              <span>
                <strong>Prompt history</strong>
                <small>Sign in to keep and revisit your creations.</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
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
