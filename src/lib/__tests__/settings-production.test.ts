import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { hashPassword } from "@/lib/auth";
import { NextRequest } from "next/server";
import { PATCH as patchProfile } from "@/app/api/user/profile/route";
import { POST as postChangePassword } from "@/app/api/auth/change-password/route";
import { GET as getExportData } from "@/app/api/user/export-data/route";
import { createSessionToken } from "@/lib/auth";

describe("Settings Remediation & Specification Suite", () => {
  let userId: string;
  let householdId: string;
  let cookieHeader: string;
  const initialPassword = "initialPassword123";

  beforeEach(async () => {
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await hashPassword(initialPassword);
    const user = await prisma.user.create({
      data: {
        email: `settings-${Date.now()}@kamasi.test`,
        passwordHash,
        name: "Initial Name",
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: {
        name: "Settings Test Household",
        currency: "INR",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    householdId = household.id;

    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      householdId: household.id,
      role: "OWNER",
    });
    cookieHeader = `kamasi_session=${token}`;
  });

  describe("1. Profile Persistence Endpoint (PATCH /api/user/profile)", () => {
    it("updates User.name in database and returns 200 OK", async () => {
      const req = new NextRequest("http://localhost:3000/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader,
        },
        body: JSON.stringify({ name: "Updated Name" }),
      });

      const res = await patchProfile(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.user.name).toBe("Updated Name");

      const dbUser = await prisma.user.findUnique({ where: { id: userId } });
      expect(dbUser?.name).toBe("Updated Name");
    });

    it("rejects empty name with 400 Bad Request", async () => {
      const req = new NextRequest("http://localhost:3000/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader,
        },
        body: JSON.stringify({ name: "   " }),
      });

      const res = await patchProfile(req);
      expect(res.status).toBe(400);
    });

    it("rejects unauthenticated request with 401 Unauthorized", async () => {
      const req = new NextRequest("http://localhost:3000/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Attempted Name" }),
      });

      const res = await patchProfile(req);
      expect(res.status).toBe(401);
    });
  });

  describe("2. Password Change Endpoint (POST /api/auth/change-password)", () => {
    it("validates current password and updates bcrypt hash in database", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader,
        },
        body: JSON.stringify({
          currentPassword: initialPassword,
          newPassword: "brandNewSecurePassword456",
        }),
      });

      const res = await postChangePassword(req);
      expect(res.status).toBe(200);

      const dbUser = await prisma.user.findUnique({ where: { id: userId } });
      expect(dbUser?.passwordHash).not.toBeNull();

      const bcrypt = require("bcryptjs");
      const isValidNew = await bcrypt.compare("brandNewSecurePassword456", dbUser?.passwordHash);
      expect(isValidNew).toBe(true);
    });

    it("rejects invalid current password with 400 Bad Request", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader,
        },
        body: JSON.stringify({
          currentPassword: "wrongPassword",
          newPassword: "brandNewSecurePassword456",
        }),
      });

      const res = await postChangePassword(req);
      expect(res.status).toBe(400);
    });

    it("rejects new password under 8 characters with 400 Bad Request", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader,
        },
        body: JSON.stringify({
          currentPassword: initialPassword,
          newPassword: "short",
        }),
      });

      const res = await postChangePassword(req);
      expect(res.status).toBe(400);
    });
  });

  describe("3. Data Export Endpoint (GET /api/user/export-data)", () => {
    it("returns structured household JSON download", async () => {
      const req = new NextRequest("http://localhost:3000/api/user/export-data", {
        method: "GET",
        headers: { Cookie: cookieHeader },
      });

      const res = await getExportData(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.user.id).toBe(userId);
      expect(json.household.id).toBe(householdId);
      expect(json.accounts).toBeDefined();
    });

    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const req = new NextRequest("http://localhost:3000/api/user/export-data", {
        method: "GET",
      });

      const res = await getExportData(req);
      expect(res.status).toBe(401);
    });

    it("strictly isolates exported data between households", async () => {
      // Create separate household B with its own account
      const otherUser = await prisma.user.create({
        data: {
          email: `other-user-${Date.now()}@kamasi.test`,
          passwordHash: await hashPassword("password123"),
          name: "Other Household User",
        },
      });
      const otherHousehold = await prisma.household.create({
        data: {
          name: "Other Household",
          members: { create: { userId: otherUser.id, role: "OWNER" } },
        },
      });
      const otherAccount = await prisma.account.create({
        data: {
          name: "Secret Account B",
          type: "SAVINGS",
          currency: "INR",
          balance: 999999,
          householdId: otherHousehold.id,
        },
      });

      // Request export as user A
      const req = new NextRequest("http://localhost:3000/api/user/export-data", {
        method: "GET",
        headers: { Cookie: cookieHeader },
      });

      const res = await getExportData(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      // Ensure no account from household B is returned in household A's export
      expect(json.household.id).toBe(householdId);
      const foundOtherAccount = json.accounts.some((a: any) => a.id === otherAccount.id);
      expect(foundOtherAccount).toBe(false);
    });
  });

  describe("4. RBAC Roles Enforcement Across Settings", () => {
    it("allows MEMBER role to update their own profile and change their password", async () => {
      const memberUser = await prisma.user.create({
        data: {
          email: `member-${Date.now()}@kamasi.test`,
          passwordHash: await hashPassword(initialPassword),
          name: "Member Name",
        },
      });
      await prisma.householdMember.create({
        data: {
          householdId,
          userId: memberUser.id,
          role: "MEMBER",
        },
      });

      const memberToken = await createSessionToken({
        id: memberUser.id,
        email: memberUser.email,
        name: memberUser.name,
        householdId,
        role: "MEMBER",
      });

      // Profile Update
      const reqProfile = new NextRequest("http://localhost:3000/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `kamasi_session=${memberToken}`,
        },
        body: JSON.stringify({ name: "Updated Member Name" }),
      });
      const resProfile = await patchProfile(reqProfile);
      expect(resProfile.status).toBe(200);

      // Password Change
      const reqPw = new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `kamasi_session=${memberToken}`,
        },
        body: JSON.stringify({
          currentPassword: initialPassword,
          newPassword: "memberNewSecurePass123",
        }),
      });
      const resPw = await postChangePassword(reqPw);
      expect(resPw.status).toBe(200);
    });

    it("allows VIEWER role to update their own personal profile and credentials", async () => {
      const viewerUser = await prisma.user.create({
        data: {
          email: `viewer-${Date.now()}@kamasi.test`,
          passwordHash: await hashPassword(initialPassword),
          name: "Viewer Name",
        },
      });
      await prisma.householdMember.create({
        data: {
          householdId,
          userId: viewerUser.id,
          role: "VIEWER",
        },
      });

      const viewerToken = await createSessionToken({
        id: viewerUser.id,
        email: viewerUser.email,
        name: viewerUser.name,
        householdId,
        role: "VIEWER",
      });

      const reqProfile = new NextRequest("http://localhost:3000/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `kamasi_session=${viewerToken}`,
        },
        body: JSON.stringify({ name: "Updated Viewer Name" }),
      });
      const resProfile = await patchProfile(reqProfile);
      expect(resProfile.status).toBe(200);
    });
  });
});
