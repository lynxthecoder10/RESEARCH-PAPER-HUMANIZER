import { NextResponse } from 'next/server';
import dbConnect from '@/../lib/db';
import PlagiarismScan from '@/../models/PlagiarismScan';

export const runtime = 'nodejs';

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function scanToResponse(scan) {
  return {
    scanId: scan.scanId,
    status: scan.status,
    report: {
      similarity: scan.similarity,
      originality: scan.originality,
      risk: scan.risk,
      wordCount: scan.wordCount,
      matches: scan.matches || [],
      flags: scan.flags || [],
      provider: scan.provider
    }
  };
}

export async function GET(req, context) {
  try {
    const { scanId } = await context.params;
    await dbConnect();

    const scan = await PlagiarismScan.findOne({ scanId }).lean();
    if (!scan) {
      return jsonError('Scan not found', 404);
    }

    return NextResponse.json(scanToResponse(scan));
  } catch (error) {
    return jsonError(error.message || 'Failed to fetch scan', error.status || 500);
  }
}
