import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

function getJwtSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || new TextEncoder().encode(secret).length < 32) return null;
  return new TextEncoder().encode(secret);
}

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/cron/recurrence",
  "/api/health",
  "/api/health/ready",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files and public paths
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico" ||
    PUBLIC_PATHS.includes(pathname)
  ) {
    return NextResponse.next();
  }

  // Allow ops endpoints if authorized with configured ops API key
  if (pathname.startsWith("/api/ops/")) {
    const opsKey = request.headers.get("x-ops-api-key");
    const configuredKey = process.env.OPS_API_KEY;
    if (configuredKey && opsKey && opsKey === configuredKey) {
      return NextResponse.next();
    }
  }

  let token = request.cookies.get("kamasi_session")?.value;
  const authHeader = request.headers.get("Authorization");

  if (!token && authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  }

  let isValid = false;
  if (token) {
    try {
      const secret = getJwtSecretKey();
      if (!secret) throw new Error("JWT_SECRET is not configured");
      await jwtVerify(token, secret);
      isValid = true;
    } catch {
      isValid = false;
    }
  }

  if (!isValid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized: Active authentication session required" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
