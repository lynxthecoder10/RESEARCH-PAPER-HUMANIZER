import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

let isProcessing = false;

const BODY_SECTIONS = [
  'ABSTRACT',
  'INTRODUCTION',
  'METHODOLOGY',
  'RESULTS',
  'DISCUSSION',
  'CONCLUSION'
];

const SECTION_ORDER = [
  'TITLE',
  'ABSTRACT',
  'KEYWORDS',
  'INTRODUCTION',
  'METHODOLOGY',
  'RESULTS',
  'DISCUSSION',
  'CONCLUSION',
  'REFERENCES'
];

const SECTION_ALIASES = {
  TITLE: 'TITLE',
  ABSTRACT: 'ABSTRACT',
  KEYWORDS: 'KEYWORDS',
  'INDEX TERMS': 'KEYWORDS',
  INTRODUCTION: 'INTRODUCTION',
  METHODOLOGY: 'METHODOLOGY',
  METHODS: 'METHODOLOGY',
  RESULTS: 'RESULTS',
  FINDINGS: 'RESULTS',
  DISCUSSION: 'DISCUSSION',
  ANALYSIS: 'DISCUSSION',
  CONCLUSION: 'CONCLUSION',
  CONCLUSIONS: 'CONCLUSION',
  REFERENCES: 'REFERENCES'
};

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'among', 'because', 'between',
  'being', 'could', 'from', 'have', 'into', 'more', 'most', 'other', 'should',
  'their', 'there', 'these', 'this', 'through', 'under', 'using', 'while',
  'with', 'within', 'would', 'which', 'that', 'were', 'will'
]);

