import { authenticatedUserFromRequest, jsonResponse } from '@/../lib/auth.js';

export const runtime = 'nodejs';

export async function DELETE(req, context) {
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

    const response = await fetch(`${backendUrl}/api/v1/history/${scanId}`, {
      method: 'DELETE',
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

    return Response.json(data, { status: response.status });
  } catch (error) {
    if (error.name === 'AbortError') {
      return jsonResponse({ error: 'Request timed out' }, 504);
    }
    return jsonResponse({ error: error.message || 'Failed to delete history' }, 500);
  }
}
