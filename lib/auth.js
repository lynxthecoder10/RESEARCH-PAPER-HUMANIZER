import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { NextResponse } from 'next/server';

const scrypt = promisify(scryptCallback);

const AUTH_COOKIE = 'academic_suite_auth';
const AUTH_TTL_SECONDS = 60 * 60 * 24 * 7;
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-only-secret';

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signSegment(segment) {
  return createHmac('sha256', AUTH_SECRET).update(segment).digest('base64url');
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${Buffer.from(hash).toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [salt, hashHex] = String(storedHash || '').split(':');
  if (!salt || !hashHex) return false;

  const candidate = await scrypt(password, salt, 64);
  const expected = Buffer.from(hashHex, 'hex');

  if (expected.length !== candidate.length) return false;
  return timingSafeEqual(expected, candidate);
}

export function createAuthToken({ userId, email }) {
  const payload = {
    userId,
    email,
    exp: Math.floor(Date.now() / 1000) + AUTH_TTL_SECONDS
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signSegment(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token) {
  if (!token || !token.includes('.')) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signSegment(encodedPayload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const payload = safeJsonParse(base64UrlDecode(encodedPayload));
  if (!payload || !payload.userId || !payload.email || !payload.exp) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

export function authenticatedUserFromRequest(req) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  return verifyAuthToken(token);
}

export function setAuthCookie(response, token) {
  response.cookies.set({
    name: AUTH_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_TTL_SECONDS
  });
}

export function clearAuthCookie(response) {
  response.cookies.set({
    name: AUTH_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
}

export function jsonResponse(payload, status = 200) {
  return new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export function validateEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  return ok ? normalized : '';
}

export function validatePassword(password) {
  const value = String(password || '');
  return value.length >= 8 ? value : '';
}
