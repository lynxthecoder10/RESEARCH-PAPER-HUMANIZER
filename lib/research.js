/**
 * /lib/research.js  (v2)
 * Reference grounding + CrossRef enrichment with title similarity validation.
 *
 * New in v2:
 *   - titleSimilarity() : Jaccard-based title match check (threshold ≥ 0.7)
 *   - If CrossRef title doesn't match user's title → mark as unverified
 *   - Build keyword snippets for semantic grounding
 */

import { TTLCache } from './cache.js';

const doiCache = new TTLCache(30 * 60 * 1000);

const CROSSREF_BASE = 'https://api.crossref.org/works';
const UA_HEADERS    = {
  'User-Agent': 'AcademicHumanizerApp/1.0 (mailto:admin@example.com)',
  'Accept':     'application/json',
};

// ── Title similarity ──────────────────────────────────────────────────────────

function normalizeTitle(t) {
  return (t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/**
 * Jaccard similarity of two title strings (word-level).
 */
export function titleSimilarity(titleA, titleB) {
  const setA = new Set(normalizeTitle(titleA));
  const setB = new Set(normalizeTitle(titleB));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) { if (setB.has(w)) intersection++; }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

const TITLE_MATCH_THRESHOLD = 0.7;

// ── CrossRef DOI fetch ────────────────────────────────────────────────────────

function stripHTML(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

async function fetchDOIMetadata(doi) {
  if (!doi) return null;
  if (doiCache.has(doi)) return doiCache.get(doi);

  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res   = await fetch(`${CROSSREF_BASE}/${encodeURIComponent(doi)}`, {
      headers: UA_HEADERS,
      signal:  ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json();
    const msg  = data?.message;
    if (!msg) return null;

    const remote = {
      title:    msg.title?.[0] || '',
      authors:  (msg.author || [])
        .map(a => `${a.given || ''} ${a.family || ''}`.trim())
        .join('; '),
      year:     String(msg.published?.['date-parts']?.[0]?.[0] || ''),
      journal:  msg['container-title']?.[0] || '',
      abstract: msg.abstract ? stripHTML(msg.abstract) : '',
      doi,
    };

    doiCache.set(doi, remote);
    return remote;
  } catch (err) {
    console.warn('[research] DOI fetch failed:', doi, err.message);
    return null;
  }
}

// ── Enrich references ─────────────────────────────────────────────────────────

/**
 * Enrich a single reference.
 * Applies title-similarity validation before accepting CrossRef metadata.
 */
async function enrichOne(ref) {
  if (!ref.doi) {
    return { ...ref, verified: false, abstract: '', verificationNote: 'No DOI provided' };
  }

  const remote = await fetchDOIMetadata(ref.doi);
  if (!remote) {
    return { ...ref, verified: false, abstract: '', verificationNote: 'CrossRef lookup failed' };
  }

  // Title similarity check (only when user provided a title)
  if (ref.title) {
    const sim = titleSimilarity(ref.title, remote.title);
    if (sim < TITLE_MATCH_THRESHOLD) {
      // CrossRef returned a different paper → do NOT use its metadata
      return {
        ...ref,
        verified:          false,
        abstract:          '',
        verificationNote:  `Title mismatch (similarity: ${Math.round(sim * 100)}%). CrossRef: "${remote.title?.substring(0, 80)}"`,
      };
    }
  }

  return {
    title:            ref.title    || remote.title,
    authors:          ref.authors  || remote.authors,
    year:             ref.year     || remote.year,
    journal:          ref.journal  || remote.journal,
    doi:              ref.doi,
    link:             ref.link     || `https://doi.org/${ref.doi}`,
    abstract:         remote.abstract || '',
    verified:         true,
    verificationNote: `CrossRef match (similarity: ${Math.round(titleSimilarity(ref.title || remote.title, remote.title) * 100)}%)`,
  };
}

export async function enrichReferences(refs) {
  return Promise.all(refs.map(enrichOne));
}

// ── Knowledge snippets ────────────────────────────────────────────────────────

export function buildKnowledgeSnippet(ref, index) {
  const tag     = `[${index + 1}]`;
  const authors = ref.authors || 'Unknown';
  const year    = ref.year    || 'n.d.';
  const title   = ref.title   || 'Untitled';
  const journal = ref.journal ? ` Published in ${ref.journal}.` : '';
  const status  = ref.verified ? '' : ` (user-provided, unverified — ${ref.verificationNote || ''})`;
  const abst    = ref.abstract ? ` Abstract: ${ref.abstract.substring(0, 300)}...` : '';
  return `${tag} ${authors} (${year}). "${title}."${journal}${status}${abst}`;
}

export function buildReferenceBlock(refs) {
  return refs.map(buildKnowledgeSnippet).join('\n\n');
}
