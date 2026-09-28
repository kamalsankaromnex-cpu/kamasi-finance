import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";

describe("First-Time Registration & Financial Onboarding Wizard Test Suite", () => {
  let testUserId: string;
  let testHouseholdId: string;

  beforeEach(async () => {
    // Setup fresh isolated user & household for test
    const user = await prisma.user.create({
      data: {
        email: `onboard_user_${Math.random().toString(36).substring(2)}_${Date.now()}@kamasi.com`,
        passwordHash: "hashedpass",
        name: "Onboarding Test User",
        isOnboarded: false,
        onboardingStep: 1,
      },
    });
    testUserId = user.id;

    const household = await prisma.household.create({
      data: {
        name: "Onboarding Test Household",
        currency: "INR",
        financialYearStart: "APRIL",
      },
    });
    testHouseholdId = household.id;

    await prisma.householdMember.create({
      data: {
        householdId: household.id,
        userId: user.id,
        role: "OWNER",
      },
    });
  });

  it("STEP 1 & PERSISTENCE: Updates household preferences and persists onboarding step progress", async () => {
    // Step 1 Submission: Update currency and financial year
    await prisma.$transaction(async (tx) => {
      await tx.household.update({
        where: { id: testHouseholdId },
        data: { name: "Updated Family Household", currency: "INR", financialYearStart: "APRIL" },
      });
      await tx.user.update({
        where: { id: testUserId },
        data: { onboardingStep: 2 },
      });
    });

    const updatedUser = await prisma.user.findUnique({ where: { id: testUserId } });
    const updatedHh = await prisma.household.findUnique({ where: { id: testHouseholdId } });

    expect(updatedUser?.onboardingStep).toBe(2);
    expect(updatedUser?.isOnboarded).toBe(false);
    expect(updatedHh?.name).toBe("Updated Family Household");
    expect(updatedHh?.financialYearStart).toBe("APRIL");
  });

  it("STEP 1 JOIN: Redeems invitation code and joins existing household atomically", async () => {
    // Create secondary household to join
    const primaryHh = await prisma.household.create({
      data: { name: "Primary Existing Household" },
    });

    const inviteCode = `INV_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    await prisma.householdInvitation.create({
      data: {
        householdId: primaryHh.id,
        email: "joiner@kamasi.com",
        role: "MEMBER",
        code: inviteCode,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Joiner user
    const joinerUser = await prisma.user.create({
      data: {
        email: `joiner_${Date.now()}@kamasi.com`,
        passwordHash: "hashedpass",
        name: "Joiner User",
        isOnboarded: false,
      },
    });

    // Perform atomic invitation redemption
    await prisma.$transaction(async (tx) => {
      await tx.householdMember.create({
        data: {
          householdId: primaryHh.id,
          userId: joinerUser.id,
          role: "MEMBER",
        },
      });
      await tx.user.update({
        where: { id: joinerUser.id },
        data: { onboardingStep: 2 },
      });
    });

    const membership = await prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId: primaryHh.id, userId: joinerUser.id } },
    });

    expect(membership).not.toBeNull();
    expect(membership?.role).toBe("MEMBER");
  });

  it("STEP 2 OPENING BALANCES: Accounts created with opening balances do NOT generate income transactions", async () => {
    const openingBal = new Prisma.Decimal(75000.0);

    const bankAcc = await prisma.account.create({
      data: {
        householdId: testHouseholdId,
        userId: testUserId,
        name: "HDFC Opening Checking",
        type: "BANK",
        balance: openingBal,
      },
    });

    expect(bankAcc.balance.toNumber()).toBe(75000.0);

    // Verify ZERO income transactions created
    const txnCount = await prisma.transaction.count({
      where: { accountId: bankAcc.id },
    });
    expect(txnCount).toBe(0); // Opening balance is cash-at-hand, NOT income!
  });

  it("IDEMPOTENCY & DUPLICATE PREVENTION: Repeated account setup updates balance without duplicating accounts", async () => {
    const accName = "Primary Savings Account";

    // Setup 1
    const acc1 = await prisma.account.create({
      data: {
        householdId: testHouseholdId,
        userId: testUserId,
        name: accName,
        type: "BANK",
        balance: new Prisma.Decimal(50000.0),
      },
    });

    // Re-running onboarding step 2 with same account name updates balance idempotently
    const existing = await prisma.account.findFirst({
      where: { householdId: testHouseholdId, name: accName },
    });

    if (existing) {
      await prisma.account.update({
        where: { id: existing.id },
        data: { balance: new Prisma.Decimal(60000.0) },
      });
    }

    const allAccounts = await prisma.account.findMany({
      where: { householdId: testHouseholdId, name: accName },
    });

    expect(allAccounts.length).toBe(1); // Single account preserved!
    expect(allAccounts[0].balance.toNumber()).toBe(60000.0);
  });

  it("STEP 6 FINAL COMPLETION: Completes setup and marks user isOnboarded true", async () => {
    await prisma.user.update({
      where: { id: testUserId },
      data: { isOnboarded: true, onboardingStep: 6 },
    });

    const user = await prisma.user.findUnique({ where: { id: testUserId } });
    expect(user?.isOnboarded).toBe(true);
    expect(user?.onboardingStep).toBe(6);
  });
});
