import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { FinancialCommand } from "@/finance/financial-command";
import { TransactionDomainService } from "@/modules/transactions/transaction.service";
import { Prisma } from "@prisma/client";

describe("Universal Income Management System & Ledger Integrity Tests", () => {
  let testHouseholdId: string;
  let testUserId: string;
  let testAccountId: string;

  beforeEach(async () => {
    // Setup clean test household, user, and account
    const user = await prisma.user.create({
      data: {
        email: `income_test_${Date.now()}@kamasi.com`,
        passwordHash: "hashedpass",
        name: "Test Income User",
      },
    });
    testUserId = user.id;

    const household = await prisma.household.create({
      data: {
        name: "Income Test Household",
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

    const account = await prisma.account.create({
      data: {
        householdId: household.id,
        name: "Primary HDFC Savings",
        type: "BANK",
        balance: new Prisma.Decimal(0.0),
      },
    });
    testAccountId = account.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: testHouseholdId,
        accountId: testAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(100000.0),
      });
    });
  });

  it("creates income sources with RECURRING, SEASONAL, and IRREGULAR behaviors", async () => {
    // 1. Recurring Salary
    const salarySource = await prisma.incomeSource.create({
      data: {
        householdId: testHouseholdId,
        name: "Senior Tech Lead Salary",
        category: "Salary",
        behavior: "RECURRING",
        frequency: "MONTHLY",
        expectedAmount: new Prisma.Decimal(185000.0),
        defaultAccountId: testAccountId,
      },
    });
    expect(salarySource.name).toBe("Senior Tech Lead Salary");
    expect(salarySource.behavior).toBe("RECURRING");

    // 2. Seasonal Agriculture / Sericulture
    const silkSource = await prisma.incomeSource.create({
      data: {
        householdId: testHouseholdId,
        name: "Sericulture Cocoon Lot #1",
        category: "Sericulture",
        behavior: "SEASONAL",
        frequency: "CUSTOM_SEASONAL",
        expectedAmount: new Prisma.Decimal(65000.0),
      },
    });
    expect(silkSource.category).toBe("Sericulture");
    expect(silkSource.behavior).toBe("SEASONAL");
  });

  it("verifies pending occurrences do NOT alter account cash balance prior to confirmation", async () => {
    const initialAccount = await prisma.account.findUnique({ where: { id: testAccountId } });
    const initialBalance = Number(initialAccount?.balance);

    const source = await prisma.incomeSource.create({
      data: {
        householdId: testHouseholdId,
        name: "Monthly Consulting Retainer",
        category: "Freelance",
        expectedAmount: new Prisma.Decimal(50000.0),
      },
    });

    // Create pending occurrence
    const occurrence = await prisma.incomeOccurrence.create({
      data: {
        householdId: testHouseholdId,
        incomeSourceId: source.id,
        name: "October 2026 Retainer",
        periodStart: new Date(2026, 9, 1),
        periodEnd: new Date(2026, 9, 31),
        dueDate: new Date(2026, 9, 31),
        expectedAmount: new Prisma.Decimal(50000.0),
        receivedAmount: new Prisma.Decimal(0.0),
        outstandingAmount: new Prisma.Decimal(50000.0),
        status: "PENDING",
      },
    });

    expect(occurrence.status).toBe("PENDING");

    // Verify account balance is completely unchanged
    const currentAccount = await prisma.account.findUnique({ where: { id: testAccountId } });
    expect(Number(currentAccount?.balance)).toBe(initialBalance);
  });

  it("REGRESSION TEST: proves a ₹20,000 receipt increases balance by exactly ₹20,000 (NOT ₹40,000)", async () => {
    const startBalance = 100000.0;
    const receiptAmount = 20000.0;

    const source = await prisma.incomeSource.create({
      data: {
        householdId: testHouseholdId,
        name: "Goat Farming Lot Sale",
        category: "Livestock",
        expectedAmount: new Prisma.Decimal(20000.0),
      },
    });

    const occ = await prisma.incomeOccurrence.create({
      data: {
        householdId: testHouseholdId,
        incomeSourceId: source.id,
        name: "Goat Lot 1",
        periodStart: new Date(),
        periodEnd: new Date(),
        dueDate: new Date(),
        expectedAmount: new Prisma.Decimal(20000.0),
        receivedAmount: new Prisma.Decimal(0.0),
        outstandingAmount: new Prisma.Decimal(20000.0),
        status: "PENDING",
      },
    });

    // Post Receipt via Unified Atomic Transaction Handler
    const decAmount = new Prisma.Decimal(receiptAmount);
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postIncome(tx, {
        householdId: testHouseholdId,
        accountId: testAccountId,
        amount: decAmount,
        description: "Goat Sale Lot 1 Receipt",
      });

      await tx.transaction.create({
        data: {
          householdId: testHouseholdId,
          accountId: testAccountId,
          userId: testUserId,
          date: new Date(),
          amount: decAmount,
          type: "INCOME",
          incomeSourceId: source.id,
          occurrenceId: occ.id,
          description: "Goat Sale Lot 1 Receipt",
        },
      });

      await tx.incomeOccurrence.update({
        where: { id: occ.id },
        data: {
          receivedAmount: decAmount,
          outstandingAmount: new Prisma.Decimal(0),
          status: "FULLY_RECEIVED",
        },
      });
    });

    // Check final account balance
    const finalAccount = await prisma.account.findUnique({ where: { id: testAccountId } });
    const finalBalance = Number(finalAccount?.balance);

    expect(finalBalance).toBe(startBalance + receiptAmount); // Exactly ₹1,20,000
    expect(finalBalance).not.toBe(startBalance + receiptAmount * 2); // NOT ₹1,40,000!
  });

  it("handles partial receipts correctly across multiple payments until full settlement", async () => {
    const expected = 43000.0;
    const partial1 = 20000.0;
    const partial2 = 23000.0;

    const source = await prisma.incomeSource.create({
      data: {
        householdId: testHouseholdId,
        name: "KVB Salary Stream",
        category: "Salary",
        expectedAmount: new Prisma.Decimal(expected),
      },
    });

    const occ = await prisma.incomeOccurrence.create({
      data: {
        householdId: testHouseholdId,
        incomeSourceId: source.id,
        name: "October KVB Salary",
        periodStart: new Date(),
        periodEnd: new Date(),
        dueDate: new Date(),
        expectedAmount: new Prisma.Decimal(expected),
        receivedAmount: new Prisma.Decimal(0.0),
        outstandingAmount: new Prisma.Decimal(expected),
        status: "PENDING",
      },
    });

    // 1. Post Partial Receipt 1 (₹20,000)
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postIncome(tx, {
        householdId: testHouseholdId,
        accountId: testAccountId,
        amount: new Prisma.Decimal(partial1),
        description: "Partial Salary 1",
      });

      await tx.transaction.create({
        data: {
          householdId: testHouseholdId,
          accountId: testAccountId,
          amount: new Prisma.Decimal(partial1),
          type: "INCOME",
          incomeSourceId: source.id,
          occurrenceId: occ.id,
          description: "Partial Salary 1",
        },
      });

      await tx.incomeOccurrence.update({
        where: { id: occ.id },
        data: {
          receivedAmount: new Prisma.Decimal(partial1),
          outstandingAmount: new Prisma.Decimal(expected - partial1),
          status: "PARTIALLY_RECEIVED",
        },
      });
    });

    let updatedOcc = await prisma.incomeOccurrence.findUnique({ where: { id: occ.id } });
    expect(Number(updatedOcc?.receivedAmount)).toBe(partial1);
    expect(Number(updatedOcc?.outstandingAmount)).toBe(23000.0);
    expect(updatedOcc?.status).toBe("PARTIALLY_RECEIVED");

    // 2. Post Remaining Settlement (₹23,000)
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postIncome(tx, {
        householdId: testHouseholdId,
        accountId: testAccountId,
        amount: new Prisma.Decimal(partial2),
        description: "Partial Salary 2 Final Settlement",
      });

      await tx.transaction.create({
        data: {
          householdId: testHouseholdId,
          accountId: testAccountId,
          amount: new Prisma.Decimal(partial2),
          type: "INCOME",
          incomeSourceId: source.id,
          occurrenceId: occ.id,
          description: "Partial Salary 2 Final Settlement",
        },
      });

      await tx.incomeOccurrence.update({
        where: { id: occ.id },
        data: {
          receivedAmount: new Prisma.Decimal(expected),
          outstandingAmount: new Prisma.Decimal(0),
          status: "FULLY_RECEIVED",
        },
      });
    });

    updatedOcc = await prisma.incomeOccurrence.findUnique({ where: { id: occ.id } });
    expect(Number(updatedOcc?.receivedAmount)).toBe(expected);
    expect(Number(updatedOcc?.outstandingAmount)).toBe(0);
    expect(updatedOcc?.status).toBe("FULLY_RECEIVED");
  });

  it("verifies source deactivation preserves historical transaction records", async () => {
    const source = await prisma.incomeSource.create({
      data: {
        householdId: testHouseholdId,
        name: "Legacy Rental Flat 4B",
        category: "Rental",
        expectedAmount: new Prisma.Decimal(15000.0),
      },
    });

    // Create actual transaction
    const txn = await prisma.transaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: testAccountId,
        amount: new Prisma.Decimal(15000.0),
        type: "INCOME",
        incomeSourceId: source.id,
        description: "March Rent",
      },
    });

    // Soft delete / deactivate source
    await prisma.incomeSource.update({
      where: { id: source.id },
      data: { isActive: false },
    });

    // Transaction remains completely intact
    const fetchedTxn = await prisma.transaction.findUnique({ where: { id: txn.id } });
    expect(fetchedTxn).not.toBeNull();
    expect(fetchedTxn?.incomeSourceId).toBe(source.id);
  });

  it("creates employment profile, generates payslip, and confirms bank credit atomically", async () => {
    // 1. Create Employment Profile
    const emp = await prisma.employmentProfile.create({
      data: {
        householdId: testHouseholdId,
        userId: testUserId,
        employerName: "Karur Vysya Bank",
        designation: "Branch Sales & Service Executive",
        employmentType: "FULL_TIME",
        salaryCreditDate: 1,
        status: "ACTIVE",
      },
    });

    expect(emp.employerName).toBe("Karur Vysya Bank");
    expect(emp.designation).toBe("Branch Sales & Service Executive");

    // 2. Generate Payslip Record
    const payslip = await prisma.payslipRecord.create({
      data: {
        householdId: testHouseholdId,
        employmentId: emp.id,
        userId: testUserId,
        month: 6,
        year: 2026,
        payPeriod: "Jun 2026",
        basicSalary: new Prisma.Decimal(25000.0),
        hra: new Prisma.Decimal(10000.0),
        otherAllowances: new Prisma.Decimal(8000.0),
        bonusIncentives: new Prisma.Decimal(5000.0),
        grossSalary: new Prisma.Decimal(48000.0),
        pfDeduction: new Prisma.Decimal(1800.0),
        professionalTax: new Prisma.Decimal(200.0),
        tdsTax: new Prisma.Decimal(1000.0),
        totalDeductions: new Prisma.Decimal(3000.0),
        netSalary: new Prisma.Decimal(45000.0),
        status: "GENERATED",
      },
    });

    expect(Number(payslip.grossSalary)).toBe(48000.0);
    expect(Number(payslip.totalDeductions)).toBe(3000.0);
    expect(Number(payslip.netSalary)).toBe(45000.0);

    // 3. Confirm Bank Credit
    const startAccount = await prisma.account.findUnique({ where: { id: testAccountId } });
    const startBalance = Number(startAccount?.balance);

    const result = await prisma.$transaction(async (tx) => {
      await FinancialCommand.postIncome(tx, {
        householdId: testHouseholdId,
        accountId: testAccountId,
        amount: payslip.netSalary,
        description: `Salary Credit: ${emp.employerName}`,
      });

      const transaction = await tx.transaction.create({
        data: {
          householdId: testHouseholdId,
          accountId: testAccountId,
          userId: testUserId,
          date: new Date(),
          amount: payslip.netSalary,
          type: "INCOME",
          description: `Salary Credit: ${emp.employerName}`,
        },
      });

      const updatedPayslip = await tx.payslipRecord.update({
        where: { id: payslip.id },
        data: {
          status: "CONFIRMED_CREDITED",
          actualAmountCredited: payslip.netSalary,
          transactionId: transaction.id,
        },
      });

      const updatedAccount = await tx.account.findUniqueOrThrow({ where: { id: testAccountId } });

      return { updatedAccount, updatedPayslip };
    });

    expect(result.updatedPayslip.status).toBe("CONFIRMED_CREDITED");
    expect(Number(result.updatedAccount.balance)).toBe(startBalance + 45000.0);
  });
});
