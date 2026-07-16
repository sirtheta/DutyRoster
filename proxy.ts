import { NextRequest, NextResponse } from "next/server";

// Optimistic auth check: read NextAuth session cookie without verifying JWT.
// Full verification happens in Server Components via auth() from lib/auth.ts.
const SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // NextAuth API routes and the token-authenticated iCal feed pass through
  // without the session-cookie redirect.
  const isPublicRoute = pathname.startsWith("/api/auth") || pathname.startsWith("/api/ical");

  if (!isPublicRoute) {
    const isLoggedIn = !!request.cookies.get(SESSION_COOKIE)?.value;
    const isLoginPage = pathname.startsWith("/login");

    if (isLoggedIn && isLoginPage) {
      return NextResponse.redirect(new URL("/calendar", request.url));
    }
    if (!isLoggedIn && !isLoginPage) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
