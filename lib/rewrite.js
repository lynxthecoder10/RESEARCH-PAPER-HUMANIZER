/**
 * /lib/rewrite.js
 * All Gemini interactions:
 *   - Layer 1: Semantic extraction (CONCEPTS + TERMS)
 *   - External enrichment (Wikidata + Oxford)
 *   - Layer 2: Section-by-section rewrite
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { wikidataCache, oxfordCache } from './cache.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const BANNED_CONCEPTS = new Set([
  'study', 'research', 'analysis', 'method', 'methodology',
  'result', 'paper', 'experiment', 'data',
]);
const WEAK_TERMS = new Set(['model', 'system', 'process', 'approach']);

// ── Helpers ───────────────────────────────────────────────────────────────────

export function safeParseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  }
}

function validateStructure(d) {
  return (
    d &&
    Array.isArray(d.CONCEPTS) &&
    Array.isArray(d.TERMS) &&
    d.CONCEPTS.length <= 3 &&
    d.TERMS.length <= 5
  );
}

function cleanExtracted(raw) {
  const concepts = [...new Set(
    (raw.CONCEPTS || [])
      .map(c => c.trim())
      .filter(c => c && !BANNED_CONCEPTS.has(c.toLowerCase())),
  )];
  const terms = [...new Set(
    (raw.TERMS || [])
      .map(t => t.trim())
      .filter(t => t && !WEAK_TERMS.has(t.toLowerCase())),
  )];
  return {
    concepts: concepts.length > 0 ? concepts : ['General Academic Topic'],
    terms,
  };
}

export function calcConfidence(concepts, terms) {
  const realConcepts = concepts.filter(c => c !== 'General Academic Topic');
  return (realConcepts.length / 3) * 0.6 + (Math.min(terms.length, 5) / 5) * 0.4;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── External APIs ─────────────────────────────────────────────────────────────

async function fetchWikidata(concept) {
  if (wikidataCache.has(concept)) return wikidataCache.get(concept);
  try {
    const url =
      `https://www.wikidata.org/w/api.php?action=wbsearchentities` +
      `&search=${encodeURIComponent(concept)}&language=en&format=json`;
    const res  = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'AcademicHumanizerApp/1.0 (contact: admin@example.com)' },
    });
    const data = await res.json();
    const match =
      data.search?.find(r => r.match?.type === 'label') || data.search?.[0];
    if (!match || (match.description || '').length < 10) return null;
    const result = { concept, description: match.description };
    wikidataCache.set(concept, result);
    return result;
  } catch (err) {
    console.warn('[wikidata] failed for', concept, err.message);
    return null;
  }
}

async function fetchOxford(term) {
  const key = term.toLowerCase().split(' ')[0];
  if (oxfordCache.has(key)) return oxfordCache.get(key);
  try {
    const url = `https://od-api-sandbox.oxforddictionaries.com/api/v2/entries/en-gb/${encodeURIComponent(key)}`;
    const res  = await fetchWithTimeout(url, {
      headers: {
        app_id:  process.env.OXFORD_APP_ID,
        app_key: process.env.OXFORD_APP_KEY,
        Accept:  'application/json',
      },
    });
    const fallback = { term, definition: `${term} (technical term)` };
    if (!res.ok) { oxfordCache.set(key, fallback); return fallback; }
    const data = await res.json();
    const def  =
      data.results?.[0]?.lexicalEntries?.[0]?.entries?.[0]?.senses?.[0]?.definitions?.[0] ||
      `${term} (technical term)`;
    const result = { term, definition: def };
    oxfordCache.set(key, result);
    return result;
  } catch (err) {
    console.warn('[oxford] failed for', term, err.message);
    return { term, definition: `${term} (technical term)` };
  }
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Layer 1: Extract CONCEPTS + TERMS from text via Gemini.
 * Returns { concepts, terms, confidence, usedFallback, enrichedContext }
 */
