/**
 * /lib/plagiarism.js  (v2)
 * Plagiarism risk detection:
 *   TEXT  — Jaccard + shingling (5-gram) similarity
 *   IMAGE — SHA-256 hash deduplication
 *
 * New in v2:
 *   - shingleSimilarity()  : 5-gram based similarity (more accurate for paraphrase detection)
 *   - combinedSimilarity() : weighted average of Jaccard + shingling
 */

import { createHash } from 'crypto';

// ── Thresholds ────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  refs:     { warn: 0.22, high: 0.40 },   // vs reference abstracts
  internal: { warn: 0.30, high: 0.50 },   // vs previous sections
};

// ── Stopwords ─────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','are','was','were','be','been','being','have','has','had','do','does',
  'did','will','would','can','could','should','may','might','this','that',
  'these','those','it','its','by','from','as','which','who','whom','their',
  'they','we','our','you','your','he','she','his','her','also','such',
]);

// ── Fix 3: Shingled Plagiarism Filtering ──────────────────────────────────────

const STOP_PHRASES = [
  "in this paper",
  "the results show",
  "this study",
  "it is observed that",
  "proposed method",
  "experimental results",
  "future work",
  "state of the art",
];

/**
 * Filter out shingles that contain generic academic stop-phrases.
 */
function filterShingles(shingleSet) {
  return new Set([...shingleSet].filter(s =>
    !STOP_PHRASES.some(p => s.includes(p))
  ));
}

// ── Tokenisation ──────────────────────────────────────────────────────────────

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w));
}

function tokenizeSet(text) {
  return new Set(tokenize(text));
}

// ── Jaccard similarity ────────────────────────────────────────────────────────

export function jaccardSimilarity(textA, textB) {
  const setA = tokenizeSet(textA);
  const setB = tokenizeSet(textB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) { if (setB.has(w)) intersection++; }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

// ── Shingling (n-gram) similarity ────────────────────────────────────────────

/**
 * Build a Set of k-grams (shingles) from a token array.
 */
function buildShingles(tokens, k = 5) {
  const shingles = new Set();
  for (let i = 0; i <= tokens.length - k; i++) {
    shingles.add(tokens.slice(i, i + k).join(' '));
  }
  return shingles;
}

/**
 * Jaccard similarity over k-gram shingles.
 */
export function shingleSimilarity(textA, textB, k = 5) {
  const tokensA   = tokenize(textA);
  const tokensB   = tokenize(textB);
  let shinglesA = buildShingles(tokensA, k);
  let shinglesB = buildShingles(tokensB, k);

  // Apply Fix 3 filtering
  shinglesA = filterShingles(shinglesA);
  shinglesB = filterShingles(shinglesB);

  if (shinglesA.size === 0 || shinglesB.size === 0) return 0;

  let intersection = 0;
  for (const s of shinglesA) { if (shinglesB.has(s)) intersection++; }
  const union = shinglesA.size + shinglesB.size - intersection;
  return intersection / union;
}

/**
 * Combined similarity: 40% Jaccard + 60% shingling (shingling is more
 * sensitive to phrase-level copying).
 */
export function combinedSimilarity(textA, textB) {
  const jac     = jaccardSimilarity(textA, textB);
  const shingle = shingleSimilarity(textA, textB, 5);
  return 0.4 * jac + 0.6 * shingle;
}

// ── Risk classification ───────────────────────────────────────────────────────

function riskLevel(score, thresholds) {
  if (score >= thresholds.high) return 'high';
  if (score >= thresholds.warn) return 'medium';
  return 'low';
}

function maxRiskRank(a, b) {
  const rank = { low: 0, medium: 1, high: 2 };
  return rank[a] >= rank[b] ? a : b;
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Check a generated section against reference abstracts and previous sections.
 *
 * @param {string} generated
 * @param {Array}  refs       - enriched refs with optional .abstract
 * @param {object} previous   - previously generated sections { key: text }
 * @returns {{ score: number, risk: string, flags: string[] }}
 */
export function checkTextPlagiarism(generated, refs = [], previous = {}) {
  const flags  = [];
  let maxScore = 0;
  let maxRisk  = 'low';

  // vs reference abstracts (shingling-weighted)
  for (const ref of refs) {
    if (!ref.abstract) continue;
    const score = combinedSimilarity(generated, ref.abstract);
    if (score > maxScore) maxScore = score;
    const risk = riskLevel(score, THRESHOLDS.refs);
    maxRisk = maxRiskRank(maxRisk, risk);
    if (risk !== 'low') {
      flags.push(
        `[${risk.toUpperCase()}] ${Math.round(score * 100)}% similarity (shingled) with ref: "${ref.title?.substring(0, 55)}"`
      );
    }
  }

  // vs previous sections (internal repetition)
  for (const [key, text] of Object.entries(previous)) {
    if (!text) continue;
    const score = combinedSimilarity(generated, text);
    if (score > maxScore) maxScore = score;
    const risk = riskLevel(score, THRESHOLDS.internal);
    maxRisk = maxRiskRank(maxRisk, risk);
    if (risk !== 'low') {
      flags.push(
        `[${risk.toUpperCase()}] ${Math.round(score * 100)}% repetition with section: ${key}`
      );
    }
  }

  return { score: Math.round(maxScore * 100) / 100, risk: maxRisk, flags };
}

/**
 * Audit all sections.
 */
export function auditSections(sections, refs) {
  const perSection = {};
  const allFlags   = [];
  const riskRank   = { low: 0, medium: 1, high: 2 };
  let   overall    = 'low';
  const previous   = {};

  for (const [key, text] of Object.entries(sections)) {
    if (!text) continue;
    const result = checkTextPlagiarism(text, refs, previous);
    perSection[key] = result;
    allFlags.push(...result.flags.map(f => `[${key}] ${f}`));
    if (riskRank[result.risk] > riskRank[overall]) overall = result.risk;
    previous[key] = text;
  }

  return { overall, perSection, allFlags };
}

// ── Image deduplication ───────────────────────────────────────────────────────

const _imageHashStore = new Set();

export function hashImage(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function checkImageDuplicate(buffer) {
  const hash = hashImage(buffer);
  const isDuplicate = _imageHashStore.has(hash);
  if (!isDuplicate) _imageHashStore.add(hash);
  return { isDuplicate, hash };
}

export function imageRiskLevel(checks) {
  const dupCount = checks.filter(c => c.isDuplicate).length;
  if (dupCount === 0) return 'low';
  if (dupCount <= 2)  return 'medium';
  return 'high';
}
