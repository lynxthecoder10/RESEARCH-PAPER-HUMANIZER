/**
 * /lib/validation.js
 * Input validation for the generate-paper pipeline.
 */

const REQUIRED_FIELDS = ['title', 'coreIdea'];

/**
 * Validate and normalize paper generation input.
 * @returns {{ ok: true, data: object } | { ok: false, error: string, detail: string }}
 */
export function validatePaperInput(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'INVALID_INPUT', detail: 'Request body must be a JSON object.' };
  }

  const { title, abstractIdea, coreIdea, references = [], exploratory = false } = body;

  // Title required
  if (!title || typeof title !== 'string' || title.trim().length < 5) {
    return { ok: false, error: 'INSUFFICIENT_INPUT', detail: '"title" is required (min 5 chars).' };
  }

  // Need at least one of coreIdea or abstractIdea
  const idea = (coreIdea || abstractIdea || '').trim();
  if (idea.length < 20) {
    return {
      ok: false,
      error: 'INSUFFICIENT_INPUT',
      detail: '"coreIdea" or "abstractIdea" is required (min 20 chars).',
    };
  }

  // References: at least 1 unless exploratory mode
  if (!exploratory && (!Array.isArray(references) || references.length === 0)) {
    return {
      ok: false,
      error: 'INSUFFICIENT_INPUT',
      detail: 'At least one reference is required. Set exploratory:true to bypass.',
    };
  }

  // Validate individual references
  const validatedRefs = [];
  const warnings      = [];

  for (let i = 0; i < references.length; i++) {
    const ref = references[i];
    if (!ref.title && !ref.doi) {
      warnings.push(`Reference [${i + 1}] skipped: must have at least "title" or "doi".`);
      continue;
    }
    validatedRefs.push({
      title:   ref.title   || '',
      authors: ref.authors || '',
      year:    ref.year    || '',
      doi:     ref.doi     || '',
      link:    ref.link    || '',
      journal: ref.journal || '',
      verified: false, // will be updated by research.js
    });
  }

  return {
    ok: true,
    data: {
      title:        title.trim(),
      authors:      (body.authors     || '').trim(),
      abstractIdea: (abstractIdea     || idea).trim(),
      coreIdea:     idea,
      keywords:     Array.isArray(body.keywords) ? body.keywords.filter(k => typeof k === 'string') : [],
      references:   validatedRefs,
      optionalNotes:(body.optionalNotes || '').trim(),
      exploratory,
    },
    warnings,
  };
}

/**
 * Basic vagueness check — reject if idea has no meaningful content.
 */
export function isVague(text) {
  const words = text.trim().split(/\s+/).filter(w => w.length > 3);
  return words.length < 5;
}
