import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { GET as getHousehold, PATCH as patchHousehold } from "@/app/api/household/route";
import { GET as getMembers, POST as postInvite, PATCH as patchMember, DELETE as deleteFamilyResource } from "@/app/api/household/members/route";
import { POST as acceptInvite } from "@/app/api/household/invitations/accept/route";

describe("Family Module Remediation & Certification Suite", () => {
  let householdAId: string;
  let householdBId: string;

  let ownerAId: string;
  let memberAId: string;
  let viewerAId: string;

  let ownerBId: string;

  let ownerAToken: string;
  let memberAToken: string;
  let viewerAToken: string;
  let ownerBToken: string;

  beforeEach(async () => {
    // Clear test data
    await prisma.auditEvent.deleteMany({});
    await prisma.householdInvitation.deleteMany({});
    await prisma.householdMember.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.user.deleteMany({});

    // Create Household A
    const householdA = await prisma.household.create({
      data: { name: "Household Alpha", currency: "INR" },
    });
    householdAId = householdA.id;

    // Create Household B
    const householdB = await prisma.household.create({
      data: { name: "Household Beta", currency: "INR" },
    });
    householdBId = householdB.id;

    const pwHash = await hashPassword("Password123!");

    // Users in Household A
    const userOwnerA = await prisma.user.create({
      data: { email: "owner.a@example.com", name: "Owner A", passwordHash: pwHash, isOnboarded: true },
    });
    ownerAId = userOwnerA.id;

    const userMemberA = await prisma.user.create({
      data: { email: "member.a@example.com", name: "Member A", passwordHash: pwHash, isOnboarded: true },
    });
    memberAId = userMemberA.id;

    const userViewerA = await prisma.user.create({
      data: { email: "viewer.a@example.com", name: "Viewer A", passwordHash: pwHash, isOnboarded: true },
    });
    viewerAId = userViewerA.id;

    // User in Household B
    const userOwnerB = await prisma.user.create({
      data: { email: "owner.b@example.com", name: "Owner B", passwordHash: pwHash, isOnboarded: true },
    });
    ownerBId = userOwnerB.id;

    // Memberships
    await prisma.householdMember.createMany({
      data: [
        { householdId: householdAId, userId: ownerAId, role: "OWNER" },
        { householdId: householdAId, userId: memberAId, role: "MEMBER" },
        { householdId: householdAId, userId: viewerAId, role: "VIEWER" },
        { householdId: householdBId, userId: ownerBId, role: "OWNER" },
      ],
    });

    // Session Tokens
    ownerAToken = await createSessionToken({ id: ownerAId, email: "owner.a@example.com", name: "Owner A", householdId: householdAId, role: "OWNER" });
    memberAToken = await createSessionToken({ id: memberAId, email: "member.a@example.com", name: "Member A", householdId: householdAId, role: "MEMBER" });
    viewerAToken = await createSessionToken({ id: viewerAId, email: "viewer.a@example.com", name: "Viewer A", householdId: householdAId, role: "VIEWER" });
    ownerBToken = await createSessionToken({ id: ownerBId, email: "owner.b@example.com", name: "Owner B", householdId: householdBId, role: "OWNER" });
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

  describe("1. Household Information (GET/PATCH /api/household)", () => {
    it("fetches household details for authenticated member", async () => {
      const res = await getHousehold(makeReq("/api/household", "GET", memberAToken));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.household.name).toBe("Household Alpha");
      expect(json.household.currency).toBe("INR");
    });

    it("allows OWNER to update household name", async () => {
      const res = await patchHousehold(makeReq("/api/household", "PATCH", ownerAToken, { name: "Alpha Family Vault" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.household.name).toBe("Alpha Family Vault");

      // Audit check
      const audit = await prisma.auditEvent.findFirst({
        where: { householdId: householdAId, entityType: "HOUSEHOLD", action: "UPDATE" },
      });
      expect(audit).not.toBeNull();
      expect(audit?.toState).toBe("Alpha Family Vault");
    });

    it("rejects non-owner attempts to update household name (403)", async () => {
      const resMember = await patchHousehold(makeReq("/api/household", "PATCH", memberAToken, { name: "Hacked Name" }));
      expect(resMember.status).toBe(403);

      const resViewer = await patchHousehold(makeReq("/api/household", "PATCH", viewerAToken, { name: "Hacked Name" }));
      expect(resViewer.status).toBe(403);
    });

    it("rejects cross-household updates and invalid names", async () => {
      // Owner B trying to update Household A by injecting client householdId -> ignored, session householdId B is updated
      const res = await patchHousehold(makeReq("/api/household", "PATCH", ownerBToken, { name: "Beta Name", householdId: householdAId }));
      expect(res.status).toBe(200);

      // Verify Household A was NOT affected
      const hhA = await prisma.household.findUnique({ where: { id: householdAId } });
      expect(hhA?.name).toBe("Household Alpha");

      // Empty name validation
      const resInvalid = await patchHousehold(makeReq("/api/household", "PATCH", ownerAToken, { name: "   " }));
      expect(resInvalid.status).toBe(400);
    });
  });

  describe("2. Family Invitations & Revocation", () => {
    it("allows OWNER to create invitation and revokes it cleanly", async () => {
      // Create invitation
      const inviteRes = await postInvite(makeReq("/api/household/members", "POST", ownerAToken, { email: "new.cousin@example.com", role: "MEMBER" }));
      expect(inviteRes.status).toBe(201);
      const inviteData = await inviteRes.json();
      const inviteId = inviteData.invitation.id;
      const inviteCode = inviteData.code;

      expect(inviteCode).toBeTruthy();

      // Revoke invitation
      const revokeRes = await deleteFamilyResource(makeReq(`/api/household/members?invitationId=${inviteId}`, "DELETE", ownerAToken));
      expect(revokeRes.status).toBe(200);

      // Verify status is REVOKED in database
      const dbInvite = await prisma.householdInvitation.findUnique({ where: { id: inviteId } });
      expect(dbInvite?.status).toBe("REVOKED");

      // Verify REVOKED invitation cannot be accepted
      const userC = await prisma.user.create({
        data: { email: "new.cousin@example.com", name: "Cousin", passwordHash: "hash", isOnboarded: true },
      });
      await prisma.householdMember.create({
        data: { householdId: householdBId, userId: userC.id, role: "MEMBER" },
      });
      const userCToken = await createSessionToken({ id: userC.id, email: "new.cousin@example.com", name: "Cousin", householdId: householdBId, role: "MEMBER" });

      const acceptRes = await acceptInvite(makeReq("/api/household/invitations/accept", "POST", userCToken, { code: inviteCode }));
      expect(acceptRes.status).toBe(404);
    });

    it("rejects invitation revocation by MEMBER or VIEWER (403)", async () => {
      const invite = await prisma.householdInvitation.create({
        data: { householdId: householdAId, email: "test.invite@example.com", role: "MEMBER", code: "code123", status: "PENDING", expiresAt: new Date(Date.now() + 86400000) },
      });

      const resMember = await deleteFamilyResource(makeReq(`/api/household/members?invitationId=${invite.id}`, "DELETE", memberAToken));
      expect(resMember.status).toBe(403);

      const resViewer = await deleteFamilyResource(makeReq(`/api/household/members?invitationId=${invite.id}`, "DELETE", viewerAToken));
      expect(resViewer.status).toBe(403);
    });

    it("rejects cross-household invitation revocation (404)", async () => {
      const inviteA = await prisma.householdInvitation.create({
        data: { householdId: householdAId, email: "hhA.invite@example.com", role: "MEMBER", code: "codeA", status: "PENDING", expiresAt: new Date(Date.now() + 86400000) },
      });

      // Owner B attempts to revoke Household A's invitation
      const res = await deleteFamilyResource(makeReq(`/api/household/members?invitationId=${inviteA.id}`, "DELETE", ownerBToken));
      expect(res.status).toBe(404);
    });

    it("rejects acceptance of EXPIRED invitation", async () => {
      const userExp = await prisma.user.create({
        data: { email: "expired.user@example.com", name: "Expired User", passwordHash: "hash", isOnboarded: true },
      });
      await prisma.householdMember.create({
        data: { householdId: householdBId, userId: userExp.id, role: "MEMBER" },
      });
      const userExpToken = await createSessionToken({ id: userExp.id, email: "expired.user@example.com", name: "Expired User", householdId: householdBId, role: "MEMBER" });

      const expiredInvite = await prisma.householdInvitation.create({
        data: {
          householdId: householdAId,
          email: "expired.user@example.com",
          role: "MEMBER",
          code: "expiredcode123",
          status: "PENDING",
          expiresAt: new Date(Date.now() - 10000), // Already expired
        },
      });

      const acceptRes = await acceptInvite(makeReq("/api/household/invitations/accept", "POST", userExpToken, { code: expiredInvite.code }));
      expect(acceptRes.status).toBe(404);
    });
  });

  describe("3. Member Role Management & Owner Protection", () => {
    it("allows OWNER to swap MEMBER and VIEWER roles", async () => {
      const targetMember = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId: householdAId, userId: memberAId } },
      });

      // Change MEMBER -> VIEWER
      const patchRes = await patchMember(makeReq("/api/household/members", "PATCH", ownerAToken, { memberId: targetMember?.id, role: "VIEWER" }));
      expect(patchRes.status).toBe(200);

      const dbMember = await prisma.householdMember.findUnique({ where: { id: targetMember?.id } });
      expect(dbMember?.role).toBe("VIEWER");

      // Audit log check
      const audit = await prisma.auditEvent.findFirst({
        where: { householdId: householdAId, entityType: "HOUSEHOLD", action: "UPDATE" },
      });
      expect(audit).not.toBeNull();
    });

    it("rejects promoting any member to OWNER role (400)", async () => {
      const targetMember = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId: householdAId, userId: memberAId } },
      });

      const res = await patchMember(makeReq("/api/household/members", "PATCH", ownerAToken, { memberId: targetMember?.id, role: "OWNER" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("restricted");
    });

    it("prevents demoting an OWNER member (400/403 Owner Protection)", async () => {
      const ownerMember = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId: householdAId, userId: ownerAId } },
      });

      const res = await patchMember(makeReq("/api/household/members", "PATCH", ownerAToken, { memberId: ownerMember?.id, role: "MEMBER" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Owner role cannot be demoted");
    });

    it("rejects role change attempts by MEMBER or VIEWER (403)", async () => {
      const targetMember = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId: householdAId, userId: viewerAId } },
      });

      const resMember = await patchMember(makeReq("/api/household/members", "PATCH", memberAToken, { memberId: targetMember?.id, role: "MEMBER" }));
      expect(resMember.status).toBe(403);
    });
  });

  describe("4. Member Removal & Financial Record Safety", () => {
    it("allows OWNER to remove MEMBER and preserves user financial history", async () => {
      // Create account and transaction for Member A
      const account = await prisma.account.create({
        data: { householdId: householdAId, userId: memberAId, name: "Member Account", balance: 5000 },
      });
      const txn = await prisma.transaction.create({
        data: { householdId: householdAId, accountId: account.id, userId: memberAId, amount: 100, description: "Groceries", type: "EXPENSE" },
      });

      const targetMember = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId: householdAId, userId: memberAId } },
      });

      // Remove member A
      const deleteRes = await deleteFamilyResource(makeReq(`/api/household/members?memberId=${targetMember?.id}`, "DELETE", ownerAToken));
      expect(deleteRes.status).toBe(200);

      // Verify membership record deleted
      const checkMem = await prisma.householdMember.findUnique({ where: { id: targetMember?.id } });
      expect(checkMem).toBeNull();

      // Verify financial history intact
      const checkAcc = await prisma.account.findUnique({ where: { id: account.id } });
      expect(checkAcc).not.toBeNull();
      const checkTxn = await prisma.transaction.findUnique({ where: { id: txn.id } });
      expect(checkTxn).not.toBeNull();
    });

    it("prevents removal of the Household OWNER (400/403)", async () => {
      const ownerMember = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId: householdAId, userId: ownerAId } },
      });

      const res = await deleteFamilyResource(makeReq(`/api/household/members?memberId=${ownerMember?.id}`, "DELETE", ownerAToken));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Owner cannot be removed");
    });

    it("rejects cross-household member deletion (404)", async () => {
      const memberA = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId: householdAId, userId: memberAId } },
      });

      // Owner B attempts to delete Household A member
      const res = await deleteFamilyResource(makeReq(`/api/household/members?memberId=${memberA?.id}`, "DELETE", ownerBToken));
      expect(res.status).toBe(404);
    });
  });

  describe("5. Security, Secrets & Privacy", () => {
    it("never exposes password hashes or session secrets in GET /api/household/members", async () => {
      const res = await getMembers(makeReq("/api/household/members", "GET", ownerAToken));
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.members.length).toBeGreaterThan(0);
      for (const m of json.members) {
        expect(m.user.passwordHash).toBeUndefined();
        expect(m.user.sessionToken).toBeUndefined();
      }
    });
  });
});
