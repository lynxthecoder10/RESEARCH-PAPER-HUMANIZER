import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

let isProcessing = false;

async function runTimedAI(fn, timeoutMs) {
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
  const GLOBAL_BUDGET = 9000; // 9s total
  const FALLBACK_THRESHOLD = 1500; // 1.5s remaining

  try {
    // 1. CONCURRENCY GUARD (Fail-fast Soft-Busy)
    if (isProcessing) {
      return NextResponse.json({ status: "busy", retryAfter: 2000 }, { status: 200 });
    }
    isProcessing = true;

    const { topic } = await req.json();

    // 2. PASS 1: ACADEMIC PASS (Groq 8B - Strict 6s timeout)
    let paperContent = "";
    try {
      paperContent = await runTimedAI(async (signal) => {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal,
          headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3-8b-8192", // Optimized for low-latency
            messages: [{ role: "user", content: `Generate an IEEE paper on ${topic}. Structurally separate sections: ABSTRACT, INTRODUCTION, METHODOLOGY, RESULTS, CONCLUSION.` }],
            max_tokens: 2048,
            temperature: 0.6
          })
        });
        const data = await res.json();
        return data?.choices?.[0]?.message?.content || "";
      }, 6000);
    } catch (e) {
      // Fallback to local draft if Pass 1 fails
      paperContent = `[FALLBACK CONTENT] IEEE Research Draft on ${topic}\n\nABSTRACT\nGenerating high-quality academic data. Please refresh for a deeper AI pass.`;
    }

    // 3. PASS 2: CONDITIONAL HUMANIZATION
    const timeElapsed = Date.now() - startTime;
    const timeLeft = GLOBAL_BUDGET - timeElapsed;

    if (timeLeft > FALLBACK_THRESHOLD && paperContent && !paperContent.includes("[FALLBACK]")) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const humanized = await model.generateContent(`Improve flow and reduce AI detection: ${paperContent.substring(0, 3000)}`);
        paperContent = humanized.response.text();
      } catch (e) {} // Silent skip if humanization fails or times out
    }

    return NextResponse.json({ 
      status: "success", 
      paper: paperContent,
      meta: { mode: "adaptive", timeUsed: Date.now() - startTime }
    });

  } catch (err) {
    return NextResponse.json({ status: "error", message: "System optimized. Please retry." });
  } finally {
    isProcessing = false;
  }
}
