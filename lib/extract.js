/**
 * /lib/extract.js
 * Extract plain text from PDF or DOCX buffers.
 */

import { PDFParse } from 'pdf-parse';
import mammoth      from 'mammoth';

/**
 * @param {Buffer} buffer
 * @param {'pdf'|'docx'} type
 * @returns {Promise<string>}
 */
export async function extractText(buffer, type) {
  if (type === 'pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const data = await parser.getText();
      return data.text || '';
    } finally {
      await parser.destroy?.();
    }
  }

  if (type === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return String(result?.value || '');
    } catch {
      throw new Error('DOCX extraction failed');
    }
  }

  throw new Error(`Unsupported file type: ${type}`);
}

/**
 * Detect file type from MIME or extension.
 * @param {string} filename
 * @param {string} [mime]
 * @returns {'pdf'|'docx'}
 */
export function detectType(filename, mime = '') {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (
    ext === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'docx';
  return null;
}
