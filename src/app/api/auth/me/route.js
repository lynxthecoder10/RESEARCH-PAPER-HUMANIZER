import { authenticatedUserFromRequest, jsonResponse } from '@/../lib/auth.js';

export const runtime = 'nodejs';

export async function GET(req) {
  try {
    const user = authenticatedUserFromRequest(req);
    if (!user) {
      return jsonResponse({ user: null });
    }

    return jsonResponse({
      user: {
        id: user.userId,
        email: user.email
      }
    });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Failed to load user' }, 500);
  }
}
