import { createHash, randomUUID } from 'crypto';
import { detectType, extractText } from '@/../lib/extract.js';
import { saveScan } from '@/../lib/plagiarismScanStore.js';
import { runSimilarityScan } from '@/../lib/similarityProvider.js';
import { authenticatedUserFromRequest, jsonResponse } from '@/../lib/auth.js';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 200 * 1024;
const MAX_WORDS = 10000;
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60 * 1000;

const rateLimitStore = globalThis.similarityScanRateLimit ||
  (globalThis.similarityScanRateLimit = new Map());

function clientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip') || 'local';
}

function enforceRateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const recent = (rateLimitStore.get(ip) || []).filter(time => now - time < RATE_WINDOW_MS);

  if (recent.length >= RATE_LIMIT) {
    rateLimitStore.set(ip, recent);
    return false;
  }

  recent.push(now);
  rateLimitStore.set(ip, recent);
  return true;
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function hashText(text) {
  return createHash('sha256').update(text).digest('hex');
}

function buildPreview(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function isUpload(value) {
  return value &&
    typeof value === 'object' &&
    typeof value.arrayBuffer === 'function' &&
    typeof value.size === 'number' &&
    value.size > 0;
}

async function textFromRequest(formData) {
  const file = formData.get('file');

  if (isUpload(file)) {
    if (file.size > MAX_FILE_SIZE) {
      throw Object.assign(new Error('Input too large'), { status: 413 });
    }

    const type = detectType(file.name || '', file.type || '');
    if (!type) {
      throw Object.assign(new Error('Unsupported file type'), { status: 400 });
    }

    let extractedText = '';
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      extractedText = String(await extractText(buffer, type)).trim();
    } catch {
      throw Object.assign(new Error('Invalid or scanned file'), { status: 400 });
    }

    if (!extractedText || extractedText.length < 100) {
      throw Object.assign(new Error('Invalid or scanned file'), { status: 400 });
    }

    return extractedText;
  }

  return String(formData.get('text') || '').trim();
}

export async function POST(req) {
  try {
    const user = authenticatedUserFromRequest(req);
    if (!user) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    if (!enforceRateLimit(req)) {
      return jsonResponse({ error: 'Rate limit exceeded' }, 429);
    }

    let formData;
    try {
      formData = await req.formData();
    } catch {
      return jsonResponse({ error: 'Invalid form data' }, 400);
    }

    const text = await textFromRequest(formData);

    if (!text) {
      return jsonResponse({ error: 'Text or file required' }, 400);
    }

    if (wordCount(text) > MAX_WORDS) {
      return jsonResponse({ error: 'Input too large' }, 413);
    }

    const report = await runSimilarityScan(text);
    const scanId = randomUUID();
    const textHash = hashText(text);

    await saveScan({
      userId: user.userId,
      scanId,
      provider: report.provider,
      status: 'completed',
      similarity: report.similarity,
      originality: report.originality,
      risk: report.risk,
      matches: report.matches,
      flags: report.flags,
      wordCount: report.wordCount,
      textHash,
      preview: buildPreview(text)
    });

    return jsonResponse({
      scanId,
      status: 'completed',
      report
    });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Similarity scan failed' }, error.status || 500);
  }
}
