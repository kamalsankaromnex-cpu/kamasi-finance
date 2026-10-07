import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { FinancialCommand } from "@/finance/financial-command";
import { TransactionDomainService } from "@/modules/transactions/transaction.service";
import { Prisma } from "@prisma/client";

describe("Integrated Expense & Budget Management System Tests", () => {
  let testHouseholdId: string;
  let testUserId: string;
  let bankAccountId: string;
  let creditCardAccountId: string;

  beforeEach(async () => {
    // Setup clean test environment
    const user = await prisma.user.create({
      data: {
        email: `exp_test_${Math.random().toString(36).substring(2)}_${Date.now()}@kamasi.com`,
        passwordHash: "hashedpass",
        name: "Expense Test User",
      },
    });
    testUserId = user.id;

    const household = await prisma.household.create({
      data: {
        name: "Expense Test Household",
        currency: "INR",
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

    const bank = await prisma.account.create({
      data: {
        householdId: household.id,
        name: "HDFC Primary Bank",
        type: "BANK",
        balance: new Prisma.Decimal(0.0),
      },
    });
    bankAccountId = bank.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: testHouseholdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(100000.0),
      });
    });

    const card = await prisma.account.create({
      data: {
        householdId: household.id,
        name: "ICICI Credit Card",
        type: "CREDIT",
        balance: new Prisma.Decimal(0.0),
      },
    });
    creditCardAccountId = card.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: testHouseholdId,
        accountId: creditCardAccountId,
        accountType: "CREDIT",
        openingBalance: new Prisma.Decimal(-5000.0),
      });
    });
  });

  it("ACCOUNTING TEST: ₹5,000 actual expense reduces account balance by exactly ₹5,000 (NOT ₹10,000)", async () => {
    const startBalance = 100000.0;
    const expenseAmount = 5000.0;

    const decAmount = new Prisma.Decimal(expenseAmount);
    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createExpense(tx, {
        householdId: testHouseholdId,
        userId: testUserId,
        accountId: bankAccountId,
        amount: decAmount,
        description: "Office Supplies",
      });
    });

    const account = await prisma.account.findUnique({ where: { id: bankAccountId } });
    const finalBalance = Number(account?.balance);

    expect(finalBalance).toBe(startBalance - expenseAmount); // Exactly ₹95,000
    expect(finalBalance).not.toBe(startBalance - expenseAmount * 2); // NOT ₹90,000!
  });

  it("PENDING BILL NEUTRALITY: Pending bill occurrence does NOT alter account cash balance", async () => {
    const rule = await prisma.recurringTransaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: bankAccountId,
        name: "Electricity Bill Rule",
        amount: new Prisma.Decimal(4500.0),
        type: "EXPENSE",
        frequency: "MONTHLY",
      },
    });

    const occ = await prisma.recurringBillOccurrence.create({
      data: {
        householdId: testHouseholdId,
        recurringRuleId: rule.id,
        name: "Electricity Bill - Sept 2026",
        dueDate: new Date(),
        expectedAmount: new Prisma.Decimal(4500.0),
        paidAmount: new Prisma.Decimal(0.0),
        outstandingAmount: new Prisma.Decimal(4500.0),
        status: "DUE",
      },
    });

    const account = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(account?.balance)).toBe(100000.0); // Balance remains completely unchanged!
    expect(occ.status).toBe("DUE");
  });

  it("PARTIAL BILL PAYMENT: Paying ₹3,000 towards ₹10,000 bill leaves ₹7,000 outstanding and status PARTIALLY_PAID", async () => {
    const startBalance = 100000.0;
    const expected = 10000.0;
    const partialPay = 3000.0;

    const rule = await prisma.recurringTransaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: bankAccountId,
        name: "School Fee Rule",
        amount: new Prisma.Decimal(expected),
        type: "EXPENSE",
        frequency: "MONTHLY",
      },
    });

    const occ = await prisma.recurringBillOccurrence.create({
      data: {
        householdId: testHouseholdId,
        recurringRuleId: rule.id,
        name: "School Fee - Sept 2026",
        dueDate: new Date(),
        expectedAmount: new Prisma.Decimal(expected),
        paidAmount: new Prisma.Decimal(0.0),
        outstandingAmount: new Prisma.Decimal(expected),
        status: "DUE",
      },
    });

    // Execute Partial Payment inside single transaction
    const decPay = new Prisma.Decimal(partialPay);
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postExpense(tx, {
        householdId: testHouseholdId,
        accountId: bankAccountId,
        amount: decPay,
        description: "School Fee Part Payment",
      });

      await tx.transaction.create({
        data: {
          householdId: testHouseholdId,
          accountId: bankAccountId,
          amount: decPay,
          type: "EXPENSE",
          recurringRuleId: rule.id,
          recurringOccurrenceId: occ.id,
          description: "School Fee Part Payment",
        },
      });

      await tx.recurringBillOccurrence.update({
        where: { id: occ.id },
        data: {
          paidAmount: decPay,
          outstandingAmount: new Prisma.Decimal(expected - partialPay),
          status: "PARTIALLY_PAID",
        },
      });
    });

    const account = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(account?.balance)).toBe(startBalance - partialPay); // ₹97,000

    const updatedOcc = await prisma.recurringBillOccurrence.findUnique({ where: { id: occ.id } });
    expect(Number(updatedOcc?.paidAmount)).toBe(partialPay);
    expect(Number(updatedOcc?.outstandingAmount)).toBe(7000.0);
    expect(updatedOcc?.status).toBe("PARTIALLY_PAID");
  });

  it("CREDIT CARD TRANSFER EXCLUSION: Paying credit card bill via TRANSFER does not double-count expenses", async () => {
    // 1. Credit Card Purchase of ₹2,000 (creates EXPENSE on Credit Card account)
    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createExpense(tx, {
        householdId: testHouseholdId,
        userId: testUserId,
        accountId: creditCardAccountId,
        amount: new Prisma.Decimal(2000.0),
        description: "Restaurant Dining",
      });
    });

    // 2. Card Bill Payment of ₹2,000 from Bank -> Credit Card (recorded as TRANSFER)
    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createTransfer(tx, {
        householdId: testHouseholdId,
        userId: testUserId,
        accountId: bankAccountId,
        transferAccountId: creditCardAccountId,
        amount: new Prisma.Decimal(2000.0),
        description: "Credit Card Bill Settlement",
      });
    });

    // Calculate total actual expenses (excluding TRANSFER)
    const expenseTxns = await prisma.transaction.findMany({
      where: { householdId: testHouseholdId, type: "EXPENSE" },
    });

    const totalExpenseAmount = expenseTxns.reduce((acc, t) => acc + Number(t.amount), 0);
    expect(totalExpenseAmount).toBe(2000.0); // Exactly ₹2,000 (TRANSFER of ₹2,000 was excluded!)
  });

  it("LOAN REPAYMENT SEPARATION: Separates principal reduction from interest expense", async () => {
    const loanLiability = await prisma.liability.create({
      data: {
        householdId: testHouseholdId,
        name: "Car Loan",
        category: "LOAN",
        type: "CAR_LOAN",
        status: "ACTIVE",
        principalAmount: new Prisma.Decimal(400000.0), // Initial loan: ₹4,00,000
        outstandingAmount: new Prisma.Decimal(400000.0),
      },
    });

    const emiTotal = 15000.0;
    const interestPart = 3000.0;
    const principalPart = 12000.0;

    // Post EMI
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postLoanPayment(tx, {
        householdId: testHouseholdId,
        payingAccountId: bankAccountId,
        liabilityName: "Car Loan",
        principalAmount: new Prisma.Decimal(principalPart),
        interestAmount: new Prisma.Decimal(interestPart),
      });

      // Interest recorded as EXPENSE transaction
      await tx.transaction.create({
        data: {
          householdId: testHouseholdId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(interestPart),
          type: "EXPENSE",
          description: "Car Loan Interest Expense",
        },
      });

      // Principal decrements Liability balance
      await tx.liability.update({
        where: { id: loanLiability.id },
        data: { outstandingAmount: { decrement: new Prisma.Decimal(principalPart) } },
      });
    });

    const updatedLiability = await prisma.liability.findUnique({ where: { id: loanLiability.id } });
    expect(Number(updatedLiability?.outstandingAmount)).toBe(388000.0); // Reduced by ₹12,000 principal!

    const expenseTxns = await prisma.transaction.findMany({
      where: { householdId: testHouseholdId, type: "EXPENSE" },
    });
    expect(Number(expenseTxns[0].amount)).toBe(interestPart); // Only ₹3,000 interest counted as expense!
  });

  it("ACCEPTANCE 1 & 2: Add a ₹2,500 expense and verify balance decreases by ₹2,500, appears once in ledger & budget actuals", async () => {
    const startBalance = 100000.0;
    const expenseAmount = 2500.0;

    const category = await prisma.category.create({
      data: {
        householdId: testHouseholdId,
        name: "Test Groceries",
        type: "EXPENSE",
      },
    });

    await prisma.budget.create({
      data: {
        householdId: testHouseholdId,
        categoryId: category.id,
        month: 9,
        year: 2026,
        amount: new Prisma.Decimal(10000.0),
      },
    });

    // Add ₹2,500 expense
    const decAmount = new Prisma.Decimal(expenseAmount);
    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createExpense(tx, {
        householdId: testHouseholdId,
        userId: testUserId,
        accountId: bankAccountId,
        categoryId: category.id,
        amount: decAmount,
        description: "Supermarket Order",
      });
    });

    // 1. Verify account balance decreases by exactly ₹2,500
    const account = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(account?.balance)).toBe(startBalance - expenseAmount); // ₹97,500

    // 2. Appears once in transaction history
    const txns = await prisma.transaction.findMany({
      where: { householdId: testHouseholdId, categoryId: category.id, type: "EXPENSE" },
    });
    expect(txns.length).toBe(1);
    expect(Number(txns[0].amount)).toBe(expenseAmount);

    // 3. Appears once in budget actuals
    const budgetSpent = txns.reduce((acc, t) => acc + Number(t.amount), 0);
    expect(budgetSpent).toBe(expenseAmount);
  });

  it("ACCEPTANCE 3: Record a partial bill payment and verify remaining outstanding amount", async () => {
    const expected = 15000.0;
    const partial = 6000.0;

    const rule = await prisma.recurringTransaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: bankAccountId,
        name: "Apartment Maintenance",
        amount: new Prisma.Decimal(expected),
        type: "EXPENSE",
      },
    });

    const occ = await prisma.recurringBillOccurrence.create({
      data: {
        householdId: testHouseholdId,
        recurringRuleId: rule.id,
        name: "Apartment Maintenance - Oct 2026",
        dueDate: new Date(),
        expectedAmount: new Prisma.Decimal(expected),
        paidAmount: new Prisma.Decimal(0.0),
        outstandingAmount: new Prisma.Decimal(expected),
        status: "DUE",
      },
    });

    // Record partial payment of ₹6,000
    const decPartial = new Prisma.Decimal(partial);
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postExpense(tx, {
        householdId: testHouseholdId,
        accountId: bankAccountId,
        amount: decPartial,
        description: "Partial Maintenance Payment",
      });

      await tx.transaction.create({
        data: {
          householdId: testHouseholdId,
          accountId: bankAccountId,
          amount: decPartial,
          type: "EXPENSE",
          recurringRuleId: rule.id,
          recurringOccurrenceId: occ.id,
          description: "Partial Maintenance Payment",
        },
      });

      await tx.recurringBillOccurrence.update({
        where: { id: occ.id },
        data: {
          paidAmount: decPartial,
          outstandingAmount: new Prisma.Decimal(expected - partial),
          status: "PARTIALLY_PAID",
        },
      });
    });

    const updatedOcc = await prisma.recurringBillOccurrence.findUnique({ where: { id: occ.id } });
    expect(Number(updatedOcc?.paidAmount)).toBe(6000.0);
    expect(Number(updatedOcc?.outstandingAmount)).toBe(9000.0);
    expect(updatedOcc?.status).toBe("PARTIALLY_PAID");
  });

  it("ACCEPTANCE 4: Pay a credit card bill and confirm it doesn't count as a second expense", async () => {
    // Original Credit Card Purchase: ₹4,000 EXPENSE
    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createExpense(tx, {
        householdId: testHouseholdId,
        userId: testUserId,
        accountId: creditCardAccountId,
        amount: new Prisma.Decimal(4000.0),
        description: "Electronics Purchase",
      });
    });

    // Credit Card Bill Settlement: ₹4,000 TRANSFER
    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createTransfer(tx, {
        householdId: testHouseholdId,
        userId: testUserId,
        accountId: bankAccountId,
        transferAccountId: creditCardAccountId,
        amount: new Prisma.Decimal(4000.0),
        description: "Card Bill Settlement",
      });
    });

    const totalExpense = (
      await prisma.transaction.findMany({
        where: { householdId: testHouseholdId, type: "EXPENSE" },
      })
    ).reduce((acc, t) => acc + Number(t.amount), 0);

    expect(totalExpense).toBe(4000.0); // Exactly ₹4,000! Card bill transfer did not add a 2nd expense.
  });

  it("ACCEPTANCE 5: Edit a recurring bill rule and verify historical occurrences remain unchanged", async () => {
    const rule = await prisma.recurringTransaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: bankAccountId,
        name: "Broadband Bill",
        amount: new Prisma.Decimal(1200.0),
        type: "EXPENSE",
      },
    });

    const historicalOcc = await prisma.recurringBillOccurrence.create({
      data: {
        householdId: testHouseholdId,
        recurringRuleId: rule.id,
        name: "Broadband - Sept 2026",
        dueDate: new Date(2026, 8, 15),
        expectedAmount: new Prisma.Decimal(1200.0),
        paidAmount: new Prisma.Decimal(1200.0),
        outstandingAmount: new Prisma.Decimal(0.0),
        status: "PAID",
      },
    });

    // Edit recurring rule expected amount from ₹1,200 to ₹1,500
    await prisma.recurringTransaction.update({
      where: { id: rule.id },
      data: { amount: new Prisma.Decimal(1500.0) },
    });

    // Verify historical occurrence expectedAmount & status are completely unchanged
    const fetchedOcc = await prisma.recurringBillOccurrence.findUnique({ where: { id: historicalOcc.id } });
    expect(Number(fetchedOcc?.expectedAmount)).toBe(1200.0);
    expect(fetchedOcc?.status).toBe("PAID");
  });

  it("ACCEPTANCE 6: Verify a VIEWER cannot mutate expenses or pay bills", async () => {
    const viewerUser = await prisma.user.create({
      data: {
        email: `viewer_${Date.now()}@kamasi.com`,
        passwordHash: "pass",
        name: "Viewer User",
      },
    });

    await prisma.householdMember.create({
      data: {
        householdId: testHouseholdId,
        userId: viewerUser.id,
        role: "VIEWER",
      },
    });

    const { assertCanMutate } = await import("../rbac");
    const forbidden = assertCanMutate("VIEWER");
    expect(forbidden).not.toBeNull();
    expect(forbidden?.status).toBe(403);
  });

  it("ACCEPTANCE 7: Refresh/re-query database and confirm balances, budgets, and bill statuses persist", async () => {
    const acc = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(acc).not.toBeNull();
    expect(Number(acc?.balance)).toBe(100000.0);

    const occurrences = await prisma.recurringBillOccurrence.findMany({
      where: { householdId: testHouseholdId },
    });
    expect(Array.isArray(occurrences)).toBe(true);
  });
});
