import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Normalizes a date to UTC Midnight (00:00:00.000Z) to prevent timezone/time variance duplicates.
 */
export function normalizeToUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Calculates the next due date for a recurring schedule.
 * Handles month-end boundaries (29th, 30th, 31st) and leap years safely.
 * Returns date normalized to UTC midnight.
 */
export function getNextDueDate(currentDueDate: Date, frequency: string, targetDay?: number): Date {
  const next = new Date(currentDueDate);
  const freq = frequency.toUpperCase();

  if (freq === "DAILY") {
    next.setUTCDate(next.getUTCDate() + 1);
  } else if (freq === "WEEKLY") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else if (freq === "MONTHLY") {
    const desiredDay = targetDay ?? currentDueDate.getUTCDate();
    next.setUTCMonth(next.getUTCMonth() + 1, 1); // Move to 1st of next month
    const maxDaysInNextMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(desiredDay, maxDaysInNextMonth));
  } else if (freq === "YEARLY") {
    const year = next.getUTCFullYear() + 1;
    const month = next.getUTCMonth();
    const day = targetDay ?? next.getUTCDate();
    const maxDaysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    next.setUTCFullYear(year, month, Math.min(day, maxDaysInMonth));
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }

  return normalizeToUtcMidnight(next);
}

/**
 * Idempotent occurrence generator for active recurring transactions.
 * Scoped by household if specified. Generates occurrences up to cut-off date (default now).
 * All due dates are normalized to UTC midnight.
 */
export async function generatePendingOccurrences(
  prisma: PrismaClient | Prisma.TransactionClient,
  options?: { householdId?: string; cutOffDate?: Date }
) {
  const cutOff = normalizeToUtcMidnight(options?.cutOffDate ?? new Date());
  const whereClause: Prisma.RecurringTransactionWhereInput = {
    isActive: true,
    nextDueDate: { lte: cutOff },
    ...(options?.householdId ? { householdId: options.householdId } : {}),
  };

  const activeRules = await prisma.recurringTransaction.findMany({
    where: whereClause,
  });

  const generated: string[] = [];

  for (const rule of activeRules) {
    let currentDueDate = normalizeToUtcMidnight(new Date(rule.nextDueDate));
    const targetDay = rule.startDate.getUTCDate();

    while (currentDueDate <= cutOff) {
      if (rule.endDate && currentDueDate > normalizeToUtcMidnight(rule.endDate)) {
        await prisma.recurringTransaction.update({
          where: { id: rule.id },
          data: { isActive: false },
        });
        break;
      }

      // Upsert occurrence idempotently using composite unique constraint [recurringRuleId, dueDate]
      const occurrenceName = `${rule.name} - ${currentDueDate.toISOString().slice(0, 10)}`;
      await prisma.recurringBillOccurrence.upsert({
        where: {
          recurringRuleId_dueDate: {
            recurringRuleId: rule.id,
            dueDate: currentDueDate,
          },
        },
        create: {
          householdId: rule.householdId,
          recurringRuleId: rule.id,
          name: occurrenceName,
          dueDate: currentDueDate,
          expectedAmount: rule.amount,
          outstandingAmount: rule.amount,
          status: "UPCOMING",
        },
        update: {}, // Existing occurrence untouched (preserves payment status)
      });

      generated.push(`${rule.id}:${currentDueDate.toISOString()}`);
      currentDueDate = getNextDueDate(currentDueDate, rule.frequency, targetDay);
    }

    if (currentDueDate.getTime() !== rule.nextDueDate.getTime()) {
      await prisma.recurringTransaction.update({
        where: { id: rule.id },
        data: { nextDueDate: currentDueDate },
      });
    }
  }

  // Credit Card Billing Cycle Statement Reminder Generation
  const creditCards = await prisma.account.findMany({
    where: {
      type: "CREDIT",
      isArchived: false,
      billingCycleDay: { not: null },
      ...(options?.householdId ? { householdId: options.householdId } : {}),
    },
  });

  const now = new Date();
  for (const card of creditCards) {
    if (!card.billingCycleDay) continue;
    const currentMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(card.billingCycleDay, 28)));
    const normalizedDue = normalizeToUtcMidnight(currentMonthDate);

    let cardRule = await prisma.recurringTransaction.findFirst({
      where: { householdId: card.householdId, accountId: card.id, name: `Credit Card Bill: ${card.name}` },
    });
    if (!cardRule) {
      cardRule = await prisma.recurringTransaction.create({
        data: {
          householdId: card.householdId,
          accountId: card.id,
          name: `Credit Card Bill: ${card.name}`,
          amount: card.balance,
          type: "EXPENSE",
          frequency: "MONTHLY",
          nextDueDate: normalizedDue,
        },
      });
    }

    await prisma.recurringBillOccurrence.upsert({
      where: {
        recurringRuleId_dueDate: {
          recurringRuleId: cardRule.id,
          dueDate: normalizedDue,
        },
      },
      create: {
        householdId: card.householdId,
        recurringRuleId: cardRule.id,
        name: `Statement Due: ${card.name}`,
        dueDate: normalizedDue,
        expectedAmount: card.balance,
        outstandingAmount: card.balance,
        status: "UPCOMING",
      },
      update: {
        expectedAmount: card.balance,
      },
    });
  }

  return { count: generated.length, occurrences: generated };
}
