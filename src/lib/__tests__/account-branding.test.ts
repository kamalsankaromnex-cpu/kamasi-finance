import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { GET as getInstitutions } from "@/app/api/institutions/route";
import { POST as uploadLogo } from "@/app/api/uploads/logos/route";
import { GET as getAccounts, POST as postAccount } from "@/app/api/accounts/route";
import { PUT as putAccount } from "@/app/api/accounts/[id]/route";

describe("Account Branding & Member Identity Enhancement Suite", () => {
  let householdId: string;
  let ownerId: string;
  let memberId: string;
  let ownerToken: string;
  let memberToken: string;
  let institutionHdfcId: string;

  beforeEach(async () => {
    // Clear test data
    await prisma.auditEvent.deleteMany({});
    await prisma.journalEntry.deleteMany({});
    await prisma.journal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.financialInstitution.deleteMany({});
    await prisma.householdMember.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.user.deleteMany({});

    // Create Household
    const hh = await prisma.household.create({
      data: { name: "Branding Test Household", currency: "INR" },
    });
    householdId = hh.id;

    const pwHash = await hashPassword("Password123!");

    // Create Owner & Member
    const ownerUser = await prisma.user.create({
      data: { email: "owner.branding@example.com", name: "Alex Owner", passwordHash: pwHash, isOnboarded: true, avatarUrl: "https://example.com/alex.jpg" },
    });
    ownerId = ownerUser.id;

    const memberUser = await prisma.user.create({
      data: { email: "member.branding@example.com", name: "Priya Member", passwordHash: pwHash, isOnboarded: true, avatarUrl: "https://example.com/priya.jpg" },
    });
    memberId = memberUser.id;

    await prisma.householdMember.createMany({
      data: [
        { householdId, userId: ownerId, role: "OWNER" },
        { householdId, userId: memberId, role: "MEMBER" },
      ],
    });

    ownerToken = await createSessionToken({ id: ownerId, email: "owner.branding@example.com", name: "Alex Owner", householdId, role: "OWNER" });
    memberToken = await createSessionToken({ id: memberId, email: "member.branding@example.com", name: "Priya Member", householdId, role: "MEMBER" });

    // Seed Institution
    const inst = await prisma.financialInstitution.create({
      data: { name: "HDFC Bank", shortCode: "HDFC", logoUrl: "/logos/hdfc.png", isActive: true },
    });
    institutionHdfcId = inst.id;
  });

  const makeReq = (url: string, method: string, token: string, body?: any) => {
    return new Request(`http://localhost:3000${url}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: `kamasi_session=${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  describe("1. Financial Institutions API (GET /api/institutions)", () => {
    it("returns list of active financial institutions sorted by name", async () => {
      const res = await getInstitutions(makeReq("/api/institutions", "GET", ownerToken));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].name).toBe("HDFC Bank");
      expect(data[0].shortCode).toBe("HDFC");
    });
  });

  describe("2. Custom Logo Upload Security (POST /api/uploads/logos)", () => {
    it("rejects unauthenticated logo uploads (401)", async () => {
      const formData = new FormData();
      const blob = new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])], { type: "image/jpeg" });
      formData.append("logo", blob, "test.jpg");

      const req = new Request("http://localhost:3000/api/uploads/logos", {
        method: "POST",
        body: formData,
      });

      const res = await uploadLogo(req);
      expect(res.status).toBe(401);
    });

    it("accepts valid PNG image with magic bytes signature", async () => {
      // PNG Magic Bytes Signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A 0x00 0x00 0x00 0x0D
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      const blob = new Blob([pngHeader], { type: "image/png" });
      const formData = new FormData();
      formData.append("logo", blob, "valid.png");

      const req = new Request("http://localhost:3000/api/uploads/logos", {
        method: "POST",
        headers: { Cookie: `kamasi_session=${ownerToken}` },
        body: formData,
      });

      const res = await uploadLogo(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toContain("/api/uploads/logos/logo_");
      expect(data.type).toBe("image/png");
    });

    it("rejects invalid magic bytes signature (400)", async () => {
      // Executable / Fake TXT magic bytes claiming to be PNG
      const fakeBuffer = Buffer.from("THIS_IS_NOT_AN_IMAGE_FILE");
      const blob = new Blob([fakeBuffer], { type: "image/png" });
      const formData = new FormData();
      formData.append("logo", blob, "fake.png");

      const req = new Request("http://localhost:3000/api/uploads/logos", {
        method: "POST",
        headers: { Cookie: `kamasi_session=${ownerToken}` },
        body: formData,
      });

      const res = await uploadLogo(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("signature verification failed");
    });

    it("rejects files exceeding 2MB size limit (400)", async () => {
      const largeBuffer = Buffer.alloc(2.5 * 1024 * 1024);
      largeBuffer[0] = 0xff; largeBuffer[1] = 0xd8; largeBuffer[2] = 0xff;
      const blob = new Blob([largeBuffer], { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("logo", blob, "large.jpg");

      const req = new Request("http://localhost:3000/api/uploads/logos", {
        method: "POST",
        headers: { Cookie: `kamasi_session=${ownerToken}` },
        body: formData,
      });

      const res = await uploadLogo(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("exceeds maximum allowed limit");
    });
  });

  describe("3. Account Branding Modes & Member Avatars", () => {
    it("creates account with AUTO logoMode and institution link", async () => {
      const res = await postAccount(makeReq("/api/accounts", "POST", ownerToken, {
        name: "HDFC Primary Savings",
        type: "BANK",
        balance: 25000,
        financialInstitutionId: institutionHdfcId,
        logoMode: "AUTO",
        isShared: true,
      }));

      expect(res.status).toBe(201);
      const acc = await res.json();
      expect(acc.financialInstitution.name).toBe("HDFC Bank");
      expect(acc.logoMode).toBe("AUTO");
    });

    it("returns member avatars for shared accounts and isolates personal accounts", async () => {
      // Shared Account
      await postAccount(makeReq("/api/accounts", "POST", ownerToken, {
        name: "Joint Family Wallet",
        type: "CASH",
        balance: 5000,
        isShared: true,
      }));

      // Personal Account
      await postAccount(makeReq("/api/accounts", "POST", ownerToken, {
        name: "Alex Secret Stash",
        type: "CASH",
        balance: 1000,
        isShared: false,
      }));

      const getRes = await getAccounts(makeReq("/api/accounts", "GET", ownerToken));
      expect(getRes.status).toBe(200);
      const accounts = await getRes.json();

      const sharedAcc = accounts.find((a: any) => a.name === "Joint Family Wallet");
      expect(sharedAcc.sharedMembers.length).toBe(2); // Alex & Priya

      const personalAcc = accounts.find((a: any) => a.name === "Alex Secret Stash");
      expect(personalAcc.sharedMembers.length).toBe(1);
      expect(personalAcc.sharedMembers[0].name).toBe("Alex Owner");
    });
  });

  describe("4. Zero Financial Impact Verification", () => {
    it("proves branding updates do NOT alter Account.balance or create journals/transactions", async () => {
      // Create Account with 10,000 opening balance
      const createRes = await postAccount(makeReq("/api/accounts", "POST", ownerToken, {
        name: "Test Vault",
        type: "BANK",
        balance: 10000,
        logoMode: "INITIAL",
      }));
      const createdAcc = await createRes.json();
      const initialBalance = createdAcc.balance;

      const journalCountBefore = await prisma.journal.count({});
      const txnCountBefore = await prisma.transaction.count({});

      // Update Branding Metadata (logoMode, customLogoUrl, iconName, financialInstitutionId)
      const updateRes = await putAccount(
        new Request(`http://localhost:3000/api/accounts/${createdAcc.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: `kamasi_session=${ownerToken}` },
          body: JSON.stringify({
            logoMode: "ICON",
            iconName: "shield",
            financialInstitutionId: institutionHdfcId,
            customLogoUrl: "/api/uploads/logos/logo_test.png",
          }),
        }),
        { params: Promise.resolve({ id: createdAcc.id }) }
      );

      expect(updateRes.status).toBe(200);
      const updatedAcc = await updateRes.json();

      // Verify Account.balance is 100% UNCHANGED
      expect(updatedAcc.balance).toBe(initialBalance);

      // Verify ZERO new journals or transactions created by branding edit
      const journalCountAfter = await prisma.journal.count({});
      const txnCountAfter = await prisma.transaction.count({});

      expect(journalCountAfter).toBe(journalCountBefore);
      expect(txnCountAfter).toBe(txnCountBefore);
    });
  });
});