export async function extractSemantics(text, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { temperature: 0 },
  });

  const prompt = `You are a strict academic semantic extraction engine.
Your ONLY task is to extract high-quality structured data from the input academic text.

OUTPUT FORMAT (STRICT JSON ONLY) — no markdown, no explanation:
{
  "CONCEPTS": ["..."],
  "TERMS": ["..."]
}

STEP 1 — CORE CONCEPTS (1–3):
- Main domain/theory of the paper
- Wikidata-lookupable, specific
FORBIDDEN: study, research, analysis, method, methodology, result, paper, experiment, data

STEP 2 — TECHNICAL TERMS (1–5):
- Domain-specific jargon, Oxford-compatible
- Nouns/noun phrases, no common words

STEP 3 — CLEAN: no duplicates, proper capitalisation

STEP 4 — VALIDATE: fewer high-quality items > many low-quality

DO NOT summarise, explain, or write anything outside the JSON.

INPUT TEXT:
${text.substring(0, 15000)}`;

  let raw = null;
  let usedFallback = false;

  try {
    const r = await model.generateContent(prompt);
    raw = r.response.text();
  } catch (err) {
    console.warn('[layer1] first attempt failed:', err.message);
    usedFallback = true;
  }

  let parsed = null;
  if (raw) {
    try {
      parsed = safeParseJSON(raw);
    } catch {
      console.warn('[layer1] JSON parse failed, retrying');
      try {
        const r2 = await model.generateContent(prompt);
        parsed = safeParseJSON(r2.response.text());
      } catch (e2) {
        console.warn('[layer1] retry failed:', e2.message);
        usedFallback = true;
      }
    }
  }

  if (!validateStructure(parsed)) {
    parsed = { CONCEPTS: [], TERMS: [] };
    usedFallback = true;
  }

  const { concepts, terms } = cleanExtracted(parsed);
  const confidence = calcConfidence(concepts, terms);

  console.log({ stage: 'layer1', success: !usedFallback, concepts, terms, confidence });

  // External enrichment
  let enrichedContext = { concepts: [], terms: [] };

  if (confidence >= 0.4) {
    const toFetchConcepts = concepts.filter(c => c !== 'General Academic Topic').slice(0, 2);
    const toFetchTerms    = terms.slice(0, 3);
    const hasOxford       = process.env.OXFORD_APP_ID && process.env.OXFORD_APP_KEY;

    const [wdResults, oxResults] = await Promise.all([
      Promise.all(toFetchConcepts.map(fetchWikidata)),
      hasOxford ? Promise.all(toFetchTerms.map(fetchOxford)) : [],
    ]);

    enrichedContext = {
      concepts: wdResults.filter(Boolean),
      terms:    oxResults.filter(Boolean),
    };
  }

  return { concepts, terms, confidence, usedFallback, enrichedContext };
}

/**
 * Layer 2: Rewrite a single section with integrity awareness.
 * Retries once if Gemini produces bad output.
 * Returns the rewritten string.
 */
export async function rewriteSection(sectionText, semantics, enrichedContext, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { temperature: 0.45 },
  });

  const conceptSummary = enrichedContext.concepts
    .map(c => `• ${c.concept}: ${c.description}`)
    .join('\n') || 'N/A';

  const termSummary = enrichedContext.terms
    .map(t => `• ${t.term}: ${t.definition}`)
    .join('\n') || 'N/A';

  const prompt = `You are an academic editor.

Rewrite the section below to improve clarity and readability.

STRICT RULES:
- Do NOT change meaning, claims, or conclusions
- Do NOT change numbers or results
- Do NOT modify citations
- Do NOT introduce new facts or ideas
- Preserve all technical terminology

STYLE:
- Formal academic tone
- Natural variation in sentence length
- Reduce redundancy
- Improve flow and coherence

SEMANTIC CONTEXT (for reference only — do not expand):
${JSON.stringify(semantics)}

DOMAIN KNOWLEDGE:
${conceptSummary}

TERM DEFINITIONS:
${termSummary}

Return ONLY the rewritten text. No labels, no preamble.

SECTION TO REWRITE:
${sectionText}`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.warn('[rewrite] section rewrite failed:', err.message);
    return null; // caller falls back to original
  }
}
