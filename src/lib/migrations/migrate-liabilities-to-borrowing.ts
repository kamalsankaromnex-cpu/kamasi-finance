import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface MigrationResult {
  householdId: string;
  totalLiabilitiesFound: number;
  migratedCount: number;
  skippedCount: number;
  totalPriorOutstanding: number;
  totalNewOutstanding: number;
  reconciliationValid: boolean;
  errors: string[];
}

/**
 * Migrate legacy Liability records to the production Borrowing model.
 * Invariants:
 * 1. Hard duplicate prevention: Borrowing.liabilityId is @unique.
 * 2. Idempotent: Skips liabilities that already have a linked Borrowing.
 * 3. Preserves authentic lifecycle status on legacy records without mutation.
 * 4. Verifies sum(old outstanding) === sum(new outstanding).
 */
export async function migrateLiabilitiesToBorrowing(householdId: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    householdId,
    totalLiabilitiesFound: 0,
    migratedCount: 0,
    skippedCount: 0,
    totalPriorOutstanding: 0,
    totalNewOutstanding: 0,
    reconciliationValid: false,
    errors: [],
  };

  const liabilities = await prisma.liability.findMany({
    where: { householdId },
    include: {
      financialEvents: true,
      borrowing: true,
    },
  });

  result.totalLiabilitiesFound = liabilities.length;

  for (const l of liabilities) {
    result.totalPriorOutstanding += Number(l.outstandingAmount);

    // Hard Duplicate Prevention & Idempotency: skip if already linked to Borrowing
    if (l.borrowing) {
      result.skippedCount++;
      result.totalNewOutstanding += Number(l.borrowing.outstandingPrincipal);
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Resolve or create Lender if lender name was provided
        let lenderId: string | null = null;
        if (l.lender && l.lender.trim()) {
          const lender = await tx.lender.upsert({
            where: {
              householdId_name: {
                householdId,
                name: l.lender.trim(),
              },
            },
            update: {},
            create: {
              householdId,
              name: l.lender.trim(),
              type: "BANK",
            },
          });
          lenderId = lender.id;
        }

        // Map status: keep exact authentic status
        const validStatuses = ["DRAFT", "ACTIVE", "PARTIALLY_SETTLED", "SETTLED", "CANCELLED", "ARCHIVED"];
        const borrowingStatus = validStatuses.includes(l.status) ? l.status : "ACTIVE";

        // Map borrowing type
        const typeMap: Record<string, string> = {
          MORTGAGE: "MORTGAGE",
          CAR_LOAN: "VEHICLE_LOAN",
          PERSONAL_LOAN: "PERSONAL_LOAN",
          EDUCATION_LOAN: "TERM_LOAN",
          CREDIT_CARD_DEBT: "LINE_OF_CREDIT",
          LOAN: "TERM_LOAN",
        };
        const borrowingType = typeMap[l.type] || typeMap[l.category] || "TERM_LOAN";

        // Create Borrowing record
        const borrowing = await tx.borrowing.create({
          data: {
            householdId,
            liabilityId: l.id,
            name: l.name,
            description: l.description || l.notes,
            borrowingType,
            financingType: l.category === "MORTGAGE" || l.type === "MORTGAGE" ? "SECURED" : "UNSECURED",
            repaymentMethod: "AMORTIZED_EMI",
            lenderId,
            scopeId: l.scopeId,
            costCenterId: l.costCenterId,
            liabilityAccountId: l.liabilityAccountId,
            disbursementJournalId: l.borrowJournalId,
            principalAmount: l.principalAmount,
            outstandingPrincipal: l.outstandingAmount,
            interestRate: l.interestRate,
            startDate: l.startDate,
            maturityDate: l.dueDate,
            status: borrowingStatus,
            archivedAt: l.archivedAt,
            archivedByUserId: l.archivedByUserId,
            createdAt: l.createdAt,
          },
        });

        // Migrate financial events referencing same journalId
        for (const evt of l.financialEvents) {
          const eventTypeMap: Record<string, string> = {
            BORROW: "DISBURSEMENT",
            REPAYMENT: "REPAYMENT",
            INTEREST_ACCRUED: "INTEREST_ACCRUED",
            SETTLEMENT: "SETTLEMENT",
          };
          const mappedEventType = eventTypeMap[evt.eventType] || "REPAYMENT";

          await tx.borrowingFinancialEvent.create({
            data: {
              householdId,
              borrowingId: borrowing.id,
              eventType: mappedEventType,
              principalAmount: evt.principalAmount,
              interestAmount: evt.interestAmount,
              totalAmount: evt.totalAmount.gt(0) ? evt.totalAmount : evt.principalAmount.add(evt.interestAmount),
              journalId: evt.journalId,
              effectiveDate: evt.effectiveDate,
              reason: evt.reason,
              idempotencyKey: evt.idempotencyKey ? `migrated_${evt.idempotencyKey}` : null,
              createdByUserId: evt.createdByUserId,
              createdAt: evt.createdAt,
            },
          });
        }

        // Record initial lifecycle history
        await tx.borrowingLifecycleHistory.create({
          data: {
            householdId,
            borrowingId: borrowing.id,
            fromStatus: "NONE",
            toStatus: borrowingStatus,
            action: "migration",
            reason: `Migrated from legacy Liability ${l.id}`,
            performedBy: "MIGRATION_JOB",
          },
        });

        result.migratedCount++;
        result.totalNewOutstanding += Number(borrowing.outstandingPrincipal);
      });
    } catch (err: any) {
      result.errors.push(`Error migrating liability ${l.id} (${l.name}): ${err.message}`);
    }
  }

  // Reconciliation Invariant Verification:
  // sum(Old Outstanding) === sum(New Outstanding)
  const diff = Math.abs(result.totalPriorOutstanding - result.totalNewOutstanding);
  result.reconciliationValid = diff < 0.01;

  return result;
}
