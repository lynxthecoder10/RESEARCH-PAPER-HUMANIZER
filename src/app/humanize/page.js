'use client';
import { useState } from 'react';

export default function HumanizePage() {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (retryCount = 0) => {
    if (!text.trim()) return;

    if (retryCount > 3) {
      setIsLoading(false);
      setIsQueued(false);
      setError("System nodes are heavily congested. Please retry in a few moments.");
      return;
    }

    setIsLoading(true);
    setError('');
    if (retryCount === 0) setResult('');

    try {
      const res = await fetch('/api/humanize', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }) 
      });
      
      const data = await res.json();

      // HANDLE SOFT-BUSY
      if (data.status === 'busy') {
        setIsQueued(true);
        setTimeout(() => handleSubmit(retryCount + 1), data.retryAfter || 3000);
        return;
      }

      if (data.status === 'error' || !res.ok) throw new Error(data.message || 'Humanization failed');
      
      setResult(data.result);
      setIsQueued(false);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!isQueued) setIsLoading(false);
    }
  };

  return (
    <div className="humanize-container">
      <header className="reveal-1">
        <h1 className="hero-title">Academic <span className="gradient-text">Humanizer</span></h1>
        <p className="hero-subtitle">Refine your AI-generated research into high-fidelity academic prose that passes detection and maintains technical rigor.</p>
      </header>

      {isQueued && (
        <div className="glass-panel reveal-2" style={{ marginBottom: '2rem', borderLeft: '4px solid var(--accent-primary)', background: 'rgba(0, 255, 163, 0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="pulse-dot"></span>
            <div style={{ fontSize: '0.9rem' }}>
              <strong>Priority Queue Active:</strong> Refined processing in progress. Please wait...
            </div>
          </div>
        </div>
      )}

      <div className="grid-features reveal-2" style={{ gridTemplateColumns: result ? '1fr 1fr' : '1fr', transition: 'all 0.5s ease' }}>
        <div className="glass-panel">
          <textarea
            placeholder="Paste your research text here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="premium-input"
            style={{ 
              width: '100%', minHeight: '400px', padding: '1.5rem', borderRadius: '16px', 
              background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', 
              color: 'white', fontSize: '1rem', lineHeight: '1.7', resize: 'none', outline: 'none'
            }}
          />
          <div style={{ marginTop: '1.5rem' }}>
            <button 
              onClick={() => handleSubmit(0)}
              disabled={isLoading || !text.trim()}
              className="btn-primary"
              style={{ width: '100%' }}
            >
              {isQueued ? 'Processing in Queue...' : isLoading ? 'Humanizing...' : 'Apply Humanization'}
            </button>
          </div>
        </div>

        {result && (
          <div className="glass-panel reveal-3">
            <h3 className="gradient-text" style={{ marginBottom: '1.5rem' }}>Humanized Result</h3>
            <div style={{ 
              whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', lineHeight: '1.8', 
              fontSize: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', 
              borderRadius: '16px', border: '1px solid var(--glass-border)', minHeight: '400px'
            }}>
              {result}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .pulse-dot {
          width: 10px;
          height: 10px;
          background: var(--accent-primary);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--accent-primary);
          animation: pulse 1s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
