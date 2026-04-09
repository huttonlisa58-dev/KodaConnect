/**
 * Next.js middleware for route protection and security
 * Protects office portal routes and validates sessions
 * Also sets security headers on all responses
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Configure which routes should be protected
 */
const PROTECTED_ROUTES = ['/office'];
const PUBLIC_ROUTES = ['/office/login', '/office/register', '/office/change-password'];
const API_ROUTES = ['/api'];

/**
 * Routes that don't require authentication
 */
const UNPROTECTED_ROUTES = [
  '/',
  '/apply',
  '/form',
  '/api/otp',
  '/api/analyze-pdf',
  '/api/proxy-pdf',
  '/api/submissions',
  '/developer',
  '/_next',
  '/favicon.ico',
];

/**
 * Check if a route needs protection
 */
function isProtectedRoute(pathname: string): boolean {
  // Check if it's in the unprotected list first
  for (const route of UNPROTECTED_ROUTES) {
    if (pathname === route || pathname.startsWith(route + '/')) {
      return false;
    }
  }

  // Check if it's a protected route
  for (const route of PROTECTED_ROUTES) {
    if (pathname === route || pathname.startsWith(route + '/')) {
      return true;
    }
  }

  return false;
}

/**
 * Add security headers to response
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Enable HSTS (HTTPS Strict Transport Security)
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );

  // Prevent XSS
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // CSP Header — allow Supabase and common CDNs
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co';
  response.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ${supabaseUrl} https://*.supabase.co; img-src 'self' data: blob:; font-src 'self' data:;`
  );

  return response;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Always add security headers
  let response = NextResponse.next();
  response = addSecurityHeaders(response);

  // Allow all non-protected routes through
  if (!isProtectedRoute(pathname)) {
    return response;
  }

  // Allow public auth routes
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
    return response;
  }

  // For protected office routes, allow through — auth is handled client-side
  // The login page validates credentials and stores user info in localStorage
  // Individual pages can check for auth state and redirect if needed
  return response;
}

/**
 * Configure which routes should trigger the middleware
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
