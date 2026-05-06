import { combinedSimilarity, jaccardSimilarity, shingleSimilarity } from './plagiarism.js';

const PROVIDERS = new Set(['mock', 'copyleaks']);

export function getSimilarityProviderName() {
  const provider = (process.env.PLAGIARISM_PROVIDER || 'mock').toLowerCase();
  return PROVIDERS.has(provider) ? provider : 'mock';
}

export function riskFromSimilarity(similarity) {
  if (similarity <= 20) return 'low';
  if (similarity <= 50) return 'medium';
  return 'high';
}

function severityFromSimilarity(similarity) {
  return riskFromSimilarity(similarity);
}

function wordCount(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);
}

function splitSegments(text) {
  const byParagraph = String(text || '')
    .split(/\n{2,}/)
    .map(segment => normalizeText(segment))
    .filter(segment => segment.length >= 80);

  if (byParagraph.length >= 2) return byParagraph.slice(0, 24);

  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map(segment => normalizeText(segment))
    .filter(segment => segment.length >= 80)
    .slice(0, 32);
}

function repeatedShingles(text, size = 8) {
  const tokens = tokenize(text);
  const counts = new Map();

  for (let i = 0; i <= tokens.length - size; i += 1) {
    const phrase = tokens.slice(i, i + size).join(' ');
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase, count]) => ({ phrase, count }));
}

function buildMockMatches(text) {
  const segments = splitSegments(text);
  const matches = [];
  let highest = 0;

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const combined = combinedSimilarity(segments[i], segments[j]);
      const shingle = shingleSimilarity(segments[i], segments[j]);
      const jaccard = jaccardSimilarity(segments[i], segments[j]);
      const score = Math.round(Math.max(combined, shingle, jaccard) * 100);

      if (score > highest) highest = score;
      if (score >= 15) {
        matches.push({
          text: segments[j].slice(0, 260),
          similarity: score,
          source: `Internal segment ${i + 1}`
        });
      }
    }
  }

  for (const repeated of repeatedShingles(text)) {
    const score = Math.min(100, 55 + repeated.count * 10);
    highest = Math.max(highest, score);
    matches.push({
      text: repeated.phrase,
      similarity: score,
      source: 'Repeated phrase'
    });
  }

  const uniqueMatches = [];
  const seen = new Set();
  for (const match of matches.sort((a, b) => b.similarity - a.similarity)) {
    const key = `${match.source}:${match.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueMatches.push(match);
    if (uniqueMatches.length >= 8) break;
  }

  return { matches: uniqueMatches, highest };
}

export async function runMockSimilarityScan(text) {
  await new Promise(resolve => setTimeout(resolve, 1000));

  const normalized = normalizeText(text);
  const { matches, highest } = buildMockMatches(text);
  const repeated = repeatedShingles(text);
  const repeatedDensity = normalized
    ? Math.round((repeated.reduce((total, item) => total + item.count, 0) / Math.max(1, wordCount(normalized))) * 100)
    : 0;
  const similarity = Math.max(0, Math.min(100, Math.max(highest, repeatedDensity)));
  const risk = riskFromSimilarity(similarity);
  const flags = [];

  if (matches.some(match => match.source === 'Repeated phrase')) {
    flags.push({ type: 'repetition', severity: severityFromSimilarity(similarity) });
  }

  if (matches.some(match => match.source.startsWith('Internal segment'))) {
    flags.push({ type: 'n-gram similarity', severity: severityFromSimilarity(similarity) });
  }

  if (!flags.length) {
    flags.push({ type: 'local similarity baseline', severity: 'low' });
  }

  return {
    similarity,
    originality: 100 - similarity,
    risk,
    wordCount: wordCount(normalized),
    matches,
    flags,
    provider: 'mock'
  };
}

function missingCopyleaksConfig() {
  return [
    'COPYLEAKS_EMAIL',
    'COPYLEAKS_API_KEY',
    'COPYLEAKS_WEBHOOK_BASE_URL',
    'COPYLEAKS_WEBHOOK_SECRET'
  ].filter(key => !process.env[key]);
}

export async function runCopyleaksSimilarityScan() {
  const missing = missingCopyleaksConfig();
  if (missing.length) {
    const error = new Error(`Copyleaks configuration missing: ${missing.join(', ')}`);
    error.status = 503;
    throw error;
  }

  const error = new Error('Live Scan – Copyleaks requires deployment webhook completion before reports can be returned.');
  error.status = 501;
  throw error;
}

export async function runSimilarityScan(text) {
  const provider = getSimilarityProviderName();
  if (provider === 'copyleaks') {
    return runCopyleaksSimilarityScan(text);
  }

  return runMockSimilarityScan(text);
}
