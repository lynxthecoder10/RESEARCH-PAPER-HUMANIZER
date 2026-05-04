/**
 * /lib/integrity.js
 * Post-rewrite integrity checks:
 *   - All numbers from original are present in output
 *   - All citations are preserved
 *   - Output length is within 60%–140% of input
 */

/** Extract all numeric tokens (integers, decimals, percentages). */
export function extractNumbers(text) {
  return [...new Set(text.match(/\b\d+(?:\.\d+)?%?\b/g) || [])];
}

/** Extract (Author, Year) and [N] style citation markers. */
export function extractCitations(text) {
  const apa   = text.match(/\([A-Z][a-z]+(?:\s+(?:&|et al\.))?,\s*\d{4}\)/g) || [];
  const apa2  = text.match(/\([A-Z][a-z]+\s+(?:and|&)\s+[A-Z][a-z]+,\s*\d{4}\)/g) || [];
  const numbered = text.match(/\[\d+\]/g) || [];
  return [...new Set([...apa, ...apa2, ...numbered])];
}

/**
 * Run all integrity checks.
 * @returns {{ numbersOK: boolean, citationsOK: boolean, lengthOK: boolean, passed: boolean }}
 */
export function checkIntegrity(original, rewritten) {
  // Numbers
  const origNums = extractNumbers(original);
  const numbersOK = origNums.every(n => rewritten.includes(n));

  // Citations
  const origCitations = extractCitations(original);
  const citationsOK = origCitations.every(c => rewritten.includes(c));

  // Length sanity (60%–140%)
  const ratio = rewritten.length / original.length;
  const lengthOK = ratio >= 0.6 && ratio <= 1.4;

  return {
    numbersOK,
    citationsOK,
    lengthOK,
    passed: numbersOK && citationsOK && lengthOK,
  };
}
