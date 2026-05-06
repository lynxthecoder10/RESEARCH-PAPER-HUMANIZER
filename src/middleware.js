import { NextResponse } from 'next/server';

const AUTH_COOKIE = 'academic_suite_auth';
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-only-secret';

const PUBLIC_PAGE_PATHS = new Set(['/login']);
const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/plagiarism/webhook/'];

function isStaticAsset(pathname) {
  return pathname.startsWith('/_next/') ||
    pathname.startsWith('/assets/') ||
    pathname === '/favicon.ico' ||
    pathname === '/logo.png';
}

function isPublicApi(pathname) {
  return PUBLIC_API_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function decodeBase64Url(value) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded);
  } catch {
    return '';
  }
}

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function isAuthenticated(token) {
  if (!token || !token.includes('.')) return false;

  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) return false;

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(payloadPart));
  } catch {
    return false;
  }

  if (!payload?.userId || !payload?.email || !payload?.exp) return false;
  if (payload.exp < Math.floor(Date.now() / 1000)) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadPart));
  const expected = encodeBase64Url(new Uint8Array(signature));
  return expected === signaturePart;
}

function jsonUnauthorized() {
  return new NextResponse(JSON.stringify({ error: 'Authentication required' }), {
    status: 401,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value || '';
  const authenticated = await isAuthenticated(token);

  if (pathname.startsWith('/api/')) {
    if (isPublicApi(pathname)) return NextResponse.next();
    if (!authenticated) return jsonUnauthorized();
    return NextResponse.next();
  }

  if (PUBLIC_PAGE_PATHS.has(pathname)) {
    if (authenticated) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  if (!authenticated) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*'
};
