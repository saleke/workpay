import { NextResponse, type NextRequest } from "next/server";

function basicCredentialsMatch(
  header: string | null,
  expectedUser: string,
  expectedPassword: string,
): boolean {
  if (!header) return false;
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return false;

  try {
    const decoded = atob(encoded);
    const separator = decoded.indexOf(":");
    return (
      separator >= 0 &&
      decoded.slice(0, separator) === expectedUser &&
      decoded.slice(separator + 1) === expectedPassword
    );
  } catch {
    return false;
  }
}

const PROTECTED_PREFIXES = [
  "/tasks",
  "/provider",
  "/review",
  "/payments",
  "/activity",
  "/settings",
];
const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/health" || pathname === "/ready") {
    return NextResponse.next();
  }
  if (process.env.TUNNEL_BASIC_AUTH_REQUIRED === "true") {
    const username = process.env.TUNNEL_BASIC_AUTH_USER;
    const password = process.env.TUNNEL_BASIC_AUTH_PASSWORD;
    if (!username || !password) {
      return new NextResponse("Temporary access protection is not configured.", { status: 503 });
    }
    if (!basicCredentialsMatch(req.headers.get("authorization"), username, password)) {
      return new NextResponse("Authentication required.", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="WorkPay test environment", charset="UTF-8"',
        },
      });
    }
  }

  // 1. Skip static assets, internal Next.js routes, and API endpoints
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const sessionToken = req.cookies.get("workpay_session")?.value;
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  // Protected sections require authentication. Unauthenticated visitors are sent to login.
  if (!sessionToken && isProtectedRoute) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
