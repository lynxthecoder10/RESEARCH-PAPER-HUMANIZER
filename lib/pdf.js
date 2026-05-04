import puppeteer from 'puppeteer-core';
import chromium  from '@sparticuz/chromium';

const ACADEMIC_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Lora', Georgia, serif; font-size: 11pt; line-height: 1.7; color: #1a1a1a; margin: 0; padding: 0; }
  .page { max-width: 750px; margin: 0 auto; padding: 60px 70px; }
  h1 { font-family: 'Inter', sans-serif; font-size: 18pt; font-weight: 600; text-align: center; margin-bottom: 6px; color: #111; line-height: 1.3; }
  h2 { font-family: 'Inter', sans-serif; font-size: 12pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 28px; margin-bottom: 8px; color: #222; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  p { text-align: justify; margin-bottom: 10px; hyphens: auto; }
  .meta { font-family: 'Inter', sans-serif; font-size: 9pt; color: #555; text-align: center; margin-bottom: 24px; }
  .references p { text-indent: -1.5em; padding-left: 1.5em; text-align: left; margin-bottom: 6px; font-size: 10pt; }
  @page { size: A4; margin: 0; }
`;

export function buildHTML(doc) {
  const e = escapeHTML;
  const sectionsHTML = doc.sections.map(s => {
    const headingTag = s.heading ? `<h2>${e(s.heading)}</h2>` : '';
    const bodyHTML   = s.body.split(/\n+/).filter(p => p.trim()).map(p => `<p>${e(p.trim())}</p>`).join('\n');
    return `<section>${headingTag}${bodyHTML}</section>`;
  }).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>${ACADEMIC_CSS}</style></head><body><div class="page">${doc.title ? `<h1>${e(doc.title)}</h1>` : ''}${doc.meta ? `<p class="meta">${e(doc.meta)}</p>` : ''}${sectionsHTML}</div></body></html>`;
}

function escapeHTML(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function renderPDF(html) {
  const isProd = process.env.NODE_ENV === 'production' || process.env.NETLIFY;
  const browser = await puppeteer.launch({
    args: isProd ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: chromium.defaultViewport,
    executablePath: isProd ? await chromium.executablePath() : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: isProd ? chromium.headless : true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({ format: 'A4', printBackground: true });
  } finally {
    await browser.close();
  }
}

const IEEE_CSS = `
  body { font-family: 'Times New Roman', serif; font-size: 10pt; line-height: 1.4; color: #000; }
  .ieee-page { width: 210mm; padding: 20mm; }
  .ieee-title { font-size: 24pt; text-align: center; margin-bottom: 10pt; font-weight: bold; }
  .ieee-body { column-count: 2; column-gap: 20px; text-align: justify; }
  .ieee-section-heading { font-weight: bold; text-transform: uppercase; text-align: center; margin: 10pt 0 5pt 0; }
  @page { size: A4; margin: 0; }
`;

export function buildIEEEHTML(doc) {
  const e = escapeHTML;
  const SECTION_ORDER = [
    ['introduction', 'I. Introduction'],
    ['literature_review', 'II. Literature Review'],
    ['methodology', 'III. Methodology'],
    ['results', 'IV. Results'],
    ['discussion', 'V. Discussion'],
    ['conclusion', 'VI. Conclusion'],
  ];

  const sectionsHTML = SECTION_ORDER
    .filter(([key]) => doc.sections[key])
    .map(([key, label]) => `<div><div class="ieee-section-heading">${e(label)}</div>${doc.sections[key].split(/\n+/).map(p => `<p>${e(p.trim())}</p>`).join('')}</div>`)
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>${IEEE_CSS}</style></head><body><div class="ieee-page"><div class="ieee-title">${e(doc.title)}</div><div class="ieee-body"><div><b>Abstract—</b>${e(doc.sections.abstract)}</div>${sectionsHTML}</div></div></body></html>`;
}

export async function renderIEEEPDF(html) {
  return renderPDF(html); // Shared core logic
}
