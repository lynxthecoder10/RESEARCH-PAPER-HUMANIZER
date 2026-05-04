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

  const generatePaper = async () => {
    if (!topic) return;
    setLoading(true);
    setPaper(null);
    setStatus('Researching Topic...');
    
    try {
      // Pass 1 & 2 combined in the optimized API
      const res = await fetch('/api/generate-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic })
      });
      
      setStatus('Finalizing IEEE Layout...');
      const data = await res.json();
      
      if (data.status === 'success') {
        setPaper(data.paper);
        setStatus('Ready for Export');
      } else {
        alert(data.message || 'System busy. Please try again.');
      }
    } catch (err) {
      alert('Generation failed. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!paperRef.current) return;
    setStatus('Building PDF...');
    
    const canvas = await html2canvas(paperRef.current, {
      scale: 2, // Higher resolution
      useCORS: true
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${topic.replace(/\s+/g, '_')}_IEEE_Paper.pdf`);
    setStatus('Export Complete');
  };

  return (
    <div className="main-viewport">
      <div className="background-mesh"></div>
      
      <div className="glass-panel" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1 className="hero-title">Research <span className="gradient-text">Lab</span></h1>
        <p className="text-secondary" style={{ marginBottom: '2rem' }}>
          Generate high-fidelity, IEEE-standard research papers with automated humanization.
        </p>

        <div className="input-group" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <input 
            type="text" 
            placeholder="e.g., Quantum Computing in Modern Cryptography" 
            className="glass-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            style={{ 
              flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
              padding: '1.25rem', borderRadius: '14px', color: '#fff', fontSize: '1rem'
            }}
          />
          <button 
            onClick={generatePaper} 
            disabled={loading}
            className="btn-primary"
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Generating...' : 'Start Research'}
          </button>
        </div>

        {status && <div style={{ color: 'var(--accent-primary)', marginBottom: '1rem', fontWeight: 'bold' }}>● {status}</div>}

        {paper && (
          <div className="fade-in">
            <button 
              onClick={downloadPDF} 
              className="btn-secondary"
              style={{ 
                marginBottom: '1rem', background: 'var(--glass-bg)', border: '1px solid var(--accent-primary)',
                color: 'var(--accent-primary)', padding: '0.75rem 1.5rem', borderRadius: '10px', cursor: 'pointer'
              }}
            >
              📥 Download IEEE PDF
            </button>
            
            {/* HIDDEN IEEE PREVIEW FOR PDF GENERATION */}
            <div style={{ position: 'absolute', left: '-9999px' }}>
              <div ref={paperRef} className="ieee-document">
                <h1 className="ieee-title">{topic.toUpperCase()}</h1>
                <p className="ieee-authors">Academic Suite Research Intelligence</p>
                <div className="ieee-columns">
                  {paper.split('\n').map((line, i) => {
                    const isHeader = /^(ABSTRACT|INTRODUCTION|LITERATURE|METHODOLOGY|RESULTS|DISCUSSION|CONCLUSION|REFERENCES)/i.test(line);
                    return isHeader ? (
                      <span key={i} className="ieee-section-head">{line}</span>
                    ) : (
                      <p key={i} className="ieee-text">{line}</p>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* SCREEN PREVIEW */}
            <div className="preview-container" style={{ 
              background: '#fff', color: '#000', padding: '3rem', borderRadius: '12px',
              height: '500px', overflowY: 'scroll', fontFamily: '"Times New Roman", serif'
            }}>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{paper}</pre>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .ieee-document {
          width: 210mm;
          padding: 20mm;
          background: #fff;
          color: #000;
          font-family: "Times New Roman", Times, serif;
          font-size: 10pt;
          line-height: 1.2;
        }
        .ieee-title { font-size: 24pt; text-align: center; margin-bottom: 1em; font-weight: normal; }
        .ieee-authors { text-align: center; margin-bottom: 2em; font-size: 11pt; }
        .ieee-columns { column-count: 2; column-gap: 1cm; text-align: justify; }
        .fade-in { animation: fadeIn 0.8s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
