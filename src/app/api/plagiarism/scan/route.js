import { authenticatedUserFromRequest, jsonResponse } from '@/../lib/auth.js';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const user = authenticatedUserFromRequest(req);
    if (!user) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const backendUrl = process.env.PAGGY_BACKEND_URL || 'http://localhost:8000';
    let formData;
    try {
      formData = await req.formData();
    } catch {
      return jsonResponse({ error: 'Invalid form data' }, 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

    const authHeader = req.headers.get('Authorization') || `Bearer mock-token-${user.userId}`;

    const response = await fetch(`${backendUrl}/api/v1/scans`, {
      method: 'POST',
      body: formData,
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
      return jsonResponse({ error: 'Analysis timed out after 60 seconds' }, 504);
    }
    return jsonResponse({ error: error.message || 'Similarity scan failed' }, 500);
  }
}

export async function GET() {
  return jsonResponse({ error: 'Method not allowed' }, 405);
}
