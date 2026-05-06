import { combinedSimilarity, jaccardSimilarity, shingleSimilarity } from './plagiarism.js';

const PROVIDERS = new Set(['mock', 'copyleaks']);
const COMMON_PHRASES = [
  'in this paper',
  'the results show',
  'future work',
  'state of the art',
  'this study',
  'as shown in',
  'it is important to note',
  'in conclusion'
];

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

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function wordCount(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);
}

function matchWordCount(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function containsCommonPhrase(text) {
  const value = normalizeText(text).toLowerCase();
  return COMMON_PHRASES.some(phrase => value.includes(phrase));
}

function deweightCommonPhraseScore(score, text) {
  if (!containsCommonPhrase(text)) return score;
  return Math.round(score * 0.55);
}

function splitSegments(text) {
  const byParagraph = String(text || '')
    .split(/\n{2,}/)
    .map(segment => normalizeText(segment))
    .filter(segment => segment.length >= 50);

  if (byParagraph.length >= 2) return byParagraph.slice(0, 24);

  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map(segment => normalizeText(segment))
    .filter(segment => segment.length >= 50)
    .slice(0, 32);
}

function repeatedShingles(text, size = 5) {
  const tokens = tokenize(text);
  const counts = new Map();

  for (let i = 0; i <= tokens.length - size; i += 1) {
    const phrase = tokens.slice(i, i + size).join(' ');
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function buildMockMatches(text) {
  const segments = splitSegments(text);
  const matches = [];
  const pairScores = [];
  let highest = 0;

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const combined = combinedSimilarity(segments[i], segments[j]);
      const shingle = shingleSimilarity(segments[i], segments[j]);
      const jaccard = jaccardSimilarity(segments[i], segments[j]);
      let score = Math.round(Math.max(combined, shingle, jaccard) * 100);
      score = deweightCommonPhraseScore(score, segments[j]);

      highest = Math.max(highest, score);

      if (score >= 12 && matchWordCount(segments[j]) >= 5) {
        pairScores.push(score);
        matches.push({
          text: segments[j].slice(0, 260),
          similarity: score,
          source: `Internal segment ${i + 1}`
        });
      }
    }
  }

  for (const repeated of repeatedShingles(text)) {
    if (matchWordCount(repeated.phrase) < 5) continue;

    let score = Math.min(100, 45 + repeated.count * 9);
    score = deweightCommonPhraseScore(score, repeated.phrase);
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

  return { matches: uniqueMatches, highest, pairScores };
}

export async function runMockSimilarityScan(text) {
  await new Promise(resolve => setTimeout(resolve, 1000));

  const normalized = normalizeText(text);
  const words = wordCount(normalized);
  const { matches, highest, pairScores } = buildMockMatches(normalized);
  const repeated = repeatedShingles(normalized);
  const repeatedDensity = words
    ? Math.round((repeated.reduce((total, item) => total + item.count, 0) / Math.max(1, words)) * 100)
    : 0;
  const pairAverage = pairScores.length
    ? Math.round(pairScores.reduce((total, score) => total + score, 0) / pairScores.length)
    : 0;

  let similarity = Math.round(
    pairAverage * 0.45 +
    highest * 0.35 +
    repeatedDensity * 0.2
  );
  similarity = Math.max(0, Math.min(100, similarity));

  if (words < 150) {
    similarity = Math.round(similarity * 0.7);
  }

  similarity = Math.max(0, Math.min(100, similarity));

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
    wordCount: words,
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

  const error = new Error('Live Scan - Copyleaks requires deployment webhook completion before reports can be returned.');
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
