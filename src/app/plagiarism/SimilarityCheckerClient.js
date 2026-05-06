'use client';

import { useMemo, useState } from 'react';

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

export default function SimilarityCheckerClient({ initialProvider = 'mock' }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [scanId, setScanId] = useState('');
  const [provider, setProvider] = useState(initialProvider);

  const canScan = useMemo(() => Boolean(text.trim() || file), [text, file]);

  const handleScan = async () => {
    if (!canScan || loading) return;

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
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Similarity scan failed');
      }

      setReport(data.report);
      setProvider(data.report?.provider || initialProvider);
      setScanId(data.scanId);
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
            disabled={!canScan || loading}
            className="btn-primary scan-button"
          >
            {loading ? 'Analyzing...' : 'Run Similarity Analysis'}
          </button>

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
        </section>
      </div>

      <section className="review-section reveal-3">
        <h2>Similarity Checker Review</h2>
        <div className="review-table">
          <div>Feature</div>
          <div>Academic Suite</div>
          <div>Generic Similarity Tool</div>
          <div>Originality score</div>
          <div>Yes</div>
          <div>Varies</div>
          <div>Local repetition signals</div>
          <div>Yes</div>
          <div>Varies</div>
          <div>PDF/DOCX extraction</div>
          <div>Yes</div>
          <div>Varies</div>
          <div>Definitive verdict claims</div>
          <div>No</div>
          <div>Often unclear</div>
        </div>
      </section>

      <section className="faq-section reveal-4">
        <h2>Similarity Checker FAQ</h2>
        <details open>
          <summary>Is this a definitive originality verdict?</summary>
          <p>No. It is a similarity analysis designed to identify repetition and local similarity signals.</p>
        </details>
        <details>
          <summary>Does Demo Mode search the internet?</summary>
          <p>No. Demo Mode uses local similarity analysis and does not query external sources.</p>
        </details>
        <details>
          <summary>Can it analyze uploaded documents?</summary>
          <p>Yes. It supports text-based PDF and DOCX files up to 200KB.</p>
        </details>
      </section>

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
        .placeholder-panel {
          padding: 2rem;
        }
        .panel-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .panel-heading h2,
        .review-section h2,
        .faq-section h2 {
          font-size: 1.1rem;
        }
        .panel-heading span {
          color: var(--text-secondary);
          font-size: 0.82rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .similarity-textarea {
          width: 100%;
          min-height: 300px;
          resize: vertical;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--glass-border);
          border-radius: 14px;
          padding: 1rem;
          color: #fff;
          font: inherit;
          line-height: 1.7;
          outline: none;
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
        .scan-button:disabled {
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
        .match-list {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .match-item {
          border: 1px solid var(--glass-border);
          background: rgba(255,255,255,0.025);
          border-radius: 14px;
          padding: 1rem;
        }
        .match-item div {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.65rem;
        }
        .match-item span,
        .match-item p,
        .placeholder-panel p,
        .faq-section p {
          color: var(--text-secondary);
        }
        .empty-state {
          color: var(--text-secondary);
          padding: 2rem 0;
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
        .review-section,
        .faq-section {
          border-top: 1px solid var(--glass-border);
          padding-top: 2rem;
        }
        .review-table {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          margin-top: 1rem;
          border: 1px solid var(--glass-border);
          border-radius: 16px;
          overflow: hidden;
        }
        .review-table div {
          padding: 0.9rem 1rem;
          border-bottom: 1px solid var(--glass-border);
          background: rgba(255,255,255,0.025);
        }
        .review-table div:nth-child(-n+3) {
          background: rgba(0, 255, 163, 0.08);
          color: var(--accent-primary);
          font-weight: 700;
        }
        .faq-section {
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
        }
        .faq-section details {
          border: 1px solid var(--glass-border);
          border-radius: 14px;
          padding: 1rem;
          background: rgba(255,255,255,0.025);
        }
        .faq-section summary {
          cursor: pointer;
          font-weight: 700;
        }
        .faq-section p {
          margin-top: 0.65rem;
        }
        @media (max-width: 980px) {
          .checker-grid,
          .result-cards,
          .review-table {
            grid-template-columns: 1fr;
          }
          .hero-title {
            font-size: 3.5rem;
          }
        }
      `}</style>
    </div>
  );
}
