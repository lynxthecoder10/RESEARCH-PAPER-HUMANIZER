import { findScan } from '@/../lib/plagiarismScanStore.js';
import { authenticatedUserFromRequest, jsonResponse } from '@/../lib/auth.js';

export const runtime = 'nodejs';

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
    const user = authenticatedUserFromRequest(req);
    if (!user) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const { scanId } = await context.params;
    const scan = await findScan(scanId, user.userId);
    if (!scan) {
      return jsonResponse({ error: 'Scan not found' }, 404);
    }

    return jsonResponse(scanToResponse(scan));
  } catch (error) {
    return jsonResponse({ error: error.message || 'Failed to fetch scan' }, error.status || 500);
  }
}
