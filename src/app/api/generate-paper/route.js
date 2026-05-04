import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

let isProcessing = false;

async function runAI(fn, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req) {
  const startTime = Date.now();
  const GLOBAL_TIMEOUT = 9000;
  
  if (isProcessing) {
    return NextResponse.json({ status: "busy", retryAfter: 2000 }, { status: 200 });
  }
  
  try {
    isProcessing = true;
    const { topic } = await req.json();

    // PERFORMANCE RULE: Max 1 primary call (Llama 3 8B)
    let content = "";
    try {
      content = await runAI(async (signal) => {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal,
          headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3-8b-8192",
            messages: [{ role: "user", content: `Generate an IEEE paper on ${topic}.` }],
            max_tokens: 1500,
            temperature: 0.6
          })
        });
        const data = await res.json();
        return data?.choices?.[0]?.message?.content || "";
      }, 5500); // Strict 5.5s for primary call
    } catch (e) {
      content = `[FALLBACK] IEEE Research Outline: ${topic}\n\nABSTRACT\nDetailed content reached timeout. Please regenerate.`;
    }

    // PERFORMANCE RULE: Optional 1 refinement call ONLY if budget > 2s
    const elapsed = Date.now() - startTime;
    const remaining = GLOBAL_TIMEOUT - elapsed;

    if (remaining > 2000 && !content.includes("[FALLBACK]")) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(`Refine this academic content for flow: ${content.substring(0, 2000)}`);
        content = result.response.text();
      } catch (e) {} // Fail gracefully to return primary content
    }

    return NextResponse.json({ 
      status: "success", 
      paper: content,
      meta: { duration: Date.now() - startTime }
    });

  } catch (err) {
    return NextResponse.json({ status: "error", message: "Stability guard triggered." });
  } finally {
    isProcessing = false;
  }
}
