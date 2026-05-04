import Link from 'next/link';

export default function Home() {
  return (
    <div className="dashboard-hero">
      <header className="reveal-1">
        <h1 className="hero-title">
          Academic <span className="gradient-text">Suite</span>
        </h1>
        <p className="hero-subtitle">
          The all-in-one professional platform for high-fidelity research generation, 
          AI humanization, and academic integrity management.
        </p>
      </header>

      <div className="grid-features">
        <Link href="/generate" className="feature-card reveal-2">
          <div className="glass-panel">
            <div className="icon-box">📝</div>
            <h3>Paper Generator</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Generate full IEEE research papers with verified citations and professional formatting.
            </p>
          </div>
        </Link>

        <Link href="/humanize" className="feature-card reveal-3">
          <div className="glass-panel">
            <div className="icon-box">✨</div>
            <h3>Humanizer</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Bypass AI detection while maintaining academic rigor and technical precision.
            </p>
          </div>
        </Link>

        <Link href="/history" className="feature-card reveal-4">
          <div className="glass-panel">
            <div className="icon-box">📜</div>
            <h3>History Archive</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Access and download your past research generations securely from the cloud.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
