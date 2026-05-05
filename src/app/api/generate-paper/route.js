import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

let isProcessing = false;

// --- INTEGRITY EXTRACTOR ---
function extractIntegrityTokens(text) {
  const numbers = text.match(/\b\d+\.?\d*%?\b/g) || [];
  const citations = text.match(/\[\d+\]/g) || [];
  return { numbers: [...new Set(numbers)], citations: [...new Set(citations)] };
}

function verifyIntegrity(original, formatted) {
  const { citations } = extractIntegrityTokens(original);
  for (const cite of citations) {
    if (!formatted.includes(cite)) return false;
  }
  return true;
}

// --- FORMATTING PROMPT ---
function buildPrompt(content, format) {
  const structure = format === 'ieee'
    ? `ABSTRACT\nINTRODUCTION\nMETHODOLOGY\nRESULTS\nDISCUSSION\nCONCLUSION\nREFERENCES`
    : `ABSTRACT\nINTRODUCTION\nMETHODOLOGY\nRESULTS\nDISCUSSION\nCONCLUSION`;

  return `You are an academic editor.

Rewrite the following content into a structured research paper.

STRICT RULES:
- DO NOT change meaning
- DO NOT modify numbers or statistics
- DO NOT remove citations like [1], [2]
- DO NOT add new data or facts
- ONLY improve structure and academic clarity

Structure the output into these sections:
${structure}

Content:
${content}`;
}

// --- FALLBACK FORMATTER ---
function buildFallback(content) {
  const lines = content.split('\n').filter(l => l.trim());
  return `ABSTRACT\n${lines.slice(0, 3).join(' ')}\n\nINTRODUCTION\n${lines.slice(3, 8).join('\n')}\n\nMETHODOLOGY\n${lines.slice(8, 13).join('\n')}\n\nRESULTS\n${lines.slice(13, 18).join('\n')}\n\nDISCUSSION\n${lines.slice(18, 22).join('\n')}\n\nCONCLUSION\n${lines.slice(22).join('\n') || "Further research is recommended."}`;
}

export async function POST(req) {
  if (isProcessing) {
    return NextResponse.json({ status: 'busy', retryAfter: 2000 }, { status: 200 });
  }

  try {
    isProcessing = true;
    const { content, format = 'ieee' } = await req.json();

    if (!content || content.trim().length < 50) {
      return NextResponse.json({ status: 'error', message: 'Content too short. Please paste your research.' });
    }

    const prompt = buildPrompt(content, format);

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
