import { updateScan } from '@/../lib/plagiarismScanStore.js';
import { jsonResponse } from '@/../lib/auth.js';

export const runtime = 'nodejs';

function reportUpdate(report = {}) {
  const update = {};
  for (const key of ['similarity', 'originality', 'risk', 'matches', 'flags', 'wordCount']) {
    if (report[key] !== undefined) update[key] = report[key];
  }
  return update;
}

export async function POST(req, context) {
  try {
    const { status } = await context.params;
    const url = new URL(req.url);
    const secret = req.headers.get('x-webhook-secret') || url.searchParams.get('secret');

    if (!process.env.COPYLEAKS_WEBHOOK_SECRET || secret !== process.env.COPYLEAKS_WEBHOOK_SECRET) {
      return jsonResponse({ error: 'Invalid webhook secret' }, 401);
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const scanId = body.scanId || body.id || body?.scannedDocument?.scanId;
    if (!scanId) {
      return jsonResponse({ error: 'scanId required' }, 400);
    }

    const scan = await updateScan(scanId, {
      provider: 'copyleaks',
      status,
      ...reportUpdate(body.report)
    });

    if (!scan) {
      return jsonResponse({ error: 'Scan not found' }, 404);
    }

    return jsonResponse({ scanId, status: scan.status });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Webhook failed' }, error.status || 500);
  }
}

export async function GET() {
  try {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Method not allowed' }, 405);
  }
}
