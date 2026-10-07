import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import { formatINR } from "./currency";

/**
 * Validates condition and action JSON schemas before saving rules.
 */
export function validateRuleJson(conditionJsonStr: string, actionJsonStr: string): { valid: boolean; error?: string } {
  try {
    const condition = JSON.parse(conditionJsonStr);
    const action = JSON.parse(actionJsonStr);
    if (typeof condition !== "object" || typeof action !== "object") {
      return { valid: false, error: "Condition and Action must be JSON objects" };
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: `Invalid JSON format: ${err.message}` };
  }
}

/**
 * Deterministically auto-categorizes a newly created transaction based on exact match or safe contains rules.
 */
export async function autoCategorizeTransaction(transactionId: string, householdId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, householdId },
  });

  if (!transaction || transaction.categoryId || transaction.isVoided) {
    return null; // Already categorized or voided
  }

  const rules = await prisma.automationRule.findMany({
    where: {
      householdId,
      triggerType: "TRANSACTION_CREATED",
      actionType: "CATEGORIZE_TRANSACTION",
      isActive: true,
    },
  });

  const searchSubject = `${transaction.description} ${transaction.merchant || ""}`.toLowerCase();

  for (const rule of rules) {
    try {
      const condition = JSON.parse(rule.conditionJson);
      const action = JSON.parse(rule.actionJson);

      let matched = false;

      if (condition.merchantEquals && searchSubject.trim() === condition.merchantEquals.toLowerCase().trim()) {
        matched = true;
      } else if (condition.merchantContains && searchSubject.includes(condition.merchantContains.toLowerCase().trim())) {
        matched = true;
      }

      if (matched && action.setCategoryId) {
        const targetCategory = await prisma.category.findFirst({
          where: { id: action.setCategoryId, householdId },
        });

        if (targetCategory) {
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: { categoryId: targetCategory.id },
          });

          const log = await prisma.automationExecutionLog.create({
            data: {
              householdId,
              ruleId: rule.id,
              ruleVersionSnap: rule.ruleVersion,
              triggerType: "TRANSACTION_CREATED",
              status: "SUCCESS",
              details: `Auto-categorized transaction '${transaction.description}' (${formatINR(Number(transaction.amount))}) as '${targetCategory.name}'`,
            },
          });

          await prisma.automationRule.update({
            where: { id: rule.id },
            data: { lastRunAt: new Date() },
          });

          return log;
        }
      }
    } catch (err) {
      console.error(`Failed to process rule ${rule.id}:`, err);
    }
  }

  return null;
}

/**
 * Predicts category ID for a description string using active pattern rules.
 */
export async function predictCategoryByRules(householdId: string, description: string): Promise<string | null> {
  const rules = await prisma.automationRule.findMany({
    where: {
      householdId,
      triggerType: "TRANSACTION_CREATED",
      actionType: "CATEGORIZE_TRANSACTION",
      isActive: true,
    },
  });

  const searchSubject = description.toLowerCase();

  for (const rule of rules) {
    try {
      const condition = JSON.parse(rule.conditionJson);
      const action = JSON.parse(rule.actionJson);

      let matched = false;
      if (condition.merchantEquals && searchSubject.trim() === condition.merchantEquals.toLowerCase().trim()) {
        matched = true;
      } else if (condition.merchantContains && searchSubject.includes(condition.merchantContains.toLowerCase().trim())) {
        matched = true;
      }

      if (matched && action.setCategoryId) {
        return action.setCategoryId;
      }
    } catch {
      // Ignore invalid rule JSON
    }
  }

  return null;
}

/**
 * Checks budget threshold alerts (e.g. 80% or 100%) for current month.
 * Uses alertKey to ensure alerts trigger ONLY ONCE per category/period/threshold.
 */
export async function checkBudgetThresholds(householdId: string) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const budgets = await prisma.budget.findMany({
    where: { householdId, month, year },
    include: { category: true },
  });

  const transactions = await prisma.transaction.findMany({
    where: {
      householdId,
      type: "EXPENSE",
      isVoided: false,
    },
    select: { categoryId: true, amount: true, date: true, refundOfId: true },
  });

  const currentTxns = transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });

  const generatedLogs: string[] = [];

  for (const b of budgets) {
    if (!b.categoryId) continue;

    const catTxns = currentTxns.filter((t) => t.categoryId === b.categoryId);
    const grossSpent = catTxns.filter((t) => !t.refundOfId).reduce((acc, t) => acc + Number(t.amount), 0);
    const refunds = catTxns.filter((t) => t.refundOfId).reduce((acc, t) => acc + Number(t.amount), 0);
    const netSpent = grossSpent - refunds;
    const limit = Number(b.amount);

    if (limit <= 0) continue;

    const utilPct = (netSpent / limit) * 100;

    const thresholdsToTest = [
      { pct: 100, label: "100% Exceeded" },
      { pct: 80, label: "80% Warning" },
    ];

    for (const t of thresholdsToTest) {
      if (utilPct >= t.pct) {
        const alertKey = `ALERT:${householdId}:${b.categoryId}:${year}-${month}:${t.pct}`;

        const existingAlert = await prisma.automationExecutionLog.findUnique({
          where: { alertKey },
        });

        if (!existingAlert) {
          const catName = b.category?.name || "Category";
          await prisma.automationExecutionLog.create({
            data: {
              householdId,
              alertKey,
              triggerType: "BUDGET_THRESHOLD",
              status: "SUCCESS",
              details: `Budget Threshold Alert: '${catName}' spending (${formatINR(netSpent)}) reached ${Math.round(utilPct)}% of ₹${limit} limit (${t.label}).`,
            },
          });
          generatedLogs.push(alertKey);
        }
      }
    }
  }

  return generatedLogs;
}

/**
 * Scans transactions and flags potential duplicates for manual review.
 * NEVER deletes or blocks transactions automatically!
 */
export async function detectDuplicateTransactions(householdId: string) {
  const transactions = await prisma.transaction.findMany({
    where: { householdId, isVoided: false },
    orderBy: { date: "desc" },
    take: 100,
    include: { account: { select: { name: true } } },
  });

  const groups: Record<string, typeof transactions> = {};

  for (const t of transactions) {
    const dayStr = t.date.toISOString().slice(0, 10);
    const amtStr = t.amount.toString();
    const key = `${t.accountId}:${amtStr}:${dayStr}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  const flagged: string[] = [];

  for (const [groupKey, items] of Object.entries(groups)) {
    if (items.length > 1) {
      const alertKey = `DUP:${householdId}:${groupKey}`;
      const existing = await prisma.automationExecutionLog.findUnique({
        where: { alertKey },
      });

      if (!existing) {
        const itemIds = items.map((i) => i.id).join(", ");
        const first = items[0];
        await prisma.automationExecutionLog.create({
          data: {
            householdId,
            alertKey,
            triggerType: "DUPLICATE_DETECTION",
            status: "PENDING_REVIEW",
            details: `Candidate Duplicate: Found ${items.length} identical transactions of ${formatINR(Number(first.amount))} on account '${first.account.name}' on ${first.date.toISOString().slice(0, 10)}. IDs: ${itemIds}`,
          },
        });
        flagged.push(alertKey);
      }
    }
  }

  return flagged;
}

/**
 * Main execution trigger for a household's deterministic automations.
 */
export async function runHouseholdAutomations(householdId: string) {
  const alerts = await checkBudgetThresholds(householdId);
  const duplicates = await detectDuplicateTransactions(householdId);
  return { alertsCount: alerts.length, duplicatesCount: duplicates.length };
}
