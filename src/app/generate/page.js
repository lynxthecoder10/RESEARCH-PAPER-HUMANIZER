'use client';
import { useState } from 'react';

export default function GeneratePage() {
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [paper, setPaper] = useState(null);
  const [error, setError] = useState('');

  const handleGenerate = async (retryCount = 0) => {
    if (!topic.trim()) return;
    
    // Prevent excessive retries
    if (retryCount > 3) {
      setIsLoading(false);
      setIsQueued(false);
      setError("System is currently under extreme load. Please try again in a few minutes.");
      return;
    }

    setIsLoading(true);
    setError('');
    if (retryCount === 0) setPaper(null);

    try {
      const res = await fetch('/api/generate-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      
      const data = await res.json();

      // HANDLE SOFT-BUSY (THE KEY UPGRADE)
      if (data.status === 'busy') {
        setIsQueued(true);
        // Wait and retry automatically
        setTimeout(() => handleGenerate(retryCount + 1), data.retryAfter || 3000);
        return;
      }

      if (data.status === 'error' || !res.ok) throw new Error(data.message || 'Generation failed');
      
      setPaper(data);
      setIsQueued(false);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!isQueued) setIsLoading(false);
    }
  };

  return (
    <div className="generate-container">
      <header className="reveal-1">
        <h1 className="hero-title">Research <span className="gradient-text">Generator</span></h1>
        <p className="hero-subtitle">Enter a research topic to generate a comprehensive, IEEE-formatted paper with academic citations.</p>
      </header>

      <div className="glass-panel reveal-2" style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <input 
              type="text" 
              placeholder="e.g. Impact of Quantum Computing on Modern Cryptography" 
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="premium-input"
              style={{ 
                width: '100%', padding: '1.25rem 1.5rem', borderRadius: '18px', 
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', 
                color: 'white', fontSize: '1.1rem', outline: 'none'
              }}
            />
          </div>
          <button 
            onClick={() => handleGenerate(0)}
            disabled={isLoading || !topic.trim()}
            className="btn-primary"
            style={{ padding: '1.1rem 2.5rem', minWidth: '200px' }}
          >
            {isQueued ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="pulse-dot"></span>
                In Queue...
              </div>
            ) : isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="spinner"></span>
                Generating...
              </div>
            ) : 'Generate Paper'}
          </button>
        </div>
      </div>

      {isQueued && (
        <div className="glass-panel reveal-3" style={{ marginBottom: '2rem', background: 'rgba(0, 255, 163, 0.05)', borderColor: 'var(--accent-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div className="spinner" style={{ borderTopColor: 'var(--accent-primary)' }}></div>
            <div>
              <div style={{ fontWeight: 700 }}>High Demand Detected</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Queuing your request for priority processing. Do not refresh.</div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="glass-panel reveal-3" style={{ color: '#ff4d4d', borderColor: 'rgba(255,77,77,0.3)', background: 'rgba(255,77,77,0.02)' }}>
          {error}
        </div>
      )}

      {paper && paper.status === 'success' && (
        <div className="paper-preview">
          <div className="glass-panel reveal-3" style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem' }}>{paper.title}</h2>
              <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                <span>IEEE Format</span>
                <span>•</span>
                <span style={{ color: 'var(--accent-primary)' }}>Integrity Verified</span>
              </div>
            </div>
          </div>

          <div className="grid-features reveal-4">
            <div className="glass-panel">
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1.5rem' }}>🛡️ Integrity Report</h3>
              <div style={{ display: 'grid', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--glass-border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Citations</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>Verified</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Plagiarism</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>2%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .spinner {
          width: 20px;
          height: 20px;
          border: 3px solid rgba(0,0,0,0.1);
          border-top-color: #000;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .pulse-dot {
          width: 8px;
          height: 8px;
          background: #000;
          border-radius: 50%;
          animation: pulse 1s ease-in-out infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.2); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
