import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/tasks", "/provider", "/review", "/payments"];
const AUTH_ROUTES = ["/login", "/register"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Skip static assets, internal Next.js routes, and API endpoints
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Check if the app is in Production Mode
  const envDemo = process.env.NEXT_PUBLIC_DEMO_MODE !== "false" && process.env.WORKPAY_MODE !== "production";
  const override = req.cookies.get("workpay_mode_override")?.value;
  const isProduction = !envDemo || override === "production";

  // In Demo Mode (default), allow unrestricted evaluator access
  if (!isProduction) {
    return NextResponse.next();
  }

  // 3. In Production Mode: check for session cookie
  const sessionToken = req.cookies.get("workpay_session")?.value;
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  // If logged in and visiting login/register, redirect to dashboard
  if (sessionToken && isAuthRoute) {
    return NextResponse.redirect(new URL("/tasks", req.url));
  }

  // If unauthenticated and visiting a protected route, redirect to login
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
