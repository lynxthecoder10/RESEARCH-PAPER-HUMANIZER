'use client';

import { useCallback, useEffect, useState } from 'react';

const STAGES = [
  'Validating document',
  'Extracting text',
  'Cleaning and hashing',
  'Retrieving academic sources',
  'Comparing similarity',
  'Estimating AI-content risk',
  'Generating integrity report',
];

function riskColor(risk) {
  const r = String(risk || '').toLowerCase();
  if (r === 'high') return '#ef4444';
  if (r === 'medium') return '#f59e0b';
  return 'var(--accent-primary)';
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export default function SimilarityCheckerClient() {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [scanId, setScanId] = useState('');
  const [documentMeta, setDocumentMeta] = useState(null);
  const [cacheHit, setCacheHit] = useState(false);
  const [processingMode, setProcessingMode] = useState('');

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const canScan = Boolean(text.trim() || file);

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

  useEffect(() => {
    let timer;
    if (loading) {
      // Fake progress timing through the stages
      timer = setInterval(() => {
        setStageIndex((prev) => {
          if (prev < STAGES.length - 1) return prev + 1;
          return prev;
        });
      }, 1500); // Progress every 1.5s
    } else {
      setStageIndex(0);
    }
    return () => clearInterval(timer);
  }, [loading]);

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
      if (!res.ok) throw new Error('Failed to logout');
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
    setDocumentMeta(null);
    setCacheHit(false);

    try {
      const formData = new FormData();
      if (text.trim()) formData.append('pasted_text', text.trim());
      if (file) formData.append('file', file);

      const res = await fetch('/api/plagiarism/scan', {
        method: 'POST',
        body: formData
      });

      const data = await parseJsonSafe(res);
      
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Similarity scan failed');
      }

      setStageIndex(STAGES.length - 1); // jump to last stage
      
      setReport(data.report);
      setScanId(data.scan_id);
      setDocumentMeta(data.document);
      setCacheHit(data.cache_hit);
      setProcessingMode(data.processing_mode);
      
      await loadHistory();
    } catch (err) {
      setError(err.message || 'Similarity scan failed');
    } finally {
      setLoading(false);
    }
  };

  const loadPastScan = async (pastScanId) => {
    setLoading(true);
    setError('');
    setReport(null);
    setScanId('');
    try {
      const res = await fetch(`/api/plagiarism/scan/${pastScanId}`);
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to load report');
      }
      // The history endpoint might return { report: {...} } depending on backend changes.
      // But we proxy to GET /api/v1/scans/{scan_id}/report which returns { cache_hit, report: {...} }
      setReport(data.report);
      setScanId(pastScanId);
      setCacheHit(true); // opening from history is a cache hit conceptually
      setProcessingMode('offline');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteHistory = async (pastScanId) => {
    try {
      const res = await fetch(`/api/plagiarism/history/${pastScanId}`, { method: 'DELETE' });
      if (res.ok) {
        await loadHistory();
        if (scanId === pastScanId) {
          setReport(null);
          setScanId('');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="similarity-page">
      <header className="similarity-header reveal-1">
        <div>
          <h1 className="hero-title">PAGGY <span className="gradient-text">Checker</span></h1>
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
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className="auth-input" />
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password (min 8 chars)" className="auth-input" />
              <button type="button" onClick={handleAuthSubmit} className="auth-button" disabled={authBusy}>
                {authBusy ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Register'}
              </button>
            </div>
          </div>
        )}
        {authError && <div className="error-box">{authError}</div>}
      </section>

      <div className="checker-grid reveal-2">
        <section className="glass-panel input-panel">
          <div className="panel-heading">
            <h2>Document Input</h2>
            <span>{file ? `${file.name} (${(file.size/1024).toFixed(1)} KB)` : 'Text or PDF/DOCX'}</span>
          </div>

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste academic text for similarity analysis..."
            className="similarity-textarea"
          />

          <div className="file-controls">
             <label className="file-drop">
               <input
                 type="file"
                 accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                 onChange={e => setFile(e.target.files?.[0] || null)}
               />
               <span>{file ? 'Change File' : 'Upload PDF, DOCX, or TXT'}</span>
               <small>Max file size: 5MB</small>
             </label>
             {file && (
               <button className="remove-file-btn" onClick={() => setFile(null)}>Remove File</button>
             )}
          </div>

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

          {loading && (
            <div className="stages-panel">
               <h3>Processing Timeline</h3>
               <ul className="stages-list">
                 {STAGES.map((stage, i) => (
                   <li key={stage} className={i < stageIndex ? 'stage-done' : i === stageIndex ? 'stage-active' : 'stage-pending'}>
                     {stage}
                   </li>
                 ))}
               </ul>
            </div>
          )}
        </section>

        <section className="report-panel">
          {report ? (
            <>
              {/* SUMMARY SECTION */}
              <div className="glass-panel summary-panel">
                <div className="panel-heading">
                  <h2>Summary</h2>
                  <div className="badges-row">
                    {cacheHit && <span className="mode-badge">Cached</span>}
                    {processingMode === 'offline' && <span className="mode-badge">Offline Mode</span>}
                  </div>
                </div>
                <div className="result-cards">
                  <div className="result-card">
                    <span>Similarity</span>
                    <strong>{report.similarity_percentage}%</strong>
                  </div>
                  <div className="result-card">
                    <span>Originality</span>
                    <strong>{report.originality_percentage}%</strong>
                  </div>
                  <div className="result-card">
                    <span>Similarity Risk</span>
                    <strong style={{ color: riskColor(report.similarity_risk_level) }}>{report.similarity_risk_level}</strong>
                  </div>
                </div>
              </div>

              {/* AI RISK SECTION */}
              <div className="glass-panel ai-risk-panel">
                 <div className="panel-heading">
                    <h2>AI Content Risk Estimate</h2>
                    <strong style={{ color: riskColor(report.ai_content_risk?.risk_level) }}>
                      {report.ai_content_risk?.risk_level?.toUpperCase() || 'UNKNOWN'}
                    </strong>
                 </div>
                 <div className="ai-signals">
                   <p className="ai-score">Risk Score: {report.ai_content_risk?.risk_score}</p>
                   {report.ai_content_risk?.signals?.map((s, i) => (
                      <div key={i} className="signal-pill">{s}</div>
                   ))}
                 </div>
                 <div className="info-banner" style={{ marginTop: '1rem' }}>
                    AI Content Risk is a statistical estimate and cannot prove AI authorship.
                 </div>
              </div>

              {/* MATCHED SOURCES */}
              <div className="glass-panel matches-panel">
                <div className="panel-heading">
                  <h2>Matched Sources</h2>
                  <span>{report.matched_sources?.length || 0} sources</span>
                </div>
                {report.matched_sources?.length > 0 ? (
                  <div className="match-list">
                    {report.matched_sources.map((src, i) => (
                      <article key={i} className="match-item">
                        <div>
                          <strong>{src.candidate_relevance_score?.toFixed(2)} Relevance</strong>
                          <span>{src.provider}</span>
                        </div>
                        <h4>{src.title}</h4>
                        <p>{src.authors} ({src.publication_year})</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">No matching sources found.</div>
                )}
              </div>

              {/* MATCHED PARAGRAPHS */}
              <div className="glass-panel matches-panel">
                <div className="panel-heading">
                  <h2>Matched Paragraphs</h2>
                  <span>{report.matched_paragraphs?.length || 0} paragraphs</span>
                </div>
                {report.matched_paragraphs?.length > 0 ? (
                  <div className="match-list">
                    {report.matched_paragraphs.map((p, i) => (
                      <article key={i} className="match-item paragraph-match">
                        <div className="match-header">
                           <strong>{(p.similarity_score * 100).toFixed(1)}% similar</strong>
                           <span>Source: {p.source_title}</span>
                        </div>
                        <div className="excerpt-comparison">
                           <div className="excerpt">
                              <small>Your Document:</small>
                              <p>{p.document_excerpt}</p>
                           </div>
                           <div className="excerpt">
                              <small>Matched Source:</small>
                              <p>{p.matched_excerpt}</p>
                           </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">No highly similar paragraphs detected.</div>
                )}
              </div>

              {/* LIMITATIONS & RECOMMENDATIONS */}
              <div className="glass-panel limitations-panel">
                 <div className="panel-heading"><h2>Limitations</h2></div>
                 <ul className="limitation-list">
                   {processingMode === 'offline' && (
                     <li><strong style={{color:'var(--accent-primary)'}}>PAGGY is currently using a bundled synthetic demonstration corpus. Results do not represent exhaustive scholarly or internet-wide plagiarism coverage.</strong></li>
                   )}
                   {report.limitations?.map((lim, i) => <li key={i}>{lim}</li>)}
                 </ul>
              </div>

              {report.recommendations?.length > 0 && (
                <div className="glass-panel recommendations-panel">
                   <div className="panel-heading"><h2>Recommendations</h2></div>
                   <ul className="recommendation-list">
                     {report.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
                   </ul>
                </div>
              )}

              {scanId && <div className="scan-id" style={{padding: '0 1rem'}}>Scan ID: {scanId}</div>}
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
                  <article key={item.scan_id || item.scanId} className="history-item">
                    <div className="history-top">
                      <strong>{item.similarity_percentage ?? item.similarity}% similarity</strong>
                      <span style={{ color: riskColor(item.ai_risk_level ?? item.risk) }}>{item.ai_risk_level ?? item.risk} Risk</span>
                    </div>
                    <p style={{marginBottom:'10px'}}>{item.filename || 'Pasted text'} • {new Date(item.created_at || item.createdAt).toLocaleDateString()}</p>
                    <div className="history-actions" style={{display:'flex', gap:'10px'}}>
                      <button className="auth-button" style={{padding:'0.4rem 0.8rem', fontSize:'0.85rem'}} onClick={() => loadPastScan(item.scan_id || item.scanId)}>View Report</button>
                      <button className="remove-file-btn" onClick={() => deleteHistory(item.scan_id || item.scanId)}>Delete</button>
                    </div>
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
        .signal-pill {
          border: 1px solid rgba(0, 255, 163, 0.25);
          background: rgba(0, 255, 163, 0.08);
          color: var(--accent-primary);
          border-radius: 999px;
          padding: 0.45rem 0.8rem;
          font-size: 0.78rem;
          font-weight: 700;
          width: fit-content;
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
        .history-panel,
        .summary-panel,
        .ai-risk-panel,
        .limitations-panel,
        .recommendations-panel {
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
        .badges-row {
          display: flex;
          gap: 0.5rem;
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
        .remove-file-btn {
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.35);
          color: #ef4444;
          border-radius: 8px;
          padding: 0.5rem 1rem;
          cursor: pointer;
        }
        .file-controls {
          display: flex;
          gap: 1rem;
          align-items: center;
          margin-top: 1rem;
        }
        .similarity-textarea {
          min-height: 250px;
          resize: vertical;
          line-height: 1.7;
          border-radius: 14px;
          padding: 1rem;
        }
        .file-drop {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 1rem;
          border: 1px dashed rgba(0, 255, 163, 0.35);
          border-radius: 14px;
          cursor: pointer;
          color: var(--text-primary);
          flex: 1;
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
          font-size: 1.6rem;
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
        .match-item h4 {
           margin-bottom: 0.5rem;
           color: #fff;
        }
        .match-item span,
        .match-item p,
        .history-item p,
        .placeholder-panel p {
          color: var(--text-secondary);
        }
        .excerpt-comparison {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-top: 0.75rem;
          background: rgba(0,0,0,0.2);
          padding: 1rem;
          border-radius: 8px;
        }
        .excerpt small {
          color: var(--accent-primary);
          display: block;
          margin-bottom: 0.3rem;
        }
        .empty-state {
          color: var(--text-secondary);
          padding: 1rem 0;
          text-align: center;
        }
        .ai-signals {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          align-items: center;
        }
        .ai-score {
           color: var(--text-primary);
           font-weight: 600;
           margin-right: 1rem;
        }
        .limitation-list, .recommendation-list {
           list-style: disc;
           padding-left: 1.5rem;
           color: var(--text-secondary);
           display: flex;
           flex-direction: column;
           gap: 0.5rem;
        }
        .stages-panel {
           margin-top: 1.5rem;
           padding: 1.5rem;
           background: rgba(0,0,0,0.2);
           border-radius: 12px;
        }
        .stages-list {
           list-style: none;
           padding: 0;
           display: flex;
           flex-direction: column;
           gap: 0.5rem;
           margin-top: 1rem;
        }
        .stages-list li {
           padding-left: 1.5rem;
           position: relative;
           color: var(--text-secondary);
        }
        .stage-done {
           color: var(--accent-primary) !important;
        }
        .stage-done::before {
           content: "✓";
           position: absolute;
           left: 0;
        }
        .stage-active {
           color: #fff !important;
           font-weight: 600;
        }
        .stage-active::before {
           content: "○";
           position: absolute;
           left: 0;
        }
        .stage-pending::before {
           content: "•";
           position: absolute;
           left: 0;
        }
        @media (max-width: 980px) {
          .checker-grid,
          .result-cards {
            grid-template-columns: 1fr;
          }
          .auth-form {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
