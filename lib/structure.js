/**
 * /lib/structure.js  (v2)
 * IEEE section scaffold + stricter generation prompts + semantic stability.
 *
 * New in v2:
 *   - Stricter STRICT RULES block in all prompts
 *   - extractKeywords() for semantic stability check
 *   - checkSemanticStability() to validate keyword preservation
 */

export const IEEE_SECTIONS = [
  'abstract',
  'introduction',
  'literature_review',
  'methodology',
  'results',
  'discussion',
  'conclusion',
];

export const SECTION_LABELS = {
  abstract:          'Abstract',
  introduction:      'I. Introduction',
  literature_review: 'II. Literature Review',
  methodology:       'III. Methodology / Proposed Work',
  results:           'IV. Results / Expected Outcomes',
  discussion:        'V. Discussion',
  conclusion:        'VI. Conclusion',
};

// ── Common strict rules block ─────────────────────────────────────────────────

function strictRulesBlock(hasRefs) {
  return `
STRICT ACADEMIC INTEGRITY RULES (MANDATORY):
1. Use ONLY the user-provided idea and the references listed below
2. DO NOT invent any citation, statistic, or fact not present in user inputs
3. Every factual claim MUST be:
   a) Supported by one of the provided references (use [N] inline), OR
   b) Clearly general/foundational knowledge (no citation needed)
4. AVOID vague unsupported phrases: "many studies suggest", "researchers have found", "it is widely known"
5. DO NOT repeat content already written in other sections
6. Keep section length proportional to the user's idea — do not pad or expand unnecessarily
7. Preserve the user's core idea EXACTLY — do not alter the research contribution
8. Maintain formal IEEE academic tone throughout
9. Rephrase and synthesize — NEVER copy text verbatim from references
10. Output ONLY the section text — no headings, no labels, no markdown
${hasRefs
  ? `11. Inline citation format: [1], [2], [1], [3] — match reference indices exactly
12. At least 40% of factual sentences should have an inline citation`
  : `11. No references provided — do NOT cite any sources or invent [N] markers`}
`.trim();
}

// ── Section prompt builder ────────────────────────────────────────────────────

/**
 * Build a generation prompt for a single IEEE section.
 */
export function buildSectionPrompt(section, paper, refBlock, context = {}, retrying = false) {
  const hasRefs = paper.references.length > 0;
  const rules   = strictRulesBlock(hasRefs);

  const baseCtx = `
USER PAPER INPUTS:
Title: ${paper.title}
Core Idea: ${paper.coreIdea}
Keywords: ${paper.keywords.join(', ') || 'Not specified'}
${paper.optionalNotes ? `Additional Notes: ${paper.optionalNotes}` : ''}

PROVIDED REFERENCES:
${refBlock || 'No references provided. Generate without citations.'}
`.trim();

  const retryNote = retrying
    ? `\n\nIMPORTANT — THIS IS A RETRY:\n- Strongly rephrase compared to your previous attempt\n- Increase citation density\n- Be more specific and grounded\n- Avoid vague generalisations`
    : '';

  const sectionInstructions = {
    abstract: `You are an academic writer generating an IEEE-style Abstract.

${rules}

${baseCtx}

TASK: Write a single-paragraph Abstract (150–250 words).
Cover: (1) problem context, (2) proposed approach or contribution, (3) key outcomes or expected results.
Use clear, precise language. Avoid jargon not explained in the abstract itself.
Do NOT use first person ("we propose" is acceptable in IEEE; avoid "I").${retryNote}`,

    introduction: `You are an academic writer generating an IEEE-style Introduction.

${rules}

${baseCtx}
${context.abstract ? `\nAbstract (already written — do NOT repeat):\n${context.abstract}` : ''}

TASK: Write an Introduction (~350–500 words).
Structure: (1) background and motivation, (2) problem statement, (3) objectives and scope, (4) paper organisation.
Ground background claims in the provided references using [N] markers.${retryNote}`,

    literature_review: `You are an academic writer generating an IEEE-style Literature Review.

${rules}

${baseCtx}
${context.introduction ? `\nIntroduction (already written — avoid repetition):\n${context.introduction.substring(0, 400)}...` : ''}

TASK: Write a Literature Review (~450–650 words).
Synthesise the provided references into 2–3 thematic groups.
For each theme: summarise contributions, cite with [N], identify gaps.
Conclude by motivating the current work relative to identified gaps.
Every cited claim MUST use an inline [N] marker from the reference list.${retryNote}`,

    methodology: `You are an academic writer generating an IEEE-style Methodology section.

${rules}

${baseCtx}

TASK: Write a Methodology / Proposed Work section (~400–600 words).
Describe: (1) system design or approach, (2) algorithms or procedures, (3) how it addresses the stated problem.
Reference prior methods where applicable using [N].
DO NOT fabricate experimental results or performance numbers.${retryNote}`,

    results: `You are an academic writer generating an IEEE-style Results section.

${rules}

${baseCtx}

TASK: Write a Results / Expected Outcomes section (~300–450 words).
If this is a theoretical or proposed system, frame as "expected outcomes" or "anticipated results".
Do NOT fabricate specific numeric results.
If referencing figures or tables, say "as shown in Figure 1" (generic).
Compare expected outcomes to related work using [N] citations.${retryNote}`,

    discussion: `You are an academic writer generating an IEEE-style Discussion section.

${rules}

${baseCtx}
${context.results ? `\nResults section (do not repeat):\n${context.results.substring(0, 400)}...` : ''}

TASK: Write a Discussion section (~300–450 words).
Cover: (1) interpretation of results/outcomes, (2) comparison with cited prior work [N], (3) limitations, (4) implications.
Be critical and balanced.${retryNote}`,

    conclusion: `You are an academic writer generating an IEEE-style Conclusion.

${rules}

${baseCtx}

TASK: Write a Conclusion (~200–300 words).
Cover: (1) summary of contributions, (2) key findings, (3) future work directions.
DO NOT introduce new ideas.
Keep concise and definitive. Avoid vague closing statements.${retryNote}`,
  };

  return sectionInstructions[section] || `Generate the ${section} section.\n\n${rules}\n\n${baseCtx}`;
}

export function scaffoldSections() {
  return Object.fromEntries(IEEE_SECTIONS.map(s => [s, '']));
}

// ── Semantic stability ────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','can','could','should','may','might',
  'this','that','these','those','it','its','by','from','as','which',
  'study','research','paper','method','analysis','approach','using','used',
]);

/**
 * Extract top content keywords from a text (length ≥ 6, not stopwords).
 */
/**
 * Extract keywords from text.
 * Improved regex-based extraction to capture domain terms.
 */
export function extractKeywords(text) {
  return text
    .match(/\b[A-Za-z]{2,}\b/g)
    ?.filter(w => w.length > 3 || w === w.toUpperCase())
    ?.slice(0, 30) || [];
}

/**
 * Check that keywords from the input idea appear in the generated output.
 * Returns { passes: boolean, missing: string[], ratio: number }
 */
export function checkSemanticStability(inputIdea, generatedText) {
  const keywords = extractKeywords(inputIdea);
  if (keywords.length === 0) return { passes: true, missing: [], ratio: 1 };

  const outputLower = generatedText.toLowerCase();
  const missing     = keywords.filter(k => !outputLower.includes(k));
  const found       = keywords.length - missing.length;
  const ratio       = found / keywords.length;

  return {
    passes:   ratio >= 0.6, // majority of keywords must appear
    missing,
    ratio:    Math.round(ratio * 100) / 100,
    keywords,
  };
}
