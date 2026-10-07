import { Prisma, PrismaClient } from "@prisma/client";

if (process.env.KAMASI_QA_DATABASE !== "prisma/phase3-recovery.db" || process.env.DATABASE_URL !== "file:./phase3-recovery.db") {
  throw new Error("Refusing fixture write: set KAMASI_QA_DATABASE=prisma/phase3-recovery.db and DATABASE_URL=file:./phase3-recovery.db");
}

async function main() {
const prisma = new PrismaClient();
const amount = (value: string) => new Prisma.Decimal(value);

try {
  if (await prisma.household.count()) throw new Error("Recovery fixture database must be empty");
  await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({ data: { name: "Synthetic Recovery Household", currency: "INR" } });
    const user = await tx.user.create({
      data: { email: "recovery-fixture@example.invalid", name: "Synthetic Recovery User", passwordHash: "NOT-A-LOGIN-CREDENTIAL" },
    });
    await tx.householdMember.create({ data: { householdId: household.id, userId: user.id, role: "OWNER" } });
    const account = await tx.account.create({
      data: { householdId: household.id, userId: user.id, name: "Synthetic Main Account", type: "BANK", currency: "INR", balance: amount("1090"), isShared: true },
    });
    const incomeCategory = await tx.category.create({ data: { householdId: household.id, name: "Synthetic Income", type: "INCOME" } });
    const expenseCategory = await tx.category.create({ data: { householdId: household.id, name: "Synthetic Expense", type: "EXPENSE" } });
    const incomeSource = await tx.incomeSource.create({
      data: {
        householdId: household.id, name: "Synthetic Monthly Income", category: "Salary", categoryId: incomeCategory.id,
        defaultAccountId: account.id, expectedAmount: amount("100"), currency: "INR", behavior: "RECURRING",
        frequency: "MONTHLY", expectedDay: 1, startDate: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
    const incomeOccurrence = await tx.incomeOccurrence.create({
      data: {
        householdId: household.id, incomeSourceId: incomeSource.id, name: "Synthetic September income",
        periodStart: new Date("2026-09-01T00:00:00.000Z"), periodEnd: new Date("2026-09-30T00:00:00.000Z"),
        dueDate: new Date("2026-09-05T00:00:00.000Z"), expectedAmount: amount("100"), receivedAmount: amount("40"),
        outstandingAmount: amount("60"), status: "PARTIALLY_RECEIVED",
      },
    });
    const recurringRule = await tx.recurringTransaction.create({
      data: {
        householdId: household.id, accountId: account.id, categoryId: expenseCategory.id, name: "Synthetic monthly bill",
        amount: amount("80"), type: "EXPENSE", frequency: "MONTHLY", startDate: new Date("2026-09-01T00:00:00.000Z"),
        nextDueDate: new Date("2026-09-15T00:00:00.000Z"),
      },
    });
    const billOccurrence = await tx.recurringBillOccurrence.create({
      data: {
        householdId: household.id, recurringRuleId: recurringRule.id, name: "Synthetic September bill",
        dueDate: new Date("2026-09-15T00:00:00.000Z"), expectedAmount: amount("80"), paidAmount: amount("20"),
        outstandingAmount: amount("60"), status: "PARTIALLY_PAID",
      },
    });
    const employment = await tx.employmentProfile.create({
      data: {
        householdId: household.id, userId: user.id, employerName: "Synthetic Employer", employmentType: "FULL_TIME",
        salaryFrequency: "MONTHLY", salaryCreditDate: 1, status: "ACTIVE", incomeSourceId: incomeSource.id,
      },
    });
    const payslip = await tx.payslipRecord.create({
      data: {
        householdId: household.id, employmentId: employment.id, userId: user.id, month: 9, year: 2026,
        payPeriod: "Sep 2026", basicSalary: amount("300"), grossSalary: amount("300"), netSalary: amount("300"), status: "GENERATED",
      },
    });
    await tx.budget.create({ data: { householdId: household.id, categoryId: expenseCategory.id, month: 9, year: 2026, amount: amount("500") } });
    const goal = await tx.goal.create({
      data: { householdId: household.id, name: "Synthetic emergency fund", targetAmount: amount("500"), currentAmount: amount("30"), targetDate: new Date("2027-12-31T00:00:00.000Z") },
    });
    await tx.investment.create({
      data: { householdId: household.id, investmentAccountId: account.id, name: "Synthetic holding", symbol: "SYN", category: "OTHER", type: "OTHER", status: "ACTIVE", totalQuantity: amount("2"), totalCostBasis: amount("100"), weightedAverageCost: amount("50"), currentPricePerUnit: amount("75"), currentMarketValue: amount("150") },
    });
    await tx.asset.create({ data: { householdId: household.id, name: "Synthetic asset", type: "OTHER", value: amount("10000") } });
    await tx.liability.create({ data: { householdId: household.id, name: "Synthetic liability", type: "OTHER", category: "OTHER", status: "ACTIVE", principalAmount: amount("2000"), outstandingAmount: amount("2000") } });
    const scenario = await tx.forecastScenario.create({ data: { householdId: household.id, name: "Synthetic recovery scenario", isDefault: true } });
    await tx.forecastMilestone.create({ data: { scenarioId: scenario.id, name: "Synthetic recovery milestone", targetYear: 2030, estimatedCost: amount("5000"), type: "EXPENSE" } });
    const ledgerDate = new Date("2026-09-10T00:00:00.000Z");
    await tx.transaction.create({
      data: { householdId: household.id, accountId: account.id, userId: user.id, incomeSourceId: incomeSource.id, amount: amount("100"), type: "INCOME", description: "Synthetic salary", date: ledgerDate, idempotencyKey: "recovery-fixture-income-100" },
    });
    await tx.transaction.create({
      data: { householdId: household.id, accountId: account.id, userId: user.id, incomeSourceId: incomeSource.id, occurrenceId: incomeOccurrence.id, amount: amount("40"), type: "INCOME", description: "Synthetic partial receipt", date: ledgerDate, idempotencyKey: "recovery-fixture-income-40" },
    });
    await tx.transaction.create({
      data: { householdId: household.id, accountId: account.id, userId: user.id, categoryId: expenseCategory.id, recurringRuleId: recurringRule.id, recurringOccurrenceId: billOccurrence.id, amount: amount("20"), type: "EXPENSE", description: "Synthetic bill payment", date: ledgerDate, idempotencyKey: "recovery-fixture-bill-20" },
    });
    await tx.transaction.create({
      data: { householdId: household.id, accountId: account.id, userId: user.id, amount: amount("30"), type: "EXPENSE", description: `Goal Savings Allocation: ${goal.name}`, tags: "savings-goal,allocation", date: ledgerDate, idempotencyKey: "recovery-fixture-goal-30" },
    });
    return { householdId: household.id, payslipId: payslip.id, accountId: account.id, scenarioId: scenario.id };
  });
  const [households, accounts, transactions, incomeSources, occurrences, bills, budgets, employments, payslips, goals, investments, assets, liabilities, scenarios, milestones] = await Promise.all([
    prisma.household.count(), prisma.account.count(), prisma.transaction.count(), prisma.incomeSource.count(), prisma.incomeOccurrence.count(),
    prisma.recurringBillOccurrence.count(), prisma.budget.count(), prisma.employmentProfile.count(), prisma.payslipRecord.count(),
    prisma.goal.count(), prisma.investment.count(), prisma.asset.count(), prisma.liability.count(), prisma.forecastScenario.count(), prisma.forecastMilestone.count(),
  ]);
  const summary = { households, accounts, transactions, incomeSources, incomeOccurrences: occurrences, billOccurrences: bills, budgets, employments, payslips, goals, investments, assets, liabilities, forecastScenarios: scenarios, forecastMilestones: milestones };
  const account = await prisma.account.findFirstOrThrow({ select: { id: true, balance: true } });
  const signedNet = await prisma.transaction.findMany({ select: { amount: true, type: true, accountId: true, transferAccountId: true } });
  const ledgerNet = signedNet.reduce((sum, row) => sum + (row.type === "INCOME" ? Number(row.amount) : row.type === "EXPENSE" ? -Number(row.amount) : 0), 0);
  if (Number(account.balance) !== 1090 || ledgerNet !== 90) throw new Error("Synthetic recovery fixture does not reconcile: expected account 1090, ledger net 90");
  console.log(JSON.stringify({ ...summary, accountBalance: Number(account.balance), ledgerNet, source: "synthetic only" }, null, 2));
} finally {
  await prisma.$disconnect();
}
}

void main();
