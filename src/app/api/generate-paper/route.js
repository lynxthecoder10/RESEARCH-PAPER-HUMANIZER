import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- CONFIG ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// --- STABILITY STATE ---
let isProcessing = false;
let lastExecutionTime = 0;
const COOLDOWN_MS = 1000;

async function generateAI(prompt) {
  // Increased timeout to 9.5s for maximum depth
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9500);

  try {
    // 1. PRIMARY: Groq (Llama 3 70B if available, otherwise 8B)
    if (GROQ_API_KEY) {
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3-70b-8192", // Upgraded to 70B for more depth
            messages: [{ role: "user", content: prompt }],
            max_tokens: 4096, // Request full length
            temperature: 0.7
          })
        });
        if (groqRes.ok) {
          const data = await groqRes.json();
          return data?.choices?.[0]?.message?.content;
        }
      } catch (e) {}
    }

    // 2. FALLBACK: Gemini 1.5 Flash
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt, { signal: controller.signal });
    return result.response.text();

  } catch (e) {
    return `ABSTRACT\nThis is a high-density placeholder for "${prompt.substring(0, 50)}...". System reached timeout limits. Please try again for the full version.`;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req) {
  try {
    const now = Date.now();
    if (isProcessing || (now - lastExecutionTime < COOLDOWN_MS)) {
      return NextResponse.json({ status: "busy", message: "Deep-processing...", retryAfter: 4000 });
    }

    isProcessing = true;
    lastExecutionTime = now;

    try {
      const { topic } = await req.json();
      const detailedPrompt = `Write a comprehensive, professional IEEE academic paper on the topic: "${topic}". 
      The paper must be detailed, technical, and include the following sections in depth:
      1. ABSTRACT (concise summary)
      2. INTRODUCTION (background and significance)
      3. LITERATURE REVIEW (current state of the art)
      4. METHODOLOGY (technical approach)
      5. RESULTS AND ANALYSIS (simulated data and findings)
      6. CONCLUSION AND FUTURE WORK
      7. REFERENCES (at least 5 academic citations)
      Use formal academic tone throughout. Make it as long as possible within the response limit.`;

      const result = await generateAI(detailedPrompt);
      return NextResponse.json({ status: "success", title: topic, content: result });
    } finally {
      isProcessing = false;
    }
  } catch (err) {
    isProcessing = false;
    return NextResponse.json({ status: "error", message: "System busy..." });
  }
}
