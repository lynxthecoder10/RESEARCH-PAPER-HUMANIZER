import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const MASTER_PROMPT_TEMPLATE = (topic) => `
You are an academic research assistant trained in scholarly writing.
Your task is to generate original, academically valid content on the topic: "${topic}"

Follow these STRICT rules:

1. CONTENT QUALITY
- Write in formal academic tone, use precise terminology, avoid generic statements.

2. ORIGINALITY
- DO NOT copy or mimic common textbook phrasing. Ensure each sentence contributes new meaning.

3. STRUCTURE
Provide output EXACTLY in this format:
[TITLE]
[ABSTRACT] (120–150 words)
[INTRODUCTION]
[LITERATURE INSIGHT]
[METHODOLOGY]
[RESULTS]
[DISCUSSION]
[CONCLUSION]
[REFERENCES] (At least 5 numbered placeholders [1], [2]...)

4. CITATION STYLE
- Use placeholder citations like [1], [2]. DO NOT fabricate real DOIs.

5. LENGTH
- Total: 400–700 words. No repetition or filler.

6. OUTPUT CLEANLINESS
- NO markdown, NO bullet points. Only structured academic paragraphs.
`;

const HUMANIZER_PROMPT = (content) => `
Rewrite the following academic content to improve human-like flow and reduce AI detectability. 
Vary sentence structure and preserve the technical meaning. Keep the EXACT same sections and headers.

CONTENT:
${content}
`;

async function fetchGroq(prompt, model = "llama3-70b-8192") {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
      temperature: 0.6
    })
  });
  const data = await res.json();
  return data?.choices?.[0]?.message?.content;
}

export async function POST(req) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8500); // 8.5s limit

  try {
    const { topic } = await req.json();

    // STEP 1: Academic Generation (Pass 1 - Fast Groq Llama 3 70B)
    const academicContent = await fetchGroq(MASTER_PROMPT_TEMPLATE(topic));

    // STEP 2: Humanization Pass (Pass 2 - Gemini 1.5 Flash for speed)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const humanizedResult = await model.generateContent(HUMANIZER_PROMPT(academicContent), { signal: controller.signal });
    const finalPaper = humanizedResult.response.text();

    return NextResponse.json({ 
      status: "success", 
      paper: finalPaper,
      meta: { mode: "ai_generated_plus_humanized", fallback: false }
    });

  } catch (err) {
    return NextResponse.json({ 
      status: "error", 
      message: "System busy. Generating high-quality academic papers takes peak resources." 
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
