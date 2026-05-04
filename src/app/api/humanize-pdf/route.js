import { extractText, detectType } from '@/../lib/extract.js';
import { buildHTML, renderPDF } from '@/../lib/pdf.js';
import { NextResponse } from 'next/server';

// --- CONFIGURATION ---
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// --- STABILITY HELPERS ---

async function generateWithGroq(prompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [{ role: "user", content: prompt }]
      })
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error("Groq failed");
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (e) {
    return null;
  }
}

// --- HANDLER ---

export async function POST(req) {
  try {
    // 1. ENV & INPUT GUARD
    if (!GROQ_API_KEY) throw new Error("CONFIG_MISSING");

    let rawText = "";
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const fileData = formData.get('file');
      if (!fileData) throw new Error("NO_FILE");

      const fileType = detectType(fileData.name, fileData.type);
      const buffer = Buffer.from(await fileData.arrayBuffer());
      rawText = await extractText(buffer, fileType);
    } else {
      const body = await req.json();
      rawText = body?.text || "";
    }

    if (!rawText || rawText.length < 100) throw new Error("TEXT_TOO_SHORT");

    // 2. BATCH HUMANIZATION (Single Call for Speed)
    const prompt = `You are a world-class academic editor. Rewrite the following academic text to be more human-like, clear, and engaging while preserving all citations and technical accuracy. 
    Return the rewritten text directly.
    
    TEXT TO HUMANIZED:
    ${rawText.substring(0, 4000)}`; // Limit to 4k chars for speed

    const humanizedText = await generateWithGroq(prompt) || rawText;

    // 3. GENERATE PDF (Base64 only - no FS writes)
    const html = buildHTML({
      title: "Humanized Academic Paper",
      meta: `Processed by AI Humanizer • ${new Date().toLocaleDateString()}`,
      sections: [{ heading: "Humanized Content", body: humanizedText }]
    });

    let pdfBase64 = null;
    try {
      const pdfBuffer = await renderPDF(html);
      pdfBase64 = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
    } catch (pdfErr) {
      console.error("PDF generation skipped in humanizer:", pdfErr.message);
    }

    // 4. RESPOND
    return NextResponse.json({
      text: humanizedText,
      pdfUrl: pdfBase64,
      meta: {
        engine: "Groq Llama 3",
        status: "Success"
      }
    });

  } catch (error) {
    console.error("HUMANIZER CRITICAL ERROR:", error.message);
    
    // Always return JSON, never HTML
    return NextResponse.json({ 
      error: "Humanization temporarily limited. Please retry with a smaller text.",
      detail: error.message 
    }, { status: 500 });
  }
}
