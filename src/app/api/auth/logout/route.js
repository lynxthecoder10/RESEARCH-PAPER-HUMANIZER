import { clearAuthCookie, jsonResponse } from '@/../lib/auth.js';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const response = jsonResponse({ ok: true });
    clearAuthCookie(response);
    return response;
  } catch (error) {
    return jsonResponse({ error: error.message || 'Logout failed' }, 500);
  }
}
