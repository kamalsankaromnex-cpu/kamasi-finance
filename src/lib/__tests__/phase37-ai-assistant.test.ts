import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { AIFinancialAssistantService } from "@/finance/ai/ai-assistant.service";
import { FinancialQueryEngine } from "@/finance/ai/query-engine";
import { FinancialCommand } from "@/finance/financial-command";
import { FinancialForecastingService } from "@/finance/forecasting/forecasting.service";

describe("Phase 3.7 — AI Financial Assistant Engine Suite", () => {
  let householdId: string;
  let userId: string;
  let bankAccountId: string;

  beforeEach(async () => {
    // Clean database before test
    await prisma.forecastSnapshot.deleteMany();
    await prisma.forecastMilestone.deleteMany();
    await prisma.forecastScenario.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.incomeOccurrence.deleteMany();
    await prisma.incomeSource.deleteMany();
    await prisma.recurringTransaction.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.liability.deleteMany();
    await prisma.investment.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.user.deleteMany();
    await prisma.household.deleteMany();

    const user = await prisma.user.create({
      data: {
        email: "ai-admin@kamasi.test",
        passwordHash: "hash123",
        name: "AI Admin",
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: { name: "AI Household", currency: "INR" },
    });
    householdId = household.id;

    await prisma.householdMember.create({
      data: { householdId, userId, role: "OWNER" },
    });

    const account = await prisma.account.create({
      data: {
        householdId,
        name: "Primary Bank Account",
        type: "BANK",
        balance: 100000.0,
      },
    });
    bankAccountId = account.id;
  });

  afterEach(async () => {
    // Clean up
  });

  it("1. Numerical Accuracy & Traceability: AI query answers match reporting truth 100%", async () => {
    // Post ₹12,000 grocery expense
    await prisma.transaction.create({
      data: {
        householdId,
        accountId: bankAccountId,
        amount: new Prisma.Decimal(12000),
        description: "Groceries",
        type: "EXPENSE",
        status: "POSTED",
        date: new Date(),
      },
    });

    const response = await AIFinancialAssistantService.processQuery(householdId, "Where did my money go this month?");

    expect(response.sourceQueryIds.length).toBeGreaterThan(0);
    expect(response.facts.some((f) => f.label === "Total Expenses" && f.value === 12000)).toBe(true);
    expect(response.answer).toContain("12,000");
  });

  it("2. Forecast Accuracy: AI simulation answers match Phase 3.6 forecasting engine", async () => {
    await prisma.incomeSource.create({
      data: { householdId, name: "Base Salary", expectedAmount: 100000, frequency: "MONTHLY" },
    });

    const response = await AIFinancialAssistantService.processQuery(
      householdId,
      "What if my salary increases 8%?"
    );

    expect(response.sourceQueryIds.length).toBeGreaterThan(0);
    expect(response.facts.some((f) => f.label === "Simulated Salary Growth" && f.value === "8%")).toBe(true);

    const directForecast = await FinancialQueryEngine.runScenarioSimulation(householdId, { salaryGrowth: 8 });
    const factNW = response.facts.find((f) => f.label === "Projected 12-Month Net Worth")?.value;
    expect(factNW).toBe(directForecast.data.projectedEndingNetWorth);
  });

  it("3. Hard Immutability Gate: Query processing performs 0 database mutations", async () => {
    await prisma.transaction.create({
      data: {
        householdId,
        accountId: bankAccountId,
        amount: new Prisma.Decimal(5000),
        description: "Utilities",
        type: "EXPENSE",
        status: "POSTED",
        date: new Date(),
      },
    });

    const isImmutable = await FinancialForecastingService.assertLedgerImmutability(householdId, async () => {
      await AIFinancialAssistantService.processQuery(householdId, "Explain my net worth");
      await AIFinancialAssistantService.processQuery(householdId, "Show my liabilities");
      await AIFinancialAssistantService.processQuery(householdId, "Where did my money go?");
    });

    expect(isImmutable).toBe(true);
  });

  it("4. Action Proposal Generation & Parameter Hash Binding", async () => {
    const params = {
      accountId: bankAccountId,
      amount: 4500,
      description: "Office Supplies",
      currency: "INR",
    };

    const proposal = await AIFinancialAssistantService.proposeAction(
      householdId,
      userId,
      "RECORD_EXPENSE",
      params
    );

    expect(proposal.id).toBeDefined();
    expect(proposal.status).toBe("PENDING");
    expect(proposal.parametersHash).toBe(AIFinancialAssistantService.hashParameters(params));

    // Confirm and execute with matching hash
    const execResult = await AIFinancialAssistantService.confirmAndExecuteAction(
      householdId,
      userId,
      proposal.id,
      proposal.parametersHash
    );

    expect(execResult.success).toBe(true);
    expect(execResult.proposal.status).toBe("EXECUTED");

    // Verify balance updated via single FinancialCommand dispatch (₹100,000 - ₹4,500 = ₹95,500)
    const updatedAccount = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(updatedAccount?.balance)).toBe(95500.0);
  });

  it("5. Parameter Hash Mismatch Security Rejection", async () => {
    const params = {
      accountId: bankAccountId,
      amount: 1000,
      description: "Coffee",
    };

    const proposal = await AIFinancialAssistantService.proposeAction(
      householdId,
      userId,
      "RECORD_EXPENSE",
      params
    );

    // Attempt execution with tampered hash
    const fakeHash = "tampered_hash_123456";

    await expect(
      AIFinancialAssistantService.confirmAndExecuteAction(
        householdId,
        userId,
        proposal.id,
        fakeHash
      )
    ).rejects.toThrow("Parameter hash mismatch");

    const updatedProposal = AIFinancialAssistantService.getProposal(proposal.id);
    expect(updatedProposal?.status).toBe("FAILED");
  });

  it("6. Expired Action Proposal Rejection", async () => {
    const params = { accountId: bankAccountId, amount: 500, description: "Snacks" };
    const proposal = await AIFinancialAssistantService.proposeAction(
      householdId,
      userId,
      "RECORD_EXPENSE",
      params
    );

    // Force expiration date into the past
    proposal.expiresAt = new Date(Date.now() - 1000).toISOString();

    await expect(
      AIFinancialAssistantService.confirmAndExecuteAction(
        householdId,
        userId,
        proposal.id,
        proposal.parametersHash
      )
    ).rejects.toThrow("has EXPIRED");

    expect(proposal.status).toBe("EXPIRED");
  });

  it("7. Action Execution Idempotency Gate (Network Retry Protection)", async () => {
    const params = { accountId: bankAccountId, amount: 2000, description: "Book" };
    const proposal = await AIFinancialAssistantService.proposeAction(
      householdId,
      userId,
      "RECORD_EXPENSE",
      params
    );

    const execResult = await AIFinancialAssistantService.confirmAndExecuteAction(
      householdId,
      userId,
      proposal.id,
      proposal.parametersHash
    );

    expect(execResult.success).toBe(true);

    // Attempt second execution of already EXECUTED proposal
    await expect(
      AIFinancialAssistantService.confirmAndExecuteAction(
        householdId,
        userId,
        proposal.id,
        proposal.parametersHash
      )
    ).rejects.toThrow("expected PENDING");
  });

  it("8. Household Isolation Gate", async () => {
    const otherHousehold = await prisma.household.create({
      data: { name: "Other Household", currency: "INR" },
    });
    const otherAccount = await prisma.account.create({
      data: { householdId: otherHousehold.id, name: "Secret Bank", balance: 888888 },
    });

    const params = { accountId: otherAccount.id, amount: 1000, description: "Secret" };
    const proposal = await AIFinancialAssistantService.proposeAction(
      otherHousehold.id,
      userId,
      "RECORD_EXPENSE",
      params
    );

    // Attempt executing cross-household proposal with current householdId
    await expect(
      AIFinancialAssistantService.confirmAndExecuteAction(
        householdId,
        userId,
        proposal.id,
        proposal.parametersHash
      )
    ).rejects.toThrow("Household isolation violation");
  });
});
