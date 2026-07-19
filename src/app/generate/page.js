'use client';
import { useState, useRef } from 'react';

// Build-safe lazy imports for client-only libraries
let jsPDFLib, html2canvasLib, docxLib;
if (typeof window !== 'undefined') {
  import('jspdf').then(m => (jsPDFLib = m.jsPDF));
  import('html2canvas').then(m => (html2canvasLib = m.default));
  import('docx').then(m => (docxLib = m));
}

export default function GeneratePage() {
  const [content, setContent] = useState('');
  const [format, setFormat] = useState('ieee');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [isFallback, setIsFallback] = useState(false);
  const paperRef = useRef(null);

  // Exponential backoff retry for soft-busy protocol
  const fetchWithRetry = async (url, options, attempts = 0) => {
    const MAX_ATTEMPTS = 5;
    try {
      const res = await fetch(url, options);
      const data = await res.json();
      if (data.status === 'busy' && attempts < MAX_ATTEMPTS) {
        const delay = 1000 * Math.pow(2, attempts) + Math.random() * 400;
        setStatus(`System busy - retrying in ${Math.round(delay / 1000)}s... (${attempts + 1}/${MAX_ATTEMPTS})`);
        await new Promise(r => setTimeout(r, delay));
        return fetchWithRetry(url, options, attempts + 1);
      }
      return data;
    } catch (err) {
      if (attempts < MAX_ATTEMPTS) return fetchWithRetry(url, options, attempts + 1);
      throw err;
    }
  };

  const handleFormat = async () => {
    if (!content.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setStatus('Analyzing research content...');

    try {
      const data = await fetchWithRetry('/api/generate-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, format })
      });

      if (data.status === 'success') {
        setResult(data.result);
        setIsFallback(data.fallback);
        setStatus(data.fallback ? 'Fallback structure applied and saved to history.' : data.paper ? 'Formatted successfully and saved to history.' : 'Formatted successfully.');
      } else {
        setStatus(data.message || 'An error occurred. Please retry.');
      }
    } catch (err) {
      setStatus('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!paperRef.current || !jsPDFLib || !html2canvasLib) return;
    setStatus('Generating PDF...');
    const canvas = await html2canvasLib(paperRef.current, { scale: 2 });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDFLib('p', 'mm', 'a4');
    pdf.addImage(img, 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
    pdf.save('formatted_paper.pdf');
    setStatus('PDF exported.');
  };

  const downloadDOCX = async () => {
    if (!result || !docxLib) return;
    setStatus('Generating DOCX...');
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docxLib;

    const paragraphs = result.split('\n').map(line => {
      const isHeading = /^(TITLE|ABSTRACT|KEYWORDS|INTRODUCTION|METHODOLOGY|RESULTS|DISCUSSION|CONCLUSION|REFERENCES)/i.test(line);
      return new Paragraph({
        children: [new TextRun({ text: line, size: isHeading ? 24 : 20, bold: isHeading })],
        heading: isHeading ? HeadingLevel.HEADING_1 : undefined,
        spacing: { after: 200 },
        alignment: AlignmentType.JUSTIFIED
      });
    });

    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formatted_paper.docx';
    a.click();
    setStatus('DOCX exported.');
  };

  return (
    <div className="generate-container">
      <div className="glass-panel" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1 className="hero-title">
          Research <span className="gradient-text">Formatter</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Paste your research content below. We&apos;ll restructure it into a clean academic format while preserving every number, citation, and finding exactly as you wrote it.
        </p>

        {/* Textarea Input */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Paste your research content here..."
          rows={10}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--glass-border)', borderRadius: '14px',
            padding: '1.25rem', color: '#fff', fontSize: '0.95rem',
            lineHeight: '1.7', resize: 'vertical', marginBottom: '1rem',
            fontFamily: 'inherit', outline: 'none'
          }}
        />

        {/* Format Selector + Button Row */}
        <div className="format-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
          <select
            value={format}
            onChange={e => setFormat(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)',
              borderRadius: '12px', padding: '0.85rem 1.25rem', color: '#fff',
              fontSize: '0.9rem', cursor: 'pointer', outline: 'none',
              flex: '1 1 180px', minWidth: 0
            }}
          >
            <option value="ieee">IEEE Format</option>
            <option value="custom">Custom Format</option>
          </select>

          <button
            onClick={handleFormat}
            disabled={loading}
            className="btn-primary"
            style={{ flex: '2 1 240px', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Formatting...' : 'Format My Research'}
          </button>
        </div>

        {/* Status Line */}
        {status && (
          <div style={{ color: isFallback ? '#f59e0b' : 'var(--accent-primary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Status: {status}
            {isFallback && <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', opacity: 0.7 }}>(Fallback - AI was unavailable)</span>}
          </div>
        )}

        {/* Output */}
        {result && (
          <div className="fade-in">
            {/* Export buttons */}
            <div className="export-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <button
                onClick={downloadPDF}
                style={{
                  flex: '1 1 150px', padding: '0.85rem', borderRadius: '12px', cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--accent-primary)',
                  color: 'var(--accent-primary)', fontWeight: 600
                }}
              >
                Export PDF
              </button>
              <button
                onClick={downloadDOCX}
                style={{
                  flex: '1 1 150px', padding: '0.85rem', borderRadius: '12px', cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--accent-primary)',
                  color: 'var(--accent-primary)', fontWeight: 600
                }}
              >
                Export DOCX
              </button>
            </div>

            {/* Hidden IEEE render target for PDF capture */}
            <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
              <div
                ref={paperRef}
                className="ieee-document"
                style={{
                  width: '210mm', padding: '20mm', background: '#fff',
                  fontFamily: '"Times New Roman", serif', fontSize: '10pt',
                  color: '#000', lineHeight: '1.2'
                }}
              >
                {result.split('\n').map((line, i) => {
                  const isHead = /^(TITLE|ABSTRACT|KEYWORDS|INTRODUCTION|METHODOLOGY|RESULTS|DISCUSSION|CONCLUSION|REFERENCES)/i.test(line);
                  return isHead
                    ? <h2 key={i} style={{ fontWeight: 'bold', textTransform: 'uppercase', marginTop: '1.5em' }}>{line}</h2>
                    : <p key={i} style={{ textAlign: 'justify', marginBottom: '0.5em' }}>{line}</p>;
                })}
              </div>
            </div>

            {/* Preview */}
            <div style={{
              background: '#fff', color: '#000', padding: 'clamp(1rem, 4vw, 2.5rem)',
              borderRadius: '10px', maxHeight: '450px', overflowY: 'auto',
              fontFamily: '"Times New Roman", serif', textAlign: 'justify'
            }}>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '10pt', lineHeight: '1.6' }}>{result}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
