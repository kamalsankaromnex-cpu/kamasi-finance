import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

function getJwtSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || new TextEncoder().encode(secret).length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 bytes");
  }
  return new TextEncoder().encode(secret);
}

export interface ActiveProfileContext {
  id: string;
  name: string;
  relationship: string;
  avatarUrl?: string | null;
  color?: string | null;
  isPrimary: boolean;
  isFamilyView?: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  householdId: string;
  role: "OWNER" | "MEMBER" | "VIEWER";
  activeProfileId?: string | null;
  activeProfile?: ActiveProfileContext | null;
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const verified = await jwtVerify(token, getJwtSecretKey());
    return verified.payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function getCurrentSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("kamasi_session")?.value;
  if (!token) return null;
  return await verifySessionToken(token);
}

export async function setSessionCookie(user: SessionUser): Promise<string> {
  const token = await createSessionToken(user);
  try {
    const cookieStore = await cookies();
    cookieStore.set("kamasi_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });
  } catch {
    // Graceful fallback when invoked outside Next.js request context (e.g. tests, scripts)
  }
  return token;
}

export async function removeSessionCookie() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("kamasi_session");
    cookieStore.delete("kamasi_active_profile");
  } catch {
    // Graceful fallback when invoked outside Next.js request context
  }
}

export async function setActiveProfileCookie(profileId: string) {
  try {
    const cookieStore = await cookies();
    cookieStore.set("kamasi_active_profile", profileId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });
  } catch {
    // Fallback outside request context
  }
}

export async function getActiveProfileCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("kamasi_active_profile")?.value || null;
  } catch {
    return null;
  }
}

export async function removeActiveProfileCookie() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("kamasi_active_profile");
  } catch {
    // Fallback outside request context
  }
}
