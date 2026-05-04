import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- CONFIG ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function generateChatResponse(message, history) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);

  const contextPrompt = `You are a helpful academic research assistant. 
  Answer the following user query professionally and concisely.
  
  CONTEXT:
  ${history.map(m => `${m.role}: ${m.content}`).join('\n')}
  user: ${message}`;

  try {
    // 1. Groq
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [{ role: "user", content: contextPrompt }]
        })
      });
      if (res.ok) {
        const d = await res.json();
        return d?.choices?.[0]?.message?.content;
      }
    } catch (e) {}

    // 2. Gemini Fallback
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(contextPrompt, { signal: controller.signal });
    return result.response.text();

  } catch (e) {
    return "I'm currently recalibrating. Please try asking again in a moment.";
  } finally {
    clearTimeout(id);
  }
}

export async function POST(req) {
  try {
    const { message, history = [] } = await req.json();
    if (!message) return NextResponse.json({ status: "error", message: "Message required" }, { status: 400 });

    const result = await generateChatResponse(message, history);
    return NextResponse.json({ status: "success", result });
  } catch (err) {
    return NextResponse.json({ status: "error", message: "System Busy" }, { status: 500 });
  }
}
