import { authenticatedUserFromRequest, jsonResponse } from '@/../lib/auth.js';

export const runtime = 'nodejs';

export async function GET(req, context) {
  try {
    const user = authenticatedUserFromRequest(req);
    if (!user) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const { scanId } = await context.params;
    const backendUrl = process.env.PAGGY_BACKEND_URL || 'http://localhost:8000';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s

    const authHeader = req.headers.get('Authorization') || `Bearer mock-token-${user.userId}`;

    const response = await fetch(`${backendUrl}/api/v1/scans/${scanId}/report`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    let data;
    try {
      data = await response.json();
    } catch {
      return jsonResponse({ error: 'Invalid response from analysis engine' }, 502);
    }

    // The backend returns { scan_id, cache_hit, report: {...} }. 
    // We map it to { scanId, status, report: {...} } to match frontend expectations if needed,
    // or we just return it exactly. The frontend will be adapted to read this structure.
    return Response.json(data, { status: response.status });
  } catch (error) {
    if (error.name === 'AbortError') {
      return jsonResponse({ error: 'Request timed out' }, 504);
    }
    return jsonResponse({ error: error.message || 'Failed to fetch scan' }, 500);
  }
}

export async function POST() {
  return jsonResponse({ error: 'Method not allowed' }, 405);
}
