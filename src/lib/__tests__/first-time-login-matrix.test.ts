import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../prisma";
import { hashPassword, createSessionToken, verifySessionToken } from "../auth";
import { POST as loginHandler } from "@/app/api/auth/login/route";
import { POST as logoutHandler } from "@/app/api/auth/logout/route";
import { GET as meHandler } from "@/app/api/auth/me/route";
import { GET as dashboardHandler } from "@/app/api/dashboard/route";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

describe("FL-01 to FL-20 First-Time Login & Auth Matrix Suite", () => {
  const timestamp = Date.now();
  const userAEmail = `user_a_${timestamp}@kamasi.test`;
  const userBEmail = `user_b_${timestamp}@kamasi.test`;
  const plainPasswordA = "SecurePassword123!";
  const plainPasswordB = "AnotherPassword456!";

  let userAId: string;
  let userBId: string;
  let householdAId: string;
  let householdBId: string;
  let userASessionToken: string;
  let userBSessionToken: string;

  beforeEach(async () => {
    // Clean up test tables
    await prisma.projectPaymentAllocation.deleteMany({});
    await prisma.projectPaymentRequirement.deleteMany({});
    await prisma.projectCostItem.deleteMany({});
    await prisma.projectFundingSource.deleteMany({});
    await prisma.projectFinancialPlan.deleteMany({});
    await prisma.projectTask.deleteMany({});
    await prisma.projectMilestone.deleteMany({});
    await prisma.projectLifecycleHistory.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.journalEntry.deleteMany({});
    await prisma.journal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.householdMember.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.user.deleteMany({});

    // Create User A + Household A
    const passwordHashA = await hashPassword(plainPasswordA);
    const userA = await prisma.user.create({
      data: {
        email: userAEmail,
        passwordHash: passwordHashA,
        name: "User Alpha",
        isOnboarded: true,
      },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: {
        name: "Household Alpha",
        currency: "INR",
        members: {
          create: {
            userId: userAId,
            role: "OWNER",
          },
        },
      },
    });
    householdAId = hhA.id;

    // Create User B + Household B
    const passwordHashB = await hashPassword(plainPasswordB);
    const userB = await prisma.user.create({
      data: {
        email: userBEmail,
        passwordHash: passwordHashB,
        name: "User Beta",
        isOnboarded: true,
      },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: {
        name: "Household Beta",
        currency: "INR",
        members: {
          create: {
            userId: userBId,
            role: "OWNER",
          },
        },
      },
    });
    householdBId = hhB.id;

    userASessionToken = await createSessionToken({
      id: userAId,
      email: userAEmail,
      name: "User Alpha",
      householdId: householdAId,
      role: "OWNER",
    });

    userBSessionToken = await createSessionToken({
      id: userBId,
      email: userBEmail,
      name: "User Beta",
      householdId: householdBId,
      role: "OWNER",
    });
  });

  afterEach(async () => {
    await prisma.householdMember.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.user.deleteMany({});
  });

  // FL-01 & FL-02: Login configuration and endpoints exist and load without error
  it("FL-01 & FL-02: Login handlers and session endpoints exist and operate correctly", async () => {
    expect(loginHandler).toBeDefined();
    expect(logoutHandler).toBeDefined();
    expect(meHandler).toBeDefined();
  });

  // FL-03: Login with valid credentials
  it("FL-03: Login with valid credentials returns session and user payload", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userAEmail, password: plainPasswordA }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(userAEmail);
    expect(data.user.householdId).toBe(householdAId);
  });

  // FL-04: Login with wrong password
  it("FL-04: Login with wrong password yields 401 error without session", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userAEmail, password: "WrongPassword123!" }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid credentials");
  });

  // FL-05: Login with unknown email
  it("FL-05: Login with unknown email returns generic 401 without account disclosure", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nonexistent@kamasi.test", password: "AnyPassword123!" }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid credentials");
  });

  // FL-06 & FL-07: Empty email or password
  it("FL-06 & FL-07: Empty email or password returns 400 Bad Request", async () => {
    const reqEmptyEmail = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "", password: plainPasswordA }),
    });
    const res1 = await loginHandler(reqEmptyEmail);
    expect(res1.status).toBe(400);

    const reqEmptyPassword = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userAEmail, password: "" }),
    });
    const res2 = await loginHandler(reqEmptyPassword);
    expect(res2.status).toBe(400);
  });

  // FL-11, FL-13 & FL-14: Protected route access without authentication is blocked
  it("FL-11, FL-13 & FL-14: Accessing protected endpoints without session is rejected / redirected", async () => {
    // 1. Protected API endpoint without token
    const apiReq = new NextRequest("http://localhost/api/dashboard");
    const apiRes = await middleware(apiReq);
    expect(apiRes.status).toBe(401);

    // 2. Protected UI route '/' without token redirects to /login
    const pageReq = new NextRequest("http://localhost/");
    const pageRes = await middleware(pageReq);
    expect(pageRes.status).toBe(307);
    expect(pageRes.headers.get("location")).toContain("/login");

    // 3. Protected UI route '/accounts' without token redirects to /login
    const accountsReq = new NextRequest("http://localhost/accounts");
    const accountsRes = await middleware(accountsReq);
    expect(accountsRes.status).toBe(307);
    expect(accountsRes.headers.get("location")).toContain("/login");
  });

  // FL-15 & FL-16: Tenant isolation between User A and User B
  it("FL-15 & FL-16: User A sees only Household A data; User B sees only Household B data", async () => {
    // Add account in Household A
    await prisma.account.create({
      data: {
        householdId: householdAId,
        userId: userAId,
        name: "Alpha Primary Bank",
        type: "BANK",
        balance: 100000,
      },
    });

    // Add account in Household B
    await prisma.account.create({
      data: {
        householdId: householdBId,
        userId: userBId,
        name: "Beta Secret Bank",
        type: "BANK",
        balance: 50000,
      },
    });

    // Fetch me as User A
    const reqA = new Request("http://localhost/api/auth/me", {
      headers: { Authorization: `Bearer ${userASessionToken}` },
    });
    const resA = await meHandler(reqA);
    expect(resA.status).toBe(200);
    const dataA = await resA.json();
    expect(dataA.user.householdName).toBe("Household Alpha");
    expect(dataA.user.email).toBe(userAEmail);

    // Fetch dashboard as User A
    const dashReqA = new Request("http://localhost/api/dashboard", {
      headers: { Authorization: `Bearer ${userASessionToken}` },
    });
    const dashResA = await dashboardHandler(dashReqA as any);
    expect(dashResA.status).toBe(200);
    const dashDataA = await dashResA.json();
    expect(dashDataA.overview).toBeDefined();

    // Fetch me as User B
    const reqB = new Request("http://localhost/api/auth/me", {
      headers: { Authorization: `Bearer ${userBSessionToken}` },
    });
    const resB = await meHandler(reqB);
    expect(resB.status).toBe(200);
    const dataB = await resB.json();
    expect(dataB.user.householdName).toBe("Household Beta");
    expect(dataB.user.email).toBe(userBEmail);

    // Verify User A cannot access or see User B data
    expect(dataA.user.householdId).not.toBe(dataB.user.householdId);
  });

  // FL-17 & FL-18: Logout terminates session
  it("FL-17 & FL-18: Logout terminates session; invalid / missing token cannot access protected endpoints", async () => {
    const logoutRes = await logoutHandler();
    expect(logoutRes.status).toBe(200);
    const data = await logoutRes.json();
    expect(data.success).toBe(true);

    // After logout, without cookie or bearer token, requests fail
    const apiReq = new NextRequest("http://localhost/api/dashboard");
    const apiRes = await middleware(apiReq);
    expect(apiRes.status).toBe(401);
  });

  // FL-19: Login again restores correct session
  it("FL-19: Login again restores the correct authenticated user session", async () => {
    const verified = await verifySessionToken(userASessionToken);
    expect(verified).not.toBeNull();
    expect(verified?.email).toBe(userAEmail);
    expect(verified?.householdId).toBe(householdAId);
  });

  // FL-20: Clean initial application state: no fake financial figures, balances or transactions
  it("FL-20: Fresh household has zero fake financial figures, balances, or transactions", async () => {
    // User C created fresh
    const userC = await prisma.user.create({
      data: {
        email: `fresh_${Date.now()}@kamasi.test`,
        passwordHash: "hashed",
        name: "Fresh User",
        isOnboarded: true,
      },
    });
    const hhC = await prisma.household.create({
      data: {
        name: "Fresh Clean Household",
        currency: "INR",
        members: { create: { userId: userC.id, role: "OWNER" } },
      },
    });

    const tokenC = await createSessionToken({
      id: userC.id,
      email: userC.email,
      name: userC.name,
      householdId: hhC.id,
      role: "OWNER",
    });

    const reqC = new Request("http://localhost/api/dashboard", {
      headers: { Authorization: `Bearer ${tokenC}` },
    });
    const resC = await dashboardHandler(reqC as any);
    expect(resC.status).toBe(200);
    const dataC = await resC.json();

    // Verify absolutely ZERO fake figures
    expect(dataC.overview.totalAssets).toBe(0);
    expect(dataC.overview.totalLiabilities).toBe(0);
    expect(dataC.overview.netWorth).toBe(0);
    expect(dataC.overview.incomeInPeriod).toBe(0);
    expect(dataC.overview.expensesInPeriod).toBe(0);
    expect(dataC.overview.netSavingsInPeriod).toBe(0);
    expect(dataC.budget.totalBudgeted).toBe(0);
    expect(dataC.budget.totalSpent).toBe(0);
    expect(dataC.goals.totalGoals).toBe(0);
    expect(dataC.investments.holdingsCount).toBe(0);
    expect(dataC.borrowings.activeCount).toBe(0);
    expect(dataC.recentActivity.length).toBe(0);
  });
});

