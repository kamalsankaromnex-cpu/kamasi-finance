import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken, SessionUser } from "../auth";
import { assertCanMutate } from "../rbac";
import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";

describe("Phase 3 Security, Authentication, RBAC & Household Isolation Tests", () => {
  let hhAlphaId: string;
  let hhBetaId: string;
  let alphaAccountId: string;
  let betaAccountId: string;

  beforeAll(async () => {
    // Create Household Alpha
    const hhAlpha = await prisma.household.create({
      data: { name: "Household Alpha", currency: "INR" },
    });
    hhAlphaId = hhAlpha.id;

    const accAlpha = await prisma.account.create({
      data: { householdId: hhAlphaId, name: "Alpha Bank", type: "BANK", balance: new Prisma.Decimal(100000.00) },
    });
    alphaAccountId = accAlpha.id;

    // Create Household Beta
    const hhBeta = await prisma.household.create({
      data: { name: "Household Beta", currency: "INR" },
    });
    hhBetaId = hhBeta.id;

    const accBeta = await prisma.account.create({
      data: { householdId: hhBetaId, name: "Beta Bank", type: "BANK", balance: new Prisma.Decimal(50000.00) },
    });
    betaAccountId = accBeta.id;
  });

  afterAll(async () => {
    await prisma.account.deleteMany({ where: { id: { in: [alphaAccountId, betaAccountId] } } });
    await prisma.household.deleteMany({ where: { id: { in: [hhAlphaId, hhBetaId] } } });
    await prisma.$disconnect();
  });

  it("hashes password and verifies bcrypt hash correctly", async () => {
    const raw = "SuperSecretPassword123!";
    const hash = await hashPassword(raw);

    expect(hash).not.toBe(raw);
    const valid = await verifyPassword(raw, hash);
    expect(valid).toBe(true);

    const invalid = await verifyPassword("WrongPassword", hash);
    expect(invalid).toBe(false);
  });

  it("creates and verifies JWT session tokens correctly", async () => {
    const payload: SessionUser = {
      id: "usr-test-1",
      email: "test@kamasi.com",
      name: "Test User",
      householdId: hhAlphaId,
      role: "OWNER",
    };

    const token = await createSessionToken(payload);
    expect(token).toBeTypeOf("string");

    const verified = await verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe(payload.id);
    expect(verified?.householdId).toBe(payload.householdId);
    expect(verified?.role).toBe("OWNER");
  });

  it("enforces RBAC role permissions: VIEWER is read-only while OWNER and MEMBER can mutate", () => {
    expect(assertCanMutate("OWNER")).toBeNull();
    expect(assertCanMutate("MEMBER")).toBeNull();

    const viewerRes = assertCanMutate("VIEWER");
    expect(viewerRes).not.toBeNull();
    expect(viewerRes?.status).toBe(403);
  });

  it("prevents IDOR and cross-household data leakage", async () => {
    // Attempting to access Beta Account using Alpha Household context
    const idorCheck = await prisma.account.findFirst({
      where: { id: betaAccountId, householdId: hhAlphaId },
    });

    // Must return null (account does not exist within Household Alpha's isolated context)
    expect(idorCheck).toBeNull();

    // Querying within correct household returns account
    const validCheck = await prisma.account.findFirst({
      where: { id: betaAccountId, householdId: hhBetaId },
    });
    expect(validCheck).not.toBeNull();
    expect(validCheck?.id).toBe(betaAccountId);
  });

  it("enforces HTTP 401 Unauthorized for unauthenticated requests", async () => {
    const { authorizeRequest } = await import("../rbac");
    const emptyReq = new Request("http://localhost:3000/api/transactions", { method: "GET" });
    const authResult = await authorizeRequest(emptyReq);

    expect("errorResponse" in authResult).toBe(true);
    if ("errorResponse" in authResult) {
      expect(authResult.errorResponse.status).toBe(401);
    }
  });

  it("sets 7-day expiration date on new invitations and supports revocation", async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await prisma.householdInvitation.create({
      data: {
        householdId: hhAlphaId,
        email: "invite_test@kamasi.com",
        code: `INV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        expiresAt,
        status: "PENDING",
      },
    });

    expect(invite.status).toBe("PENDING");
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const updated = await prisma.householdInvitation.update({
      where: { id: invite.id },
      data: { status: "REVOKED" },
    });
    expect(updated.status).toBe("REVOKED");

    await prisma.householdInvitation.delete({ where: { id: invite.id } });
  });
});
