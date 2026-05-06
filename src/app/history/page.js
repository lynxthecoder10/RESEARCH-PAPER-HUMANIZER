'use client';
import { useEffect, useState } from 'react';

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function riskColor(risk) {
  if (risk === 'high') return '#ef4444';
  if (risk === 'medium') return '#f59e0b';
  return 'var(--accent-primary)';
}

export default function HistoryPage() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/plagiarism/history', { cache: 'no-store' });
        if (!res.ok) {
          const err = await parseJsonSafe(res);
          throw new Error(err.error || 'Unable to load history');
        }
        const data = await parseJsonSafe(res);
        setScans(Array.isArray(data.scans) ? data.scans : []);
      } catch (err) {
        setScans([]);
        setError(err.message || 'Unable to load history');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="history-container">
      <header className="reveal-1">
        <h1 className="hero-title">Similarity <span className="gradient-text">History</span></h1>
        <p className="hero-subtitle">Review your account-specific similarity scan reports.</p>
      </header>

      {loading ? (
        <div className="glass-panel reveal-2" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Loading your scan history...</p>
        </div>
      ) : error ? (
        <div className="glass-panel reveal-2" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: '#fecaca' }}>{error}</p>
        </div>
      ) : scans.length === 0 ? (
        <div className="glass-panel reveal-2" style={{ textAlign: 'center', padding: '3rem' }}>
          <h3>No scan history found</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Run a similarity scan after signing in to populate this archive.
          </p>
        </div>
      ) : (
        <div className="history-list reveal-2">
          {scans.map((scan, index) => (
            <article
              key={scan.scanId || index}
              className={`glass-panel reveal-${Math.min(index + 2, 4)}`}
              style={{ marginBottom: '1rem', padding: '1.25rem 1.5rem' }}
            >
              <div className="history-top">
                <strong>{scan.similarity}% similarity</strong>
                <span style={{ color: riskColor(scan.risk), textTransform: 'capitalize' }}>{scan.risk}</span>
              </div>
              <p className="history-meta">
                {scan.wordCount} words · {new Date(scan.createdAt).toLocaleString()}
              </p>
              <p className="history-preview">{scan.preview}</p>
            </article>
          ))}
        </div>
      )}

      <style jsx>{`
        .history-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }
        .history-meta,
        .history-preview {
          color: var(--text-secondary);
        }
        .history-meta {
          font-size: 0.85rem;
          margin-bottom: 0.65rem;
        }
        @media (max-width: 700px) {
          .history-top {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
