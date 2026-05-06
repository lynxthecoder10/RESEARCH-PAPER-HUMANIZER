import { NextResponse } from 'next/server';
import { updateScan } from '@/../lib/plagiarismScanStore.js';

export const runtime = 'nodejs';

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

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
      return jsonError('Invalid webhook secret', 401);
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const scanId = body.scanId || body.id || body?.scannedDocument?.scanId;
    if (!scanId) {
      return jsonError('scanId required');
    }

    const scan = await updateScan(scanId, {
      provider: 'copyleaks',
      status,
      ...reportUpdate(body.report)
    });

    if (!scan) {
      return jsonError('Scan not found', 404);
    }

    return NextResponse.json({ scanId, status: scan.status });
  } catch (error) {
    return jsonError(error.message || 'Webhook failed', error.status || 500);
  }
}
