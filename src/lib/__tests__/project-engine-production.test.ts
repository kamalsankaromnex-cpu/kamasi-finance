import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";
import { ProjectDomainService } from "@/modules/projects/project.service";
import { ProjectPlanningService } from "@/modules/projects/project-planning.service";
import { ProjectPaymentService } from "@/modules/projects/project-payment.service";
import { ProjectQueryService } from "@/modules/projects/project-query.service";
import { ProjectHealthService } from "@/modules/projects/project-health.service";

describe("Kamasi Finance — Universal Project & Financial Planning Engine v2 Certification", () => {
  let householdId: string;
  let userId: string;
  let bankAccountId: string;

  beforeEach(async () => {
    // Clean project tables
    await prisma.projectPaymentAllocation.deleteMany();
    await prisma.projectPaymentRequirement.deleteMany();
    await prisma.projectCostItem.deleteMany();
    await prisma.projectFundingSource.deleteMany();
    await prisma.projectFinancialPlan.deleteMany();
    await prisma.projectTask.deleteMany();
    await prisma.projectMilestone.deleteMany();
    await prisma.projectLifecycleHistory.deleteMany();
    await prisma.project.deleteMany();

    // Clean core
    await prisma.transaction.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.borrowing.deleteMany();
    await prisma.lender.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: {
        email: `project-test-${Date.now()}@kamasi.internal`,
        passwordHash: "hash123",
        name: "Ramesh Sharma",
        isOnboarded: true,
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: {
        name: "Sharma Family Enterprise",
        currency: "INR",
      },
    });
    householdId = household.id;

    await prisma.householdMember.create({
      data: {
        householdId,
        userId,
        role: "OWNER",
      },
    });

    const account = await prisma.account.create({
      data: {
        householdId,
        name: "HDFC Primary Savings",
        type: "SAVINGS",
        balance: new Prisma.Decimal(500000),
      },
    });
    bankAccountId = account.id;
  });

  it("1. Planning operations produce ZERO journal entries and ZERO Account.balance mutations", async () => {
    const balanceBefore = await prisma.account.findUnique({ where: { id: bankAccountId } });
    const journalsBefore = await prisma.journal.count({ where: { householdId } });

    // Create Goat Farm expansion project with initial plan ₹8,00,000
    const project = await ProjectDomainService.createProject(prisma, {
      householdId,
      name: "Goat Farm Expansion",
      description: "Expand goat shelter capacity to 100 animals",
      projectType: "LIVESTOCK",
      priority: "HIGH",
      estimatedTotalCost: 800000,
      userId,
    });

    // Add cost breakdown items
    await ProjectPlanningService.addCostItem(prisma, {
      projectId: project.id,
      householdId,
      name: "Shed Framing & Roof",
      plannedAmount: 350000,
      userId,
    });

    await ProjectPlanningService.addCostItem(prisma, {
      projectId: project.id,
      householdId,
      name: "Fencing & Water Troughs",
      plannedAmount: 150000,
      userId,
    });

    // Add funding channel
    await ProjectPlanningService.addFundingSource(prisma, {
      projectId: project.id,
      householdId,
      sourceType: "OWN_CASH",
      name: "Family Farm Reserves",
      plannedAmount: 500000,
      committedAmount: 500000,
      userId,
    });

    // Add payment commitment
    await ProjectPaymentService.addPaymentRequirement(prisma, {
      projectId: project.id,
      householdId,
      name: "Contractor Advance",
      plannedAmount: 200000,
      committedAmount: 200000,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      userId,
    });

    // Verify ZERO mutations
    const balanceAfter = await prisma.account.findUnique({ where: { id: bankAccountId } });
    const journalsAfter = await prisma.journal.count({ where: { householdId } });

    expect(Number(balanceAfter?.balance)).toBe(Number(balanceBefore?.balance));
    expect(journalsAfter).toBe(journalsBefore);
  });

  it("2. Real-World Scenario: Marriage Project Lifecycle with Plan vs Commitment vs Actual distinction", async () => {
    // Marriage project with ₹15L initial budget
    const marriage = await ProjectDomainService.createProject(prisma, {
      householdId,
      name: "Sister Marriage Ceremony",
      description: "Wedding planning, venue, catering, and jewelry",
      projectType: "MARRIAGE",
      priority: "URGENT",
      estimatedTotalCost: 1500000,
      userId,
    });

    expect(marriage.status).toBe("PLANNED");

    // Add cost item: Venue hall ₹4L
    const venueCost = await ProjectPlanningService.addCostItem(prisma, {
      projectId: marriage.id,
      householdId,
      name: "Wedding Mandap & Hall Booking",
      plannedAmount: 400000,
      userId,
    });

    // Add payment requirement: Venue Advance ₹1.5L committed
    const venuePayment = await ProjectPaymentService.addPaymentRequirement(prisma, {
      projectId: marriage.id,
      householdId,
      costItemId: venueCost.id,
      name: "Venue Advance Payment",
      plannedAmount: 150000,
      committedAmount: 150000,
      dueDate: new Date().toISOString(),
      userId,
    });

    expect(venuePayment.status).toBe("COMMITTED");

    // Post authoritative transaction in core ledger (e.g. ₹1.5L bank transfer)
    const txn = await prisma.transaction.create({
      data: {
        householdId,
        accountId: bankAccountId,
        amount: new Prisma.Decimal(150000),
        type: "EXPENSE",
        status: "POSTED",
        date: new Date(),
        description: "Advance transfer for wedding hall booking",
      },
    });

    // Allocate transaction to payment requirement
    const allocation = await ProjectPaymentService.allocateTransactionToPayment(prisma, {
      projectId: marriage.id,
      householdId,
      paymentRequirementId: venuePayment.id,
      transactionId: txn.id,
      allocatedAmount: 150000,
      userId,
    });

    expect(allocation).toBeDefined();

    // Snapshot check: Paid amount is ₹1.5L, status should be PAID
    const snapshot = await ProjectQueryService.getProjectSnapshot(prisma, householdId, marriage.id);
    expect(snapshot.metrics.actualPaidAmount).toBe(150000);
    expect(snapshot.metrics.committedAmount).toBe(150000);
    expect(snapshot.payments.items[0].status).toBe("PAID");
    expect(snapshot.metrics.remainingPlannedCost).toBe(1350000);
  });

  it("3. Versioned Financial Plans preserve estimation history", async () => {
    // Project: River Water Scheme / Irrigation
    const irrigation = await ProjectDomainService.createProject(prisma, {
      householdId,
      name: "River Water Lift Irrigation Scheme",
      projectType: "AGRICULTURE",
      estimatedTotalCost: 600000,
      userId,
    });

    expect(irrigation.version).toBe(1);

    // Plan revision v2 due to pump capacity upgrade
    const planV2 = await ProjectPlanningService.createPlanVersion(prisma, {
      projectId: irrigation.id,
      householdId,
      estimatedTotalCost: 850000,
      reason: "Scope expansion: Upgraded from 10HP to 25HP solar submerged pump",
      userId,
    });

    expect(planV2.version).toBe(2);
    expect(planV2.planningStatus).toBe("ACTIVE");

    // Verify v1 plan was preserved as SUPERSEDED
    const plans = await prisma.projectFinancialPlan.findMany({
      where: { projectId: irrigation.id },
      orderBy: { version: "asc" },
    });
    expect(plans.length).toBe(2);
    expect(plans[0].version).toBe(1);
    expect(plans[0].planningStatus).toBe("SUPERSEDED");
    expect(plans[1].version).toBe(2);
    expect(plans[1].planningStatus).toBe("ACTIVE");

    const snapshot = await ProjectQueryService.getProjectSnapshot(prisma, householdId, irrigation.id);
    expect(snapshot.project.version).toBe(2);
    expect(snapshot.metrics.estimatedCost).toBe(850000);
  });

  it("4. Multi-Project Funding Claim Conflict Detection", async () => {
    // Bank account balance is ₹5,00,000
    // Project 1: House Construction claims ₹3,50,000
    const house = await ProjectDomainService.createProject(prisma, {
      householdId,
      name: "House Construction Ground Floor",
      projectType: "HOME",
      estimatedTotalCost: 2000000,
      userId,
    });
    await ProjectPlanningService.addFundingSource(prisma, {
      projectId: house.id,
      householdId,
      sourceType: "OWN_CASH",
      name: "HDFC Allocation for Foundation",
      plannedAmount: 350000,
      linkedAccountId: bankAccountId,
      userId,
    });

    // Project 2: Machinery Purchase claims ₹3,00,000 (Total claimed ₹6.5L > ₹5L balance)
    const machinery = await ProjectDomainService.createProject(prisma, {
      householdId,
      name: "Tractor & Implement Purchase",
      projectType: "BUSINESS",
      estimatedTotalCost: 900000,
      userId,
    });
    await ProjectPlanningService.addFundingSource(prisma, {
      projectId: machinery.id,
      householdId,
      sourceType: "OWN_CASH",
      name: "HDFC Downpayment",
      plannedAmount: 300000,
      linkedAccountId: bankAccountId,
      userId,
    });

    const conflicts = await ProjectQueryService.checkFundingConflicts(prisma, householdId);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].accountId).toBe(bankAccountId);
    expect(conflicts[0].availableBalance).toBe(500000);
    expect(conflicts[0].totalClaimed).toBe(650000);
    expect(conflicts[0].overAllocatedAmount).toBe(150000);
  });

  it("5. Deterministic Health Evaluation rules", async () => {
    // Overdue payment triggers PAYMENT_OVERDUE
    const overdueHealth = ProjectHealthService.evaluateHealth({
      estimatedCost: 500000,
      budgetedAmount: 500000,
      committedAmount: 200000,
      actualPaidAmount: 50000,
      securedFunding: 500000,
      plannedFunding: 500000,
      fundingGap: 0,
      overduePaymentsCount: 1,
      dueSoonPaymentsCount: 0,
      blockedTasksCount: 0,
      isProjectCompleted: false,
    });
    expect(overdueHealth.status).toBe("PAYMENT_OVERDUE");

    // Funding gap triggers FUNDING_GAP
    const gapHealth = ProjectHealthService.evaluateHealth({
      estimatedCost: 1000000,
      budgetedAmount: 1000000,
      committedAmount: 200000,
      actualPaidAmount: 100000,
      securedFunding: 400000,
      plannedFunding: 1000000,
      fundingGap: 600000,
      overduePaymentsCount: 0,
      dueSoonPaymentsCount: 0,
      blockedTasksCount: 0,
      isProjectCompleted: false,
    });
    expect(gapHealth.status).toBe("FUNDING_GAP");

    // All clear triggers ON_TRACK
    const onTrackHealth = ProjectHealthService.evaluateHealth({
      estimatedCost: 500000,
      budgetedAmount: 500000,
      committedAmount: 200000,
      actualPaidAmount: 200000,
      securedFunding: 500000,
      plannedFunding: 500000,
      fundingGap: 0,
      overduePaymentsCount: 0,
      dueSoonPaymentsCount: 0,
      blockedTasksCount: 0,
      isProjectCompleted: false,
    });
    expect(onTrackHealth.status).toBe("ON_TRACK");
  });

  it("6. Strict Household Isolation and cross-tenant protection", async () => {
    // Create household 2
    const h2 = await prisma.household.create({
      data: { name: "Other Household", currency: "INR" },
    });

    const project1 = await ProjectDomainService.createProject(prisma, {
      householdId,
      name: "Household 1 Project",
      userId,
    });

    // Attempt to access project1 with household 2 ID must fail
    await expect(
      ProjectQueryService.getProjectSnapshot(prisma, h2.id, project1.id)
    ).rejects.toThrow(/Project not found in this household/);

    // Attempt to update project1 from household 2 must fail
    await expect(
      ProjectDomainService.updateProject(prisma, {
        projectId: project1.id,
        householdId: h2.id,
        name: "Hacked Project",
        userId,
      })
    ).rejects.toThrow(/Project not found in this household/);
  });
});