// --- INTEGRITY EXTRACTOR ---
function extractIntegrityTokens(text) {
  const rawText = String(text || '');
  const numericText = rawText.replace(/\[\d+\]/g, ' ');
  const compoundPattern = /\b\d+(?:\.\d+)?\s*(?:%|(?:bps|kbps|mbps|gbps|tbps|hz|khz|mhz|ghz|ms|sec|secs|seconds|s|min|mins|minutes|h|hr|hrs|hours|kb|mb|gb|tb|bytes|bit|bits|w|kw|v|kv|a|ma|c|f|k|m|cm|mm|km|kg|g|mg|l|ml)\b)/gi;
  const compoundNumbers = numericText.match(compoundPattern) || [];
  const textWithoutCompounds = numericText.replace(compoundPattern, ' ');
  const plainNumbers = textWithoutCompounds.match(/\b\d+(?:\.\d+)?\b/g) || [];
  const numbers = [...compoundNumbers, ...plainNumbers].map(number => number.replace(/\s+/g, ' ').trim());
  const citations = rawText.match(/\[\d+\]/g) || [];
  return { numbers: [...new Set(numbers)], citations: [...new Set(citations)] };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasIntegrityToken(text, token, label) {
  if (label === 'citations') return text.includes(token);
  if (/[a-z%]/i.test(token)) return text.toLowerCase().includes(token.toLowerCase());

  const numericPattern = new RegExp(`(^|[^\\d.])${escapeRegExp(token)}(?!\\.\\d)(?=$|[^\\d])`);
  return numericPattern.test(text);
}

function verifyIntegrity(original, formatted) {
  const { numbers, citations } = extractIntegrityTokens(original);
  for (const number of numbers) {
    if (!hasIntegrityToken(formatted, number, 'numbers')) return false;
  }

  for (const cite of citations) {
    if (!hasIntegrityToken(formatted, cite, 'citations')) return false;
  }
  return true;
}

function sanitizeMarkdownArtifacts(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/^\s*```(?:\w+)?\s*$/gim, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+(?=(TITLE|ABSTRACT|KEYWORDS|INTRODUCTION|METHODOLOGY|METHODS|RESULTS|FINDINGS|DISCUSSION|CONCLUSION|CONCLUSIONS|REFERENCES)\b)/gim, '')
    .replace(/\*\*(TITLE|ABSTRACT|KEYWORDS|INTRODUCTION|METHODOLOGY|METHODS|RESULTS|FINDINGS|DISCUSSION|CONCLUSION|CONCLUSIONS|REFERENCES)\*\*/gim, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function splitSentences(text) {
  const decimalSafeText = String(text || '')
    .replace(/(\d)\.(\d)/g, '$1<DECIMAL>$2')
    .replace(/\s+/g, ' ');

  return decimalSafeText
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(sentence => sentence.trim())
    .map(sentence => sentence.replace(/<DECIMAL>/g, '.'))
    .filter(sentence => sentence.split(/\s+/).length >= 5) || [];
}

function sentenceFromSource(content, index = 0) {
  const lines = sanitizeMarkdownArtifacts(content)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const bodyLines = lines.filter((line, lineIndex) => {
    return !(lineIndex === 0 && line.split(/\s+/).length <= 10 && !/[.!?]$/.test(line));
  });
  const sentences = splitSentences(joinAcademicLines(bodyLines));
  return sentences[index] || sentences[0] || String(content || '').replace(/\s+/g, ' ').trim();
}

function extractTopic(content) {
  const lines = sanitizeMarkdownArtifacts(content)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const titleLine = lines.find(line => line.split(/\s+/).length <= 10 && !/[.!?]$/.test(line));
  const source = titleLine || sentenceFromSource(content);
  const candidate = source
    .replace(/^[-*\d.\s]+/, '')
    .replace(/^(this paper|this study|the paper|the study)\s+(examines|explores|discusses|analyzes|introduces)\s+/i, '')
    .split(/\b(protects|examines|explores|discusses|addresses|analyzes|uses|supports|helps|provides|requires|faces)\b/i)[0]
    .split(/\s+/)
    .slice(0, 8)
    .join(' ')
    .replace(/[,:;.!?]+$/, '')
    .trim();

  return candidate || 'the submitted research topic';
}

function titleCase(value) {
  const minorWords = new Set(['a', 'an', 'and', 'as', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (/^[A-Z0-9-]{2,}$/.test(word)) return word;
      const lower = word.toLowerCase();
      if (index > 0 && minorWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function deriveTitle(content, generatedTitle = '') {
  const cleanGenerated = sanitizeMarkdownArtifacts(generatedTitle)
    .replace(/^TITLE\s*:?\s*/i, '')
    .split('\n')[0]
    .trim();

  if (cleanGenerated && cleanGenerated.split(/\s+/).length <= 14) {
    return titleCase(cleanGenerated.replace(/[.!?]+$/, ''));
  }

  return titleCase(extractTopic(content).replace(/[.!?]+$/, ''));
}

function joinAcademicLines(lines = []) {
  return lines.reduce((text, line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) return text;
    if (!text) return trimmed;

    const separator = /[.!?:]$/.test(text.trim()) ? ' ' : '. ';
    return `${text}${separator}${trimmed}`;
  }, '');
}

function topicInSentence(content) {
  const topic = extractTopic(content);
  if (/^[A-Z0-9]{2,}\b/.test(topic)) return topic;
  return topic
    .split(/\s+/)
    .map(word => (/^[A-Z0-9-]{2,}$/.test(word) ? word : word.toLowerCase()))
    .join(' ');
}

function extractKeywords(content) {
  const counts = new Map();
  const words = String(content || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 4 && !STOP_WORDS.has(word));

  words.forEach((word, index) => {
    const entry = counts.get(word) || { count: 0, index };
    entry.count += 1;
    counts.set(word, entry);
  });

  const keywords = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].index - b[1].index)
    .slice(0, 6)
    .map(([word]) => word);

  if (!keywords.includes('cryptography') && /\bcryptography\b/i.test(content)) {
    keywords.unshift('cryptography');
  }

  const uniqueKeywords = [...new Set(keywords)]
    .slice(0, 7)
    .map(word => word);

  const fallbackKeywords = ['research', 'analysis', 'methodology', 'findings', 'academic structure'];
  for (const keyword of fallbackKeywords) {
    if (uniqueKeywords.length >= 5) break;
    if (!uniqueKeywords.includes(keyword)) uniqueKeywords.push(keyword);
  }

  return `Keywords: ${uniqueKeywords.slice(0, 7).join(', ')}`;
}

function buildReferences(content) {
  const { citations } = extractIntegrityTokens(content);
  if (citations.length) {
    return citations.map(citation => `${citation} Reference placeholder based on citation.`).join('\n');
  }

  return 'Source material supplied for academic formatting.';
}

function fallbackSentences(section, content) {
  const topic = topicInSentence(content);
  const sourceSentence = sentenceFromSource(content);

  const bySection = {
    ABSTRACT: [
      `This paper examines ${topic} as presented in the submitted material, focusing on the stated purpose, problem context, and academic relevance while preserving the original claims, numerical values, and citations supplied by the user.`,
      'The approach organizes the source content into an IEEE-style research structure by separating contextual material, methodological framing, reported outcomes, interpretive discussion, and concluding significance without introducing unsupported external facts.',
      `The resulting paper clarifies how the submitted information supports the research objective, identifies the main findings from the source material, and keeps deeper technical explanation outside the introductory framing.`,
      'This formatting improves readability, export readiness, and academic coherence while remaining limited to the supplied content and indicating future scope only as a continuation of the original research direction.'
    ],
    INTRODUCTION: [
      `The study introduces ${topic} within its relevant academic and technical context.`,
      'It defines the scope of the discussion, identifies the core problem, and states the objective of presenting the material in a structured research format.'
    ],
    METHODOLOGY: [
      'This paper follows a qualitative synthesis method based on the submitted source content.',
      'Key ideas are organized by purpose, technical role, and relationship to the research objective without adding unsupported external data.'
    ],
    RESULTS: [
      `The structured analysis identifies the main claim that ${sourceSentence}`,
      'The resulting paper preserves the original evidence while making the findings easier to read, compare, and cite.'
    ],
    DISCUSSION: [
      'The discussion interprets the importance of the identified concepts for the broader research context.',
      'It highlights practical implications, limitations in the available source material, and areas where continued study remains useful.'
    ],
    CONCLUSION: [
      `The paper concludes that ${topic} remains significant within the selected academic domain.`,
      'The findings reinforce the importance of clear technical explanation, careful implementation, and future research based on more detailed evidence.'
    ]
  };

  return bySection[section] || [];
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function ensureSentenceCount(section, value, content) {
  const normalized = String(value || '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = splitSentences(normalized);
  const additions = fallbackSentences(section, content)
    .filter(sentence => !normalized.toLowerCase().includes(sentence.toLowerCase()));

  if (section === 'ABSTRACT') {
    const abstractSentences = [...sentences, ...additions];
    let abstract = abstractSentences.join(' ');
    let index = 0;
    while (wordCount(abstract) < 120 && index < additions.length) {
      if (!abstract.includes(additions[index])) {
        abstract = `${abstract} ${additions[index]}`.trim();
      }
      index += 1;
    }
    while (wordCount(abstract) < 120) {
      abstract = `${abstract} The paper remains limited to the supplied content and does not introduce unsupported external claims.`.trim();
    }
    const limited = splitSentences(abstract).reduce((kept, sentence) => {
      const candidate = [...kept, sentence].join(' ');
      return wordCount(candidate) <= 150 ? [...kept, sentence] : kept;
    }, []);
    return (limited.length ? limited : splitSentences(abstract).slice(0, 4)).join(' ');
  }

  if (sentences.length >= 2) {
    return sentences.slice(0, 4).join(' ');
  }

  return [...sentences, ...additions].slice(0, 4).join(' ');
}

function appendMissingIntegrity(section, value, original, label) {
  const missing = extractIntegrityTokens(original)[label]
    .filter(token => !hasIntegrityToken(value, token, label));
  if (!missing.length) return value;

  const sentence = label === 'numbers'
    ? `The submitted content includes the following numerical values that remain integral to the analysis: ${missing.join(', ')}.`
    : `The submitted content includes the following citations that remain integral to the analysis: ${missing.join(', ')}.`;

  if (section === 'RESULTS' || section === 'REFERENCES') {
    return `${value} ${sentence}`.trim();
  }

  return value;
}

function parseSections(text) {
  const sections = new Map();
  let current = null;

  for (const line of sanitizeMarkdownArtifacts(text).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(TITLE|ABSTRACT|KEYWORDS|INDEX TERMS|INTRODUCTION|METHODOLOGY|METHODS|RESULTS|FINDINGS|DISCUSSION|ANALYSIS|CONCLUSION|CONCLUSIONS|REFERENCES)\s*:?\s*(.*)$/i);
    if (match) {
      current = SECTION_ALIASES[match[1].toUpperCase()];
      if (!sections.has(current)) sections.set(current, []);
      if (match[2]) sections.get(current).push(match[2]);
      continue;
    }

    if (current) {
      sections.get(current).push(trimmed);
    } else {
      if (!sections.has('TITLE')) sections.set('TITLE', []);
      sections.get('TITLE').push(trimmed);
    }
  }

  return sections;
}

function normalizeBodySection(section, value, content) {
  const normalized = String(value || '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^Further research is recommended\.?$/i.test(normalized)) {
    return fallbackSentences(section, content).join(' ');
  }

  return ensureSentenceCount(section, normalized, content);
}

function normalizeAcademicPaper(original, generated) {
  const parsed = parseSections(generated);
  const lines = [];

  for (const section of SECTION_ORDER) {
    lines.push(section);

    if (section === 'TITLE') {
      lines.push(deriveTitle(original, parsed.get(section)?.join(' ')));
    } else if (section === 'KEYWORDS') {
      const keywords = parsed.get(section)?.join(' ').trim();
      lines.push(keywords?.toLowerCase().startsWith('keywords:') ? keywords : extractKeywords(original));
    } else if (section === 'REFERENCES') {
      const references = parsed.get(section)?.join('\n').trim();
      lines.push(appendMissingIntegrity(section, references || buildReferences(original), original, 'citations'));
    } else if (BODY_SECTIONS.includes(section)) {
      const body = normalizeBodySection(section, joinAcademicLines(parsed.get(section)), original);
      const withNumbers = appendMissingIntegrity(section, body, original, 'numbers');
      lines.push(section === 'RESULTS' ? appendMissingIntegrity(section, withNumbers, original, 'citations') : withNumbers);
    }

    lines.push('');
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// --- FORMATTING PROMPT ---
function buildPrompt(content) {
  const structure = `TITLE\nABSTRACT\nKEYWORDS\nINTRODUCTION\nMETHODOLOGY\nRESULTS\nDISCUSSION\nCONCLUSION\nREFERENCES`;

  return `You are an academic editor and formatter.

Your task is to transform the provided content into a complete IEEE-style research paper while strictly preserving the original meaning, data, and citations.

CORE RULES:
- DO NOT change meaning
- DO NOT change intent
- DO NOT modify numbers, percentages, units, or statistics
- DO NOT remove citations like [1], [2]
- DO NOT add new data or facts
- DO NOT hallucinate information
- ONLY improve clarity, structure, and academic formatting
- Return plain text only
- REMOVE markdown symbols such as ##, *, -, _, backticks, bullets, and code fences
- Use section headings in uppercase
- Use full paragraphs, not bullet points
- Every section must be present and non-empty

SECTION REQUIREMENTS:
- TITLE: derive a concise academic title from the content
- ABSTRACT: 120-150 words summarizing purpose, approach, and significance
- KEYWORDS: provide 5-7 relevant technical keywords in one "Keywords:" line
- INTRODUCTION: provide context, define the problem, and state the objective; do not include deep technical explanation
- METHODOLOGY: explain the approach or process from the content; if missing, infer logically without changing meaning
- RESULTS: describe outcomes or findings based on the content and preserve all numerical data
- DISCUSSION: interpret results and mention implications and limitations
- CONCLUSION: summarize key points, state importance, and suggest future scope in 2-3 sentences minimum
- REFERENCES: include placeholder entries for all citations found, formatted as "[n] Reference placeholder based on citation."

INTEGRITY ENFORCEMENT:
- All numbers from the input must appear in the output
- All citations [n] must remain present
- No information should be lost

Structure the output into these sections:
${structure}

Content:
${content}`;
}

// --- FALLBACK FORMATTER ---
function buildFallback(content) {
  return normalizeAcademicPaper(content, content, 'ieee');
}

export async function POST(req) {
  if (isProcessing) {
    return NextResponse.json({ status: 'busy', retryAfter: 2000 }, { status: 200 });
  }

  try {
    isProcessing = true;
    const { content } = await req.json();

    if (!content || content.trim().length < 50) {
      return NextResponse.json({ status: 'error', message: 'Content too short. Please paste your research.' });
    }

    const prompt = buildPrompt(content);

    // --- SINGLE AI CALL (Groq 8B, max 6s) ---
    let formatted = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2048,
          temperature: 0.3
        })
      });
      const data = await res.json();
      formatted = data?.choices?.[0]?.message?.content || '';
    } catch (e) {
      // Groq failed → try Gemini fallback within remaining budget
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        formatted = result.response.text();
      } catch (e2) {
        formatted = '';
      }
    } finally {
      clearTimeout(timeout);
    }

    // --- INTEGRITY VERIFICATION ---
    if (formatted && !verifyIntegrity(content, formatted)) {
      // Retry once with Gemini if citations are missing
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        formatted = result.response.text();
      } catch (e) {}
    }

    // --- FALLBACK if still empty ---
    if (!formatted || formatted.trim().length < 100) {
      return NextResponse.json({
        status: 'success',
        result: buildFallback(content),
        fallback: true
      });
    }

    formatted = normalizeAcademicPaper(content, formatted);

    return NextResponse.json({
      status: 'success',
      result: formatted,
      fallback: false
    });

  } catch (err) {
    return NextResponse.json({ status: 'error', message: 'Formatting engine unavailable. Please retry.' });
  } finally {
    isProcessing = false;
  }
}
