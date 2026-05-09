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

function archiveDate(item) {
  const time = new Date(item.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [scanRes, paperRes] = await Promise.all([
          fetch('/api/plagiarism/history', { cache: 'no-store' }),
          fetch('/api/papers', { cache: 'no-store' })
        ]);

        if (!scanRes.ok) {
          const err = await parseJsonSafe(scanRes);
          throw new Error(err.error || 'Unable to load scan history');
        }

        if (!paperRes.ok) {
          const err = await parseJsonSafe(paperRes);
          throw new Error(err.error || 'Unable to load paper history');
        }

        const scanData = await parseJsonSafe(scanRes);
        const paperData = await parseJsonSafe(paperRes);
        const scans = (Array.isArray(scanData.scans) ? scanData.scans : [])
          .map(scan => ({ ...scan, type: 'scan' }));
        const papers = (Array.isArray(paperData.papers) ? paperData.papers : [])
          .map(paper => ({ ...paper, type: 'paper' }));

        setItems([...scans, ...papers].sort((a, b) => archiveDate(b) - archiveDate(a)));
      } catch (err) {
        setItems([]);
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
        <h1 className="hero-title">Workspace <span className="gradient-text">History</span></h1>
        <p className="hero-subtitle">Review your saved research formatting jobs and account-specific similarity scan reports.</p>
      </header>

      {loading ? (
        <div className="glass-panel reveal-2" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Loading your workspace history...</p>
        </div>
      ) : error ? (
        <div className="glass-panel reveal-2" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: '#fecaca' }}>{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="glass-panel reveal-2" style={{ textAlign: 'center', padding: '3rem' }}>
          <h3>No history found</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Format a research paper or run a similarity scan to populate this archive.
          </p>
        </div>
      ) : (
        <div className="history-list reveal-2">
          {items.map((item, index) => (
            <article
              key={`${item.type}-${item.scanId || item.id || index}`}
              className={`glass-panel reveal-${Math.min(index + 2, 4)}`}
              style={{ marginBottom: '1rem', padding: '1.25rem 1.5rem' }}
            >
              <div className="history-top">
                {item.type === 'scan' ? (
                  <>
                    <strong>{item.similarity}% similarity</strong>
                    <span style={{ color: riskColor(item.risk), textTransform: 'capitalize' }}>{item.risk}</span>
                  </>
                ) : (
                  <>
                    <strong>{item.title || 'Generated research paper'}</strong>
                    <span style={{ color: 'var(--accent-primary)', textTransform: 'capitalize' }}>{item.format || 'paper'}</span>
                  </>
                )}
              </div>
              <p className="history-meta">
                {item.type === 'scan' ? 'Similarity scan' : item.fallback ? 'Research formatter · Fallback saved' : 'Research formatter'} · {item.wordCount || 0} words · {new Date(item.createdAt).toLocaleString()}
              </p>
              <p className="history-preview">{item.preview}</p>
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
