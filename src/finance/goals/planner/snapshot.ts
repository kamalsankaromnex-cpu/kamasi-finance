import { prisma } from "@/lib/prisma";
import { Prisma, PrismaClient } from "@prisma/client";
import { FinancialReportingService } from "@/finance/reporting/reporting.service";
import {
  FinancialSnapshot,
  FinancialValueSource,
  FundingAssumptionConfig,
} from "./strategies/strategy.interface";

export class FinancialSnapshotService {
  /**
   * Default fallback assumption configuration when DB does not have active record.
   */
  public static getDefaultAssumptions(): FundingAssumptionConfig {
    return {
      version: 1,
      fixedIncomeLow: 5.0,
      fixedIncomeBase: 6.5,
      fixedIncomeHigh: 7.5,
      investmentLow: 7.0,
      investmentBase: 11.0,
      investmentHigh: 14.0,
      emergencyReserveMonths: 6,
      maxDebtServiceRatio: 0.35,
      borrowingAnnualInterestRate: null,
      borrowingRateSource: "UNKNOWN",
      essentialExpenseRatio: null,
    };
  }

  /**
   * Retrieve active FundingAssumptionSet or fallback to standard version 1.
   */
  public static async getActiveAssumptions(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string
  ): Promise<FundingAssumptionConfig> {
    const record = await db.fundingAssumptionSet.findFirst({
      where: { householdId, active: true },
      orderBy: { version: "desc" },
    });

    if (!record) {
      return this.getDefaultAssumptions();
    }

    const borrowingRate = record.borrowingAnnualInterestRate !== null && record.borrowingAnnualInterestRate !== undefined
      ? Number(record.borrowingAnnualInterestRate)
      : null;

    const essentialRatio = record.essentialExpenseRatio !== null && record.essentialExpenseRatio !== undefined
      ? Number(record.essentialExpenseRatio)
      : null;

    return {
      version: record.version,
      fixedIncomeLow: Number(record.fixedIncomeLow),
      fixedIncomeBase: Number(record.fixedIncomeBase),
      fixedIncomeHigh: Number(record.fixedIncomeHigh),
      investmentLow: Number(record.investmentLow),
      investmentBase: Number(record.investmentBase),
      investmentHigh: Number(record.investmentHigh),
      emergencyReserveMonths: record.emergencyReserveMonths,
      maxDebtServiceRatio: Number(record.maxDebtServiceRatio),
      borrowingAnnualInterestRate: borrowingRate,
      borrowingRateSource: borrowingRate !== null ? "CONFIGURED" : "UNKNOWN",
      essentialExpenseRatio: essentialRatio,
    };
  }

