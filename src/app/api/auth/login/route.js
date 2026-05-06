import dbConnect from '@/../lib/db.js';
import User from '@/../models/User.js';
import {
  createAuthToken,
  jsonResponse,
  setAuthCookie,
  validateEmail,
  validatePassword,
  verifyPassword
} from '@/../lib/auth.js';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request payload' }, 400);
    }

    const email = validateEmail(body.email);
    const password = validatePassword(body.password);
    if (!email || !password) {
      return jsonResponse({ error: 'Email and password are required' }, 400);
    }

    await dbConnect();
    const user = await User.findOne({ email });
    if (!user) {
      return jsonResponse({ error: 'Invalid credentials' }, 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return jsonResponse({ error: 'Invalid credentials' }, 401);
    }

    const token = createAuthToken({ userId: String(user._id), email: user.email });
    const response = jsonResponse({
      user: {
        id: String(user._id),
        email: user.email
      }
    });
    setAuthCookie(response, token);
    return response;
  } catch (error) {
    return jsonResponse({ error: error.message || 'Login failed' }, 500);
  }
}
