'use client';
import { useState, useRef } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export default function GeneratePage() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [paper, setPaper] = useState(null);
  const paperRef = useRef(null);

  // SOFT-BUSY PROTOCOL: Exponential Backoff Retry
  const fetchWithRetry = async (url, options, attempts = 0) => {
    const MAX_ATTEMPTS = 5;
    const baseDelay = 1000; // 1s
    const jitter = Math.random() * 500;
    
    try {
      const response = await fetch(url, options);
      const data = await response.json();
      
      if (data.status === 'busy' && attempts < MAX_ATTEMPTS) {
        const delay = (baseDelay * Math.pow(2, attempts)) + jitter;
        setStatus(`System busy. Retrying in ${Math.round(delay/1000)}s... (Attempt ${attempts + 1}/${MAX_ATTEMPTS})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, options, attempts + 1);
      }
      return data;
    } catch (error) {
      if (attempts < MAX_ATTEMPTS) {
        return fetchWithRetry(url, options, attempts + 1);
      }
      throw error;
    }
  };

  const generatePaper = async () => {
    if (!topic) return;
    setLoading(true);
    setPaper(null);
    setStatus('Initiating Research Pipeline...');
    
    try {
      const data = await fetchWithRetry('/api/generate-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic })
      });
      
      if (data.status === 'success') {
        setPaper(data.paper);
        setStatus('Ready for Export');
      } else {
        setStatus('Max Retries Exhausted. Fallback triggered.');
        setPaper(data.paper || "FALLBACK: System peak reached. Please manually generate a summary.");
      }
    } catch (err) {
      setStatus('Network Error. Using local fallback.');
    } finally {
      setLoading(false);
    }
  };

  const downloadDOCX = () => {
    // High-Fidelity Fallback: Manual XML DOCX generation
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>IEEE Paper</title><style>
      body { font-family: "Times New Roman", serif; font-size: 10pt; text-align: justify; }
      h1 { font-size: 24pt; text-align: center; }
      .abstract { font-weight: bold; }
      .columns { display: table; width: 100%; }
      .column { display: table-cell; width: 50%; padding: 0.5cm; }
    </style></head><body>`;
    const footer = "</body></html>";
    const content = `<h1>${topic.toUpperCase()}</h1><div class='columns'><div class='column'>${paper.replace(/\n/g, '<br>')}</div></div>`;
    
    const source = header + content + footer;
    const blob = new Blob(['\ufeff', source], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${topic.replace(/\s+/g, '_')}_IEEE.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="main-viewport">
      <div className="background-mesh"></div>
      
      <div className="glass-panel" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1 className="hero-title">Research <span className="gradient-text">Lab</span></h1>
        
        <div className="input-group" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <input 
            type="text" 
            placeholder="Paper Topic..." 
            className="glass-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            style={{ 
              flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
              padding: '1.25rem', borderRadius: '14px', color: '#fff'
            }}
          />
          <button onClick={generatePaper} disabled={loading} className="btn-primary">
            {loading ? 'Processing...' : 'Generate Paper'}
          </button>
        </div>

        {status && <div style={{ color: 'var(--accent-primary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>● {status}</div>}

        {paper && (
          <div className="fade-in">
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <button onClick={downloadDOCX} className="btn-secondary" style={{ flex: 1, border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)' }}>
                📥 Export High-Fidelity DOCX
              </button>
            </div>
            
            <div className="preview-container" style={{ 
              background: '#fff', color: '#000', padding: '3rem', borderRadius: '12px',
              height: '400px', overflowY: 'scroll', fontFamily: '"Times New Roman", serif', textAlign: 'justify'
            }}>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{paper}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