  /**
   * 2. Financial Snapshot Service
   * Read-only consumption of existing authoritative modules:
   * NetWorth Report, CashFlow Report, Expense Analysis, Liability/Borrowing, and Goal modules.
   * Enforces Multi-Goal Protection and Hard Emergency Reserve constraints.
   * STRICT: Never fabricates financial values (no fake 25000, 0.75, 1.3).
   */
  public static async captureSnapshot(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string,
    targetGoalId?: string
  ): Promise<{ snapshot: FinancialSnapshot; assumptions: FundingAssumptionConfig }> {
    const assumptions = await this.getActiveAssumptions(db, householdId);

    // 1. Authoritative Total Liquid Cash (from bank & cash accounts)
    const liquidAccounts = await db.account.findMany({
      where: { householdId, isArchived: false, type: { in: ["BANK", "CASH"] } },
    });
    const totalCash = liquidAccounts.reduce((sum, acc) => sum + Math.max(0, Number(acc.balance)), 0);
    const cashSource: FinancialValueSource = liquidAccounts.length > 0 ? "ACTUAL" : "UNKNOWN";

    // 2. Authoritative Expenses from trailing 90-day transactions (annualized/monthly average)
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const expenseReport = await FinancialReportingService.getExpenseAnalysisReport(db, householdId, {
      from: ninetyDaysAgo,
      to: now,
    });

    const total90DayExpenses = Number(expenseReport.totalExpenses);
    let monthlyTotalExpenses: number | null = null;
    let monthlyExpenseSource: FinancialValueSource = "UNKNOWN";

    if (total90DayExpenses > 0) {
      monthlyTotalExpenses = Math.round(total90DayExpenses / 3);
      monthlyExpenseSource = "DERIVED";
    }

    // Essential expenses: only calculated if configured by user/system, otherwise UNKNOWN (no hardcoded 75%!)
    let monthlyEssentialExpenses: number | null = null;
    let monthlyEssentialExpenseSource: FinancialValueSource = "UNKNOWN";

    if (monthlyTotalExpenses !== null && assumptions.essentialExpenseRatio !== null && assumptions.essentialExpenseRatio !== undefined) {
      monthlyEssentialExpenses = Math.round(monthlyTotalExpenses * assumptions.essentialExpenseRatio);
      monthlyEssentialExpenseSource = "USER_ASSUMED";
    }

    // Emergency Reserve calculation (Hard Constraint): only calculated when essential expenses are known
    const emergencyReserveMonths = assumptions.emergencyReserveMonths;
    let emergencyReserveAmount: number | null = null;
    let emergencyReserveSource: FinancialValueSource = "UNKNOWN";

    if (monthlyEssentialExpenses !== null) {
      emergencyReserveAmount = monthlyEssentialExpenses * emergencyReserveMonths;
      emergencyReserveSource = monthlyEssentialExpenseSource;
    }

    // Earmarked Cash: Cash already allocated to other active goals (currentAmount)
    const otherActiveGoals = await db.goal.findMany({
      where: {
        householdId,
        status: "ACTIVE",
        ...(targetGoalId ? { id: { not: targetGoalId } } : {}),
      },
    });
    const earmarkedCash = otherActiveGoals.reduce((sum, g) => sum + Math.max(0, Number(g.currentAmount)), 0);
    const restrictedCash = 0; // Reserved for specific escrow/restricted balances

    // Available Funding Cash = Total Cash - Emergency Reserve (if known) - Earmarked - Restricted (Never below 0)
    const reserveToDeduct = emergencyReserveAmount !== null ? emergencyReserveAmount : 0;
    const availableFundingCash = Math.max(0, totalCash - reserveToDeduct - earmarkedCash - restrictedCash);

    // 3. Authoritative Monthly Income
    const incomeReport = await FinancialReportingService.getIncomeStatementReport(db, householdId, {
      from: ninetyDaysAgo,
      to: now,
    });
    const total90DayIncome = Number(incomeReport.totalNetIncomeCredited);
    let monthlyIncome: number | null = null;
    let monthlyIncomeSource: FinancialValueSource = "UNKNOWN";

    if (total90DayIncome > 0) {
      monthlyIncome = Math.round(total90DayIncome / 3);
      monthlyIncomeSource = "ACTUAL";
    }

    // 4. Authoritative EMI Obligations from active Borrowings & Liabilities
    const activeBorrowings = await db.borrowing.findMany({
      where: { householdId, status: { in: ["ACTIVE", "PARTIALLY_SETTLED"] } },
      include: { installments: { where: { status: "PENDING" } } },
    });

    let existingEmiObligations = 0;
    for (const b of activeBorrowings) {
      const nextInst = b.installments[0];
      if (nextInst) {
        existingEmiObligations += Number(nextInst.totalAmount);
      } else {
        const p = Number(b.outstandingPrincipal);
        const r = (Number(b.interestRate) / 12) / 100;
        const n = b.tenureMonths || 12;
        if (p > 0 && n > 0) {
          const emi = r > 0 ? (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : p / n;
          existingEmiObligations += Math.round(emi);
        }
      }
    }
    const borrowingSource: FinancialValueSource = activeBorrowings.length > 0 ? "ACTUAL" : "UNKNOWN";

    // Monthly Surplus: null if income or expenses are unknown!
    let monthlySurplus: number | null = null;
    if (monthlyIncome !== null && monthlyTotalExpenses !== null) {
      monthlySurplus = Math.max(0, monthlyIncome - monthlyTotalExpenses - existingEmiObligations);
    }

    // 5. Multi-Goal Protection:
    // Determine priority of target goal. Higher priority goals consume available surplus first!
    let targetGoalPriority: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
    if (targetGoalId) {
      const tg = await db.goal.findUnique({ where: { id: targetGoalId } });
      if (tg) targetGoalPriority = (tg.priority as any) || "MEDIUM";
    }

    const priorityWeight: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    const currentWeight = priorityWeight[targetGoalPriority] || 2;

    // Find other goals that have STRICTLY HIGHER priority
    let higherPriorityGoalMonthlyCommitments = 0;
    for (const g of otherActiveGoals) {
      const gWeight = priorityWeight[g.priority] || 2;
      if (gWeight > currentWeight) {
        higherPriorityGoalMonthlyCommitments += Math.max(0, Number(g.monthlyContribution || 0));
      }
    }

    // Available Goal Funding Capacity for this goal
    // If surplus is unknown, capacity is 0
    const availableGoalFundingCapacity = monthlySurplus !== null
      ? Math.max(0, monthlySurplus - higherPriorityGoalMonthlyCommitments)
      : 0;

    // 6. Existing Investments Value
    const activeInvestments = await db.investment.findMany({
      where: { householdId, status: { in: ["ACTIVE", "PARTIALLY_SOLD"] } },
    });
    const existingInvestmentsValue = activeInvestments.reduce((sum, inv) => sum + Number(inv.currentMarketValue), 0);
    const investmentSource: FinancialValueSource = activeInvestments.length > 0 ? "ACTUAL" : "UNKNOWN";

    // 7. Eligible Assets (Only ACTIVE and non-disposed, filtered by funding eligibility)
    const activeAssets = await db.asset.findMany({
      where: { householdId, status: "ACTIVE" },
    });

    const eligibleAssets = activeAssets.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      currentValue: Number(a.currentValue),
      fundingEligibility: (a.fundingEligibility as any) || "OPTIONAL",
    }));

    const totalEligibleAssetValue = eligibleAssets
      .filter((a) => a.fundingEligibility === "ELIGIBLE" || a.fundingEligibility === "OPTIONAL")
      .reduce((sum, a) => sum + a.currentValue, 0);
    const assetSource: FinancialValueSource = activeAssets.length > 0 ? "ACTUAL" : "UNKNOWN";

    // 8. Borrowings list
    const existingBorrowings = activeBorrowings.map((b) => ({
      id: b.id,
      name: b.name,
      outstandingPrincipal: Number(b.outstandingPrincipal),
      interestRate: Number(b.interestRate),
    }));
    const totalOutstandingBorrowings = existingBorrowings.reduce((sum, b) => sum + b.outstandingPrincipal, 0);

    const snapshot: FinancialSnapshot = {
      householdId,
      calculatedAt: now.toISOString(),
      totalCash,
      cashSource,
      emergencyReserveMonths,
      emergencyReserveAmount,
      emergencyReserveSource,
      earmarkedCash,
      restrictedCash,
      availableFundingCash,
      monthlyIncome,
      monthlyIncomeSource,
      monthlyEssentialExpenses,
      monthlyEssentialExpenseSource,
      monthlyTotalExpenses,
      monthlyExpenseSource,
      existingEmiObligations,
      monthlySurplus,
      higherPriorityGoalMonthlyCommitments,
      availableGoalFundingCapacity,
      existingInvestmentsValue,
      investmentSource,
      eligibleAssets,
      totalEligibleAssetValue,
      assetSource,
      existingBorrowings,
      totalOutstandingBorrowings,
      borrowingSource,
    };

    return { snapshot, assumptions };
  }
}
