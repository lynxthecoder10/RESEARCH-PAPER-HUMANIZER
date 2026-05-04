'use client';
import { useState, useRef, useEffect } from 'react';

// Production Rule: Lazy-load client-only libraries to ensure build safety
let jsPDF, html2canvas, docx;
if (typeof window !== "undefined") {
  import('jspdf').then(mod => jsPDF = mod.jsPDF);
  import('html2canvas').then(mod => html2canvas = mod.default);
  import('docx').then(mod => docx = mod);
}

export default function GeneratePage() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [paper, setPaper] = useState(null);
  const paperRef = useRef(null);

  const fetchWithRetry = async (url, options, attempts = 0) => {
    const MAX_ATTEMPTS = 5;
    try {
      const response = await fetch(url, options);
      const data = await response.json();
      if (data.status === 'busy' && attempts < MAX_ATTEMPTS) {
        const delay = (1000 * Math.pow(2, attempts)) + (Math.random() * 500);
        setStatus(`Queuing... Retrying in ${Math.round(delay/1000)}s`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, options, attempts + 1);
      }
      return data;
    } catch (error) {
      if (attempts < MAX_ATTEMPTS) return fetchWithRetry(url, options, attempts + 1);
      throw error;
    }
  };

  const generatePaper = async () => {
    if (!topic || loading) return;
    setLoading(true);
    setPaper(null);
    setStatus('Initializing AI Chain...');
    try {
      const data = await fetchWithRetry('/api/generate-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic })
      });
      if (data.status === 'success') {
        setPaper(data.paper);
        setStatus('Ready');
      } else {
        setStatus('Peak Load: System returned fallback.');
        setPaper(data.paper || "FALLBACK: Please retry in 60s.");
      }
    } catch (err) {
      setStatus('Network Error');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!paperRef.current || !jsPDF || !html2canvas) return;
    setStatus('Generating PDF...');
    const canvas = await html2canvas(paperRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(imgData, 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
    pdf.save(`${topic}_IEEE.pdf`);
    setStatus('PDF Exported');
  };

  const downloadDOCX = async () => {
    if (!paper || !docx) return;
    setStatus('Generating DOCX...');
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({ text: topic.toUpperCase(), heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: "Academic Suite Research Intelligence", alignment: AlignmentType.CENTER }),
          ...paper.split('\n').map(line => new Paragraph({
            children: [new TextRun({ text: line, size: 20 })],
            spacing: { after: 200 },
            alignment: AlignmentType.JUSTIFIED
          }))
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${topic}_IEEE.docx`;
    link.click();
    setStatus('DOCX Exported');
  };

  return (
    <div className="main-viewport">
      <div className="background-mesh"></div>
      <div className="glass-panel" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1 className="hero-title">Research <span className="gradient-text">Lab</span></h1>
        
        <div className="input-group" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <input 
            type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
            placeholder="Paper Topic..." className="glass-input"
            style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '1rem', borderRadius: '12px', color: '#fff' }}
          />
          <button onClick={generatePaper} disabled={loading} className="btn-primary">
            {loading ? 'Processing...' : 'Generate'}
          </button>
        </div>

        {status && <div style={{ color: 'var(--accent-primary)', marginBottom: '1rem' }}>● {status}</div>}

        {paper && (
          <div className="fade-in">
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <button onClick={downloadPDF} className="btn-secondary" style={{ flex: 1 }}>Export PDF</button>
              <button onClick={downloadDOCX} className="btn-secondary" style={{ flex: 1 }}>Export DOCX</button>
            </div>
            
            <div style={{ position: 'absolute', left: '-9999px' }}>
              <div ref={paperRef} className="ieee-document">
                <h1 className="ieee-title">{topic.toUpperCase()}</h1>
                <div className="ieee-columns">
                  {paper.split('\n').map((l, i) => <p key={i} className="ieee-text">{l}</p>)}
                </div>
              </div>
            </div>

            <div className="preview-container" style={{ background: '#fff', color: '#000', padding: '2rem', borderRadius: '8px', height: '400px', overflowY: 'auto', fontFamily: 'serif' }}>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{paper}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
