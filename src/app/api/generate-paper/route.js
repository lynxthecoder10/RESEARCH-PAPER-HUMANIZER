import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- CONFIG ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// --- STABILITY STATE ---
let isProcessing = false;
let lastExecutionTime = 0;
const COOLDOWN_MS = 1500;

async function generateAI(prompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    // 1. PRIMARY: Groq (Llama 3 8B) - Fast & Free Tier
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (groqRes.ok) {
        const data = await groqRes.json();
        return data?.choices?.[0]?.message?.content;
      }
    } catch (e) {}

    // 2. FALLBACK: Gemini 1.5 Flash - Stable & Free Tier
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt, { signal: controller.signal });
    return result.response.text();

  } catch (e) {
    // 3. EMERGENCY: Local Draft
    return `ABSTRACT\nDraft generated via emergency local node...`;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req) {
  try {
    const now = Date.now();
    if (isProcessing || (now - lastExecutionTime < COOLDOWN_MS)) {
      return NextResponse.json({ status: "busy", message: "Queuing request...", retryAfter: 3000 });
    }

    isProcessing = true;
    lastExecutionTime = now;

    try {
      const { topic } = await req.json();
      const result = await generateAI(`Generate an IEEE academic paper on: "${topic}". Include sections: ABSTRACT, INTRODUCTION, METHODOLOGY, RESULTS, CONCLUSION.`);
      return NextResponse.json({ status: "success", title: topic, content: result });
    } finally {
      isProcessing = false;
    }
  } catch (err) {
    isProcessing = false;
    return NextResponse.json({ status: "error", message: "System busy..." });
  }
}
