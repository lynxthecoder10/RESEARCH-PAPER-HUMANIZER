import dbConnect from '@/../lib/db.js';
import User from '@/../models/User.js';
import {
  createAuthToken,
  hashPassword,
  jsonResponse,
  setAuthCookie,
  validateEmail,
  validatePassword
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

    const exists = await User.findOne({ email }).lean();
    if (exists) {
      return jsonResponse({ error: 'Email already registered' }, 409);
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({ email, passwordHash });
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
    return jsonResponse({ error: error.message || 'Registration failed' }, 500);
  }
}
