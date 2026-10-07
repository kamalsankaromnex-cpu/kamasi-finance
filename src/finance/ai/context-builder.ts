import { prisma } from "@/lib/prisma";

export interface SanitizedHouseholdContext {
  householdId: string;
  householdName: string;
  currency: string;
  activeAccounts: Array<{ id: string; name: string; type: string; balance: number }>;
  incomeSourcesCount: number;
  recurringBillsCount: number;
  activeGoalsCount: number;
  activeLiabilitiesCount: number;
  activeInvestmentsCount: number;
  activeAssetsCount: number;
  totalLiquidBalance: number;
}

export class FinancialContextBuilder {
  /**
   * Build sanitized household financial context
   */
  public static async buildContext(householdId: string): Promise<SanitizedHouseholdContext> {
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      select: { id: true, name: true, currency: true },
    });

    if (!household) {
      throw new Error(`Household not found: ${householdId}`);
    }

    const accounts = await prisma.account.findMany({
      where: { householdId, isArchived: false },
      select: { id: true, name: true, type: true, balance: true },
    });

    const activeAccounts = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: Number(a.balance),
    }));

    const totalLiquidBalance = activeAccounts
      .filter((a) => ["BANK", "CASH", "SAVINGS", "CHECKING"].includes(a.type.toUpperCase()))
      .reduce((sum, a) => sum + a.balance, 0);

    const [
      incomeSourcesCount,
      recurringBillsCount,
      activeGoalsCount,
      activeLiabilitiesCount,
      activeInvestmentsCount,
      activeAssetsCount,
    ] = await Promise.all([
      prisma.incomeSource.count({ where: { householdId, isActive: true } }),
      prisma.recurringTransaction.count({ where: { householdId, isActive: true } }),
      prisma.goal.count({ where: { householdId, status: "ACTIVE" } }),
      prisma.liability.count({ where: { householdId, status: { in: ["ACTIVE", "PARTIALLY_SETTLED"] } } }),
      prisma.investment.count({ where: { householdId, status: { in: ["ACTIVE", "PARTIALLY_SOLD"] } } }),
      prisma.asset.count({ where: { householdId, status: "ACTIVE" } }),
    ]);

    return {
      householdId: household.id,
      householdName: household.name,
      currency: household.currency || "INR",
      activeAccounts,
      incomeSourcesCount,
      recurringBillsCount,
      activeGoalsCount,
      activeLiabilitiesCount,
      activeInvestmentsCount,
      activeAssetsCount,
      totalLiquidBalance,
    };
  }
}
