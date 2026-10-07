import { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface CrossModuleIntegrityReport {
  timestamp: string;
  isHealthy: boolean;
  totalViolations: number;
  violations: {
    type: string;
    entity: string;
    entityId: string;
    householdId?: string;
    details: string;
  }[];
}

export class CrossModuleIntegrityService {
  /**
   * Scans cross-module relationships, foreign keys, lifecycle dependencies,
   * household boundaries, and orphan records across all financial entities.
   */
  static async scanIntegrity(
    db: PrismaClient | Prisma.TransactionClient = prisma
  ): Promise<CrossModuleIntegrityReport> {
    const violations: CrossModuleIntegrityReport["violations"] = [];

    // 1. Transactions without Journal (posted/reconciled transactions must have a posted Journal)
    const transactions = await db.transaction.findMany({
      where: { status: { in: ["POSTED", "RECONCILED"] } },
      select: { id: true, householdId: true, journalId: true, type: true, status: true },
    });

    for (const t of transactions) {
      if (!t.journalId) {
        violations.push({
          type: "ORPHAN_TRANSACTION_NO_JOURNAL",
          entity: "Transaction",
          entityId: t.id,
          householdId: t.householdId,
          details: `Transaction ${t.id} has status ${t.status} but missing journalId`,
        });
      } else {
        const j = await db.journal.findUnique({ where: { id: t.journalId } });
        if (!j) {
          violations.push({
            type: "MISSING_JOURNAL_RECORD",
            entity: "Transaction",
            entityId: t.id,
            householdId: t.householdId,
            details: `Transaction ${t.id} points to non-existent journal ${t.journalId}`,
          });
        } else if (j.householdId !== t.householdId) {
          violations.push({
            type: "CROSS_HOUSEHOLD_LEAK",
            entity: "Transaction",
            entityId: t.id,
            householdId: t.householdId,
            details: `Transaction household ${t.householdId} differs from journal household ${j.householdId}`,
          });
        }
      }
    }

    // 2. JournalEntry -> Account cross-household leak
    const journalEntries = await db.journalEntry.findMany({
      include: {
        journal: { select: { householdId: true } },
        account: { select: { householdId: true } },
      },
    });

    for (const je of journalEntries) {
      if (je.journal && je.account && je.journal.householdId !== je.account.householdId) {
        violations.push({
          type: "CROSS_HOUSEHOLD_LEAK",
          entity: "JournalEntry",
          entityId: je.id,
          householdId: je.journal.householdId,
          details: `JournalEntry ${je.id} links journal in ${je.journal.householdId} with account in ${je.account.householdId}`,
        });
      }
    }

    // 3. InvestmentFinancialEvent reversal lineage
    const reversedInvEvents = await db.investmentFinancialEvent.findMany({
      where: { isReversed: true },
    });

    for (const revEvt of reversedInvEvents) {
      const compensating = await db.investmentFinancialEvent.findFirst({
        where: { reversalOfEventId: revEvt.id },
      });
      if (!compensating) {
        violations.push({
          type: "BROKEN_REVERSAL_LINEAGE",
          entity: "InvestmentFinancialEvent",
          entityId: revEvt.id,
          householdId: revEvt.householdId,
          details: `Event ${revEvt.id} marked isReversed=true but no compensating event references it`,
        });
      }
    }

    // 4. BorrowingFinancialEvent reversal lineage
    const reversedBorrowingEvents = await db.borrowingFinancialEvent.findMany({
      where: { isReversed: true },
    });

    for (const revEvt of reversedBorrowingEvents) {
      const compensating = await db.borrowingFinancialEvent.findFirst({
        where: { reversalOfEventId: revEvt.id },
      });
      if (!compensating) {
        violations.push({
          type: "BROKEN_REVERSAL_LINEAGE",
          entity: "BorrowingFinancialEvent",
          entityId: revEvt.id,
          householdId: revEvt.householdId,
          details: `Borrowing event ${revEvt.id} is reversed but missing compensating reversal event`,
        });
      }
    }

    // 5. Goal Funding Plans without Goal
    const fundingPlans = await db.goalFundingPlan.findMany({
      select: { id: true, goalId: true, householdId: true },
    });

    for (const fp of fundingPlans) {
      const g = await db.goal.findUnique({ where: { id: fp.goalId } });
      if (!g) {
        violations.push({
          type: "ORPHAN_GOAL_FUNDING_PLAN",
          entity: "GoalFundingPlan",
          entityId: fp.id,
          householdId: fp.householdId,
          details: `GoalFundingPlan ${fp.id} references non-existent goal ${fp.goalId}`,
        });
      } else if (g.householdId !== fp.householdId) {
        violations.push({
          type: "CROSS_HOUSEHOLD_LEAK",
          entity: "GoalFundingPlan",
          entityId: fp.id,
          householdId: fp.householdId,
          details: `GoalFundingPlan household ${fp.householdId} differs from goal household ${g.householdId}`,
        });
      }
    }

    // 6. Universal Classification scope references
    const scopeCategories = await db.scopeCategory.findMany({
      include: {
        scope: { select: { id: true, householdId: true } },
        category: { select: { id: true, householdId: true } },
      },
    });

    for (const sc of scopeCategories) {
      if (sc.scope.householdId !== sc.category.householdId) {
        violations.push({
          type: "CROSS_HOUSEHOLD_LEAK",
          entity: "ScopeCategory",
          entityId: sc.id,
          householdId: sc.scope.householdId,
          details: `ScopeCategory ${sc.id} links scope in ${sc.scope.householdId} with category in ${sc.category.householdId}`,
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      isHealthy: violations.length === 0,
      totalViolations: violations.length,
      violations,
    };
  }
}
