import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- CONFIG ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// --- STABILITY STATE ---
let isProcessing = false;
let lastRun = 0;

async function generateAI(prompt) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  try {
    // 1. Groq
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (res.ok) {
        const d = await res.json();
        return d?.choices?.[0]?.message?.content;
      }
    } catch (e) {}

    // 2. Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt, { signal: controller.signal });
    return result.response.text();
  } catch (e) { return null; }
  finally { clearTimeout(id); }
}

export async function POST(req) {
  try {
    const now = Date.now();
    if (isProcessing || (now - lastRun < 1500)) {
      return NextResponse.json({ status: "busy", message: "Refining...", retryAfter: 3000 });
    }
    isProcessing = true;
    lastRun = now;
    try {
      const body = await req.json();
      const rawText = body?.text?.trim();
      if (!rawText || rawText.length < 100) return NextResponse.json({ error: "Text too short" }, { status: 400 });
      const prompt = `Rewrite this academic text to be more human, clear, and professional.\n\nTEXT:\n${rawText.substring(0, 4000)}`;
      let result = await generateAI(prompt);
      if (!result) result = rawText; 
      return NextResponse.json({ status: "success", result });
    } finally {
      isProcessing = false;
    }
  } catch (err) {
    isProcessing = false;
    return NextResponse.json({ status: "error", message: "Retrying..." });
  }
}
