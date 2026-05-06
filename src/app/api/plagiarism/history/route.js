import { authenticatedUserFromRequest, jsonResponse } from '@/../lib/auth.js';
import { listScansByUser } from '@/../lib/plagiarismScanStore.js';

export const runtime = 'nodejs';

function mapScan(scan) {
  return {
    scanId: scan.scanId,
    createdAt: scan.createdAt,
    provider: scan.provider,
    similarity: scan.similarity,
    originality: scan.originality,
    risk: scan.risk,
    wordCount: scan.wordCount,
    preview: scan.preview
  };
}

export async function GET(req) {
  try {
    const user = authenticatedUserFromRequest(req);
    if (!user) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const scans = await listScansByUser(user.userId, 20);
    return jsonResponse({ scans: scans.map(mapScan) });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Failed to load history' }, 500);
  }
}
