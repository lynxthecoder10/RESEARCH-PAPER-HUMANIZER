'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

function modeLabel(provider) {
  return provider === 'copyleaks'
    ? 'Live Scan – Copyleaks'
    : 'Demo Mode – Local Similarity Analysis';
}

function riskColor(risk) {
  if (risk === 'high') return '#ef4444';
  if (risk === 'medium') return '#f59e0b';
  return 'var(--accent-primary)';
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export default function SimilarityCheckerClient({ initialProvider = 'mock' }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [scanId, setScanId] = useState('');
  const [provider, setProvider] = useState(initialProvider);

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const canScan = useMemo(() => Boolean(text.trim() || file), [text, file]);

  const loadUser = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!res.ok) {
        const err = await parseJsonSafe(res);
        throw new Error(err.error || 'Failed to load user');
      }
      const data = await parseJsonSafe(res);
      setUser(data.user || null);
    } catch (err) {
      setUser(null);
      setAuthError(err.message || 'Failed to load user');
    } finally {
      setAuthLoading(false);
    }
  };

  const loadHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      return;
    }

    setHistoryLoading(true);
    try {
      const res = await fetch('/api/plagiarism/history', { cache: 'no-store' });
      if (!res.ok) {
        const err = await parseJsonSafe(res);
        throw new Error(err.error || 'Failed to load history');
      }
      const data = await parseJsonSafe(res);
      setHistory(Array.isArray(data.scans) ? data.scans : []);
    } catch (err) {
      setHistory([]);
      setError(err.message || 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleAuthSubmit = async () => {
    if (authBusy) return;

    setAuthBusy(true);
    setAuthError('');
    try {
      const res = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        const err = await parseJsonSafe(res);
        throw new Error(err.error || `Failed to ${authMode}`);
      }

      const data = await parseJsonSafe(res);
      if (!data.user) {
        throw new Error(`Failed to ${authMode}`);
      }

      setUser(data.user);
      setPassword('');
      setAuthError('');
    } catch (err) {
      setAuthError(err.message || `Failed to ${authMode}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) {
        const err = await parseJsonSafe(res);
        throw new Error(err.error || 'Failed to logout');
      }
      setUser(null);
      setHistory([]);
      setReport(null);
      setScanId('');
      setError('');
    } catch (err) {
      setAuthError(err.message || 'Failed to logout');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleScan = async () => {
    if (!canScan || loading || !user) return;

    setLoading(true);
    setError('');
    setReport(null);
    setScanId('');

    try {
      const formData = new FormData();
      if (text.trim()) formData.append('text', text.trim());
      if (file) formData.append('file', file);

      const res = await fetch('/api/plagiarism/scan', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await parseJsonSafe(res);
        throw new Error(err.error || 'Similarity scan failed');
      }

      const data = await parseJsonSafe(res);
      if (data.error || !data.report) {
        throw new Error(data.error || 'Similarity scan failed');
      }

      setReport(data.report);
      setProvider(data.report?.provider || initialProvider);
      setScanId(data.scanId);
      await loadHistory();
    } catch (err) {
      setError(err.message || 'Similarity scan failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="similarity-page">
      <header className="similarity-header reveal-1">
        <div>
          <div className="mode-badge">{modeLabel(provider)}</div>
          <h1 className="hero-title">Similarity <span className="gradient-text">Checker</span></h1>
          <p className="hero-subtitle">
            Analyze academic text for local repetition and similarity signals while keeping the report honest about originality.
          </p>
        </div>
      </header>

      <section className="glass-panel auth-panel reveal-2">
        {authLoading ? (
          <p className="auth-status">Checking session...</p>
        ) : user ? (
          <div className="auth-row">
            <div>
              <h2>Signed in</h2>
              <p className="auth-status">{user.email}</p>
            </div>
            <button type="button" onClick={handleLogout} className="auth-button" disabled={authBusy}>
              {authBusy ? 'Please wait...' : 'Sign out'}
            </button>
          </div>
        ) : (
          <div>
            <div className="auth-row">
              <h2>{authMode === 'login' ? 'Login' : 'Register'}</h2>
              <button
                type="button"
                className="auth-toggle"
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                disabled={authBusy}
              >
                {authMode === 'login' ? 'Need an account?' : 'Have an account?'}
              </button>
            </div>
            <div className="auth-form">
              <input
                value={email}
                onChange={event => setEmail(event.target.value)}
                type="email"
                placeholder="Email"
                className="auth-input"
              />
              <input
                value={password}
                onChange={event => setPassword(event.target.value)}
                type="password"
                placeholder="Password (min 8 chars)"
                className="auth-input"
              />
              <button type="button" onClick={handleAuthSubmit} className="auth-button" disabled={authBusy}>
                {authBusy ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Register'}
              </button>
            </div>
          </div>
        )}
        {authError && <div className="error-box">{authError}</div>}
      </section>

      <section className="info-banner reveal-2">
        This is a similarity analysis, not a definitive plagiarism verdict.
      </section>

      <div className="checker-grid reveal-2">
        <section className="glass-panel input-panel">
          <div className="panel-heading">
            <h2>Input Panel</h2>
            <span>{file ? file.name : 'Text or PDF/DOCX'}</span>
          </div>

          <textarea
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder="Paste academic text for similarity analysis..."
            className="similarity-textarea"
          />

          <label className="file-drop">
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={event => setFile(event.target.files?.[0] || null)}
            />
            <span>{file ? file.name : 'Upload PDF or DOCX'}</span>
            <small>Maximum file size: 200KB</small>
          </label>

          <button
            onClick={handleScan}
            disabled={!canScan || loading || !user}
            className="btn-primary scan-button"
          >
            {loading ? 'Analyzing...' : 'Run Similarity Analysis'}
          </button>

          {!user && !authLoading && (
            <div className="empty-state">Login or register to run a scan.</div>
          )}

          {error && <div className="error-box">{error}</div>}
        </section>

        <section className="report-panel">
          {report ? (
            <>
              <div className="result-cards">
                <div className="result-card">
                  <span>Similarity</span>
                  <strong>{report.similarity}%</strong>
                </div>
                <div className="result-card">
                  <span>Originality</span>
                  <strong>{report.originality}%</strong>
                </div>
                <div className="result-card">
                  <span>Risk</span>
                  <strong style={{ color: riskColor(report.risk) }}>{report.risk}</strong>
                </div>
              </div>

              <div className="glass-panel matches-panel">
                <div className="panel-heading">
                  <h2>Matches List</h2>
                  <span>{report.wordCount} words</span>
                </div>

                {report.matches.length ? (
                  <div className="match-list">
                    {report.matches.map((match, index) => (
                      <article key={`${match.source}-${index}`} className="match-item">
                        <div>
                          <strong>{match.similarity}% similar</strong>
                          <span>{match.source}</span>
                        </div>
                        <p>{match.text}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">No strong local similarity matches were detected.</div>
                )}
              </div>

              <div className="flag-row">
                {report.flags.map((flag, index) => (
                  <span key={`${flag.type}-${index}`} className="flag-pill">
                    {flag.type}: {flag.severity}
                  </span>
                ))}
              </div>

              {scanId && <div className="scan-id">Scan ID: {scanId}</div>}
            </>
          ) : (
            <div className="glass-panel placeholder-panel">
              <h2>Structured Report</h2>
              <p>Run an analysis to view similarity, originality, risk, matches, and local repetition flags.</p>
            </div>
          )}

          <div className="glass-panel history-panel">
            <div className="panel-heading">
              <h2>Your Recent Scans</h2>
              <span>{history.length} items</span>
            </div>

            {historyLoading ? (
              <div className="empty-state">Loading history...</div>
            ) : history.length ? (
              <div className="history-list">
                {history.map(item => (
                  <article key={item.scanId} className="history-item">
                    <div className="history-top">
                      <strong>{item.similarity}% similarity</strong>
                      <span style={{ color: riskColor(item.risk) }}>{item.risk}</span>
                    </div>
                    <p>{item.preview}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">No scans yet for this account.</div>
            )}
          </div>
        </section>
      </div>

      <style jsx>{`
        .similarity-page {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .similarity-header {
          max-width: 920px;
        }
        .hero-subtitle {
          color: var(--text-secondary);
          max-width: 760px;
          font-size: 1.1rem;
        }
        .mode-badge,
        .info-banner,
        .flag-pill {
          border: 1px solid rgba(0, 255, 163, 0.25);
          background: rgba(0, 255, 163, 0.08);
          color: var(--accent-primary);
          border-radius: 999px;
          padding: 0.45rem 0.8rem;
          font-size: 0.78rem;
          font-weight: 700;
          width: fit-content;
          margin-bottom: 1rem;
        }
        .info-banner {
          border-radius: 14px;
          width: 100%;
          margin: 0;
          padding: 1rem 1.25rem;
        }
        .checker-grid {
          display: grid;
          grid-template-columns: minmax(320px, 0.9fr) minmax(320px, 1.1fr);
          gap: 1.5rem;
          align-items: start;
        }
        .input-panel,
        .matches-panel,
        .placeholder-panel,
        .auth-panel,
        .history-panel {
          padding: 2rem;
        }
        .panel-heading,
        .auth-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .panel-heading h2,
        .auth-panel h2 {
          font-size: 1.1rem;
        }
        .panel-heading span {
          color: var(--text-secondary);
          font-size: 0.82rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .auth-status {
          color: var(--text-secondary);
        }
        .auth-form {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .auth-input,
        .similarity-textarea {
          width: 100%;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--glass-border);
          border-radius: 12px;
          padding: 0.85rem 0.95rem;
          color: #fff;
          font: inherit;
          outline: none;
        }
        .auth-button,
        .auth-toggle {
          border: 1px solid var(--glass-border);
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
          color: var(--text-primary);
          cursor: pointer;
          padding: 0.85rem 0.95rem;
          font: inherit;
          font-weight: 600;
        }
        .auth-button {
          border-color: rgba(0, 255, 163, 0.35);
          color: var(--accent-primary);
        }
        .similarity-textarea {
          min-height: 300px;
          resize: vertical;
          line-height: 1.7;
          border-radius: 14px;
          padding: 1rem;
        }
        .file-drop {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          margin-top: 1rem;
          padding: 1rem;
          border: 1px dashed rgba(0, 255, 163, 0.35);
          border-radius: 14px;
          cursor: pointer;
          color: var(--text-primary);
        }
        .file-drop input {
          display: none;
        }
        .file-drop small {
          color: var(--text-secondary);
        }
        .scan-button {
          width: 100%;
          margin-top: 1rem;
          opacity: 1;
        }
        .scan-button:disabled,
        .auth-button:disabled,
        .auth-toggle:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .error-box {
          margin-top: 1rem;
          color: #fecaca;
          border: 1px solid rgba(239, 68, 68, 0.35);
          background: rgba(239, 68, 68, 0.1);
          border-radius: 12px;
          padding: 0.9rem 1rem;
        }
        .report-panel {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .result-cards {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
        }
        .result-card {
          border: 1px solid var(--glass-border);
          background: rgba(255,255,255,0.035);
          border-radius: 16px;
          padding: 1.2rem;
        }
        .result-card span,
        .scan-id {
          color: var(--text-secondary);
          font-size: 0.8rem;
        }
        .result-card strong {
          display: block;
          margin-top: 0.4rem;
          font-size: 2rem;
          line-height: 1;
        }
        .match-list,
        .history-list {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .match-item,
        .history-item {
          border: 1px solid var(--glass-border);
          background: rgba(255,255,255,0.025);
          border-radius: 14px;
          padding: 1rem;
        }
        .match-item div,
        .history-top {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.65rem;
        }
        .match-item span,
        .match-item p,
        .history-item p,
        .placeholder-panel p {
          color: var(--text-secondary);
        }
        .empty-state {
          color: var(--text-secondary);
          padding: 1rem 0;
          text-align: center;
        }
        .flag-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }
        .flag-pill {
          margin: 0;
        }
        @media (max-width: 980px) {
          .checker-grid,
          .result-cards {
            grid-template-columns: 1fr;
          }
          .auth-form {
            grid-template-columns: 1fr;
          }
          .hero-title {
            font-size: 3.5rem;
          }
        }
        @media (max-width: 640px) {
          .similarity-page {
            gap: 1.25rem;
          }
          .hero-title {
            font-size: 2.5rem;
          }
          .hero-subtitle {
            font-size: 0.95rem;
          }
          .mode-badge,
          .info-banner,
          .flag-pill {
            border-radius: 12px;
            width: 100%;
            line-height: 1.45;
          }
          .input-panel,
          .matches-panel,
          .placeholder-panel,
          .auth-panel,
          .history-panel {
            padding: 1.2rem;
          }
          .panel-heading,
          .match-item div,
          .history-top {
            align-items: flex-start;
            flex-direction: column;
            gap: 0.35rem;
          }
          .panel-heading span {
            max-width: 100%;
          }
          .similarity-textarea {
            min-height: 220px;
            font-size: 0.95rem;
          }
          .result-cards {
            gap: 0.75rem;
          }
          .result-card {
            padding: 1rem;
          }
          .result-card strong {
            font-size: 1.6rem;
          }
        }
      `}</style>
    </div>
  );
}
