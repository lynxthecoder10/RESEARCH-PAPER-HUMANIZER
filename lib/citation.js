/**
 * /lib/citation.js  (v2)
 * IEEE citation formatting + consistency engine.
 *
 * New in v2:
 *   - reconcileCitations()   : validate all [N] markers in text
 *   - checkCitationGrounding(): ≥40% sentences must be cited
 *   - extractInlineCitations(): regex-based extraction
 */

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatAuthor(name) {
  if (!name) return '';
  name = name.trim();
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim());
    const initials = first.split(/\s+/).map(n => `${n[0]}.`).join(' ');
    return `${initials} ${last}`;
  }
  const parts = name.split(/\s+/);
  if (parts.length === 1) return name;
  const last     = parts[parts.length - 1];
  const initials = parts.slice(0, -1).map(n => `${n[0]}.`).join(' ');
  return `${initials} ${last}`;
}

function formatAuthors(authorsStr) {
  if (!authorsStr) return 'Unknown Author';
  const authors = authorsStr
    .split(/;\s*|\s+and\s+|,\s+(?=[A-Z])/)
    .map(a => a.trim())
    .filter(Boolean)
    .map(formatAuthor);
  if (authors.length === 0) return 'Unknown Author';
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
  return authors.slice(0, -1).join(', ') + ', and ' + authors[authors.length - 1];
}

export function formatReference(ref, index) {
  const num     = `[${index + 1}]`;
  const authors = formatAuthors(ref.authors);
  const title   = ref.title ? `"${ref.title},"` : '"Untitled,"';
  const journal = ref.journal ? ` ${ref.journal},` : '';
  const year    = ref.year   ? ` ${ref.year}.` : '.';
  const doi     = ref.doi    ? ` doi: ${ref.doi}.` : '';
  const link    = (!ref.doi && ref.link) ? ` [Online]. Available: ${ref.link}.` : '';
  return `${num} ${authors}, ${title}${journal}${year}${doi}${link}`
    .replace(/\s{2,}/g, ' ').trim();
}

export function buildCitationSystem(refs) {
  const formatted = refs.map((ref, i) => formatReference(ref, i));
  const inlineMap = new Map(refs.map((_, i) => [i, `[${i + 1}]`]));
  return { formatted, inlineMap };
}

export function injectInlineCitations(text, inlineMap) {
  return text.replace(/\{cite:(\d+)\}/g, (_, idx) => inlineMap.get(Number(idx)) || '[?]');
}

export function buildReferencesSection(formatted) {
  return formatted.join('\n\n');
}

// ── v2: Citation Consistency Engine ──────────────────────────────────────────

/**
 * Extract all unique [N] citation indices used in text (1-based).
 * Returns a sorted array of numbers.
 */
export function extractInlineCitations(text) {
  const matches = text.matchAll(/\[(\d+)\]/g);
  const indices = new Set();
  for (const m of matches) indices.add(Number(m[1]));
  return [...indices].sort((a, b) => a - b);
}

/**
 * Reconcile inline citations against the reference list.
 *
 * @param {string} text      - generated section text
 * @param {number} refCount  - total number of references
 * @returns {{
 *   valid:     boolean,   // all citations are in range
 *   dangling:  number[],  // citation indices with no matching ref (out of range)
 *   used:      number[],  // valid citation indices used
 * }}
 */
export function reconcileCitations(text, refCount) {
  const cited   = extractInlineCitations(text);
  const dangling = cited.filter(n => n < 1 || n > refCount);
  const used     = cited.filter(n => n >= 1 && n <= refCount);
  return {
    valid:    dangling.length === 0,
    dangling,
    used,
  };
}

/**
 * Find references not cited anywhere across all sections.
 *
 * @param {object} sections  - { key: text }
 * @param {number} refCount
 * @returns {number[]}  1-based indices of unused references
 */
export function findUnusedReferences(sections, refCount) {
  const usedSet = new Set();
  for (const text of Object.values(sections)) {
    if (!text) continue;
    extractInlineCitations(text).forEach(n => usedSet.add(n));
  }
  const unused = [];
  for (let i = 1; i <= refCount; i++) {
    if (!usedSet.has(i)) unused.push(i);
  }
  return unused;
}

// ── Fix 2: Section-aware grounding threshold ─────────────────────────────────

/**
 * Return the minimum citation ratio threshold for a given section.
 * Introduction and conclusion are narrative — lower threshold.
 * Methodology and results are evidence-heavy — higher threshold.
 */
export function getGroundingThreshold(sectionName = '') {
  if (/introduction|conclusion/i.test(sectionName)) return 0.25;
  if (/method|result/i.test(sectionName))            return 0.50;
  return 0.40;
}

/**
 * Check claim–citation binding.
 * Threshold is section-aware when sectionName is provided.
 *
 * @param {string} text
 * @param {string} [sectionName] - optional section key for threshold selection
 * @returns {{ ratio: number, passes: boolean, threshold: number, totalSentences: number, citedSentences: number }}
 */
export function checkCitationGrounding(text, sectionName = '') {
  const threshold = getGroundingThreshold(sectionName);

  // Split into sentences (simple heuristic)
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20); // skip very short fragments

  if (sentences.length === 0) return { ratio: 0, passes: true, threshold, totalSentences: 0, citedSentences: 0 };

  const citedSentences = sentences.filter(s => /\[\d+\]/.test(s)).length;
  const ratio          = citedSentences / sentences.length;

  return {
    ratio:           Math.round(ratio * 100) / 100,
    passes:          ratio >= threshold,
    threshold,
    totalSentences:  sentences.length,
    citedSentences,
  };
}
