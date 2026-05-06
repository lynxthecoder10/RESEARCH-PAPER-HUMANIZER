'use client';
import { useEffect, useState } from 'react';

export default function HistoryPage() {
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/papers')
      .then(res => res.json())
      .then(data => {
        setPapers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className="history-container">
      <header className="reveal-1">
        <h1 className="hero-title">Research <span className="gradient-text">Archive</span></h1>
        <p className="hero-subtitle">Securely access and manage your collection of high-fidelity research generations.</p>
      </header>

      {loading ? (
        <div className="glass-panel reveal-2" style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="pulse-loader"></div>
          <p style={{ marginTop: '1.5rem', color: 'var(--text-secondary)' }}>Decrypting archives...</p>
        </div>
      ) : papers.length === 0 ? (
        <div className="glass-panel reveal-2" style={{ textAlign: 'center', padding: '4rem' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 700 }}>Archive</div>
          <h3>No records found</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Your generated research papers will appear here.</p>
        </div>
      ) : (
        <div className="history-list reveal-2">
          {papers.map((paper, index) => (
            <div 
              key={paper._id || index} 
              className={`glass-panel reveal-${Math.min(index + 2, 4)}`}
              style={{ 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                marginBottom: '1rem', padding: '1.25rem 2rem', transition: 'transform 0.3s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                <div style={{ 
                  width: '50px', height: '50px', borderRadius: '12px', 
                  background: 'rgba(0, 255, 163, 0.05)', border: '1px solid var(--glass-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem'
                }}>
                  Doc
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{paper.title || 'Untitled Research'}</h3>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--accent-primary)' }}>IEEE Standard</span>
                    <span>-</span>
                    <span>{new Date(paper.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ textAlign: 'right', marginRight: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '1px' }}>Integrity</div>
                  <div style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>VERIFIED</div>
                </div>
                {paper.pdfUrl && (
                  <a 
                    href={paper.pdfUrl} 
                    download 
                    className="btn-primary" 
                    style={{ 
                      padding: '0.6rem 1.5rem', fontSize: '0.85rem', 
                      background: 'rgba(255,255,255,0.05)', color: 'white', 
                      border: '1px solid var(--glass-border)', boxShadow: 'none' 
                    }}
                  >
                    Download
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .pulse-loader {
          width: 40px;
          height: 40px;
          margin: 0 auto;
          background: var(--accent-primary);
          border-radius: 50%;
          animation: pulse 1.5s ease-out infinite;
          box-shadow: 0 0 20px var(--accent-primary);
        }
        @keyframes pulse {
          0% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0.5; }
        }
        .history-list .glass-panel:hover {
          transform: translateX(10px);
          border-color: var(--accent-primary);
          background: rgba(255,255,255,0.05);
        }
        @media (max-width: 700px) {
          .history-list .glass-panel {
            flex-direction: column;
            align-items: flex-start !important;
            gap: 1rem;
            padding: 1.25rem !important;
          }
          .history-list .glass-panel > div {
            width: 100%;
            align-items: flex-start !important;
          }
          .history-list .glass-panel:hover {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
