import { prisma } from "./prisma";
import { parseTransactionCSV } from "./csv";
import { predictCategoryByRules } from "./automations";
import { FinancialCommand } from "@/finance/financial-command";
import { Prisma } from "@prisma/client";

export interface ProcessedCsvRow {
  rowId: string;
  date: string;
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  accountId: string;
  transferAccountId?: string | null;
  categoryId: string | null;
  categoryName: string | null;
  notes?: string;
  tags?: string;
  isDuplicate: boolean;
  duplicateReason?: string;
  status: "VALID" | "DUPLICATE" | "INVALID";
  errorMessage?: string;
}

export interface CsvImportPreview {
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  rows: ProcessedCsvRow[];
  errors: string[];
}

export async function previewCsvImport(
  householdId: string,
  defaultAccountId: string,
  csvContent: string,
): Promise<CsvImportPreview> {
  const parseResult = parseTransactionCSV(csvContent);
  const errors: string[] = [...parseResult.errors];

  // Fetch household categories & account
  const [categories, existingTxns] = await Promise.all([
    prisma.category.findMany({ where: { householdId } }),
    prisma.transaction.findMany({
      where: { householdId, isVoided: false },
      select: { id: true, accountId: true, amount: true, date: true, description: true },
    }),
  ]);

  const rows: ProcessedCsvRow[] = [];
  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  for (let idx = 0; idx < parseResult.data.length; idx++) {
    const raw = parseResult.data[idx];
    const rowId = `row-${idx + 1}`;

    const numAmount = typeof raw.amount === "number" ? raw.amount : parseFloat(raw.amount) || 0;
    const rowType: "INCOME" | "EXPENSE" | "TRANSFER" = raw.type || "EXPENSE";

    // Validate amount
    if (isNaN(numAmount) || numAmount <= 0) {
      invalidCount++;
      rows.push({
        rowId,
        date: raw.date,
        description: raw.description,
        amount: numAmount,
        type: rowType,
        accountId: defaultAccountId,
        categoryId: null,
        categoryName: null,
        status: "INVALID",
        isDuplicate: false,
        errorMessage: "Invalid or zero transaction amount",
      });
      continue;
    }

    // Try auto-categorization or category name match
    let categoryId: string | null = null;
    let categoryName: string | null = null;

    if (raw.category) {
      const match = categories.find(
        (c) => c.name.toLowerCase() === raw.category?.toLowerCase(),
      );
      if (match) {
        categoryId = match.id;
        categoryName = match.name;
      }
    }

    if (!categoryId) {
      const autoCatId = await predictCategoryByRules(householdId, raw.description);
      if (autoCatId) {
        const cat = categories.find((c) => c.id === autoCatId);
        if (cat) {
          categoryId = cat.id;
          categoryName = cat.name;
        }
      }
    }

    // Check duplicate (same account, same amount, same date string YYYY-MM-DD)
    const rawDateStr = new Date(raw.date).toISOString().slice(0, 10);
    const duplicateMatch = existingTxns.find((t) => {
      const tDateStr = new Date(t.date).toISOString().slice(0, 10);
      return (
        t.accountId === defaultAccountId &&
        tDateStr === rawDateStr &&
        Math.abs(Number(t.amount) - numAmount) < 0.01
      );
    });

    const isDuplicate = !!duplicateMatch;
    const status: "VALID" | "DUPLICATE" | "INVALID" = isDuplicate ? "DUPLICATE" : "VALID";

    if (isDuplicate) duplicateCount++;
    else validCount++;

    rows.push({
      rowId,
      date: raw.date,
      description: raw.description,
      amount: numAmount,
      type: rowType,
      accountId: defaultAccountId,
      categoryId,
      categoryName,
      notes: raw.notes,
      tags: raw.tags,
      isDuplicate,
      duplicateReason: isDuplicate ? `Potential duplicate of existing transaction on ${rawDateStr}` : undefined,
      status,
    });
  }

  return {
    totalRows: parseResult.data.length,
    validCount,
    duplicateCount,
    invalidCount,
    rows,
    errors,
  };
}

export async function commitCsvImport(
  householdId: string,
  userId: string,
  selectedRows: ProcessedCsvRow[],
): Promise<{ postedCount: number; skippedCount: number; errors: string[] }> {
  let postedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (const row of selectedRows) {
    if (row.status === "INVALID") {
      skippedCount++;
      errors.push(`Skipped invalid row: ${row.description}`);
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const numAmount = typeof row.amount === "number" ? row.amount : parseFloat(String(row.amount)) || 0;
        const decAmount = new Prisma.Decimal(numAmount);
        const rowDate = new Date(row.date);

        // Single-path financial posting via FinancialCommand
        let journal;
        switch (row.type) {
          case "INCOME":
            journal = await FinancialCommand.postIncome(tx, {
              householdId,
              accountId: row.accountId,
              amount: decAmount,
              description: `CSV Import Income: ${row.description}`,
              categoryId: row.categoryId,
              date: rowDate,
            });
            break;

          case "EXPENSE":
            journal = await FinancialCommand.postExpense(tx, {
              householdId,
              accountId: row.accountId,
              amount: decAmount,
              description: `CSV Import Expense: ${row.description}`,
              categoryId: row.categoryId,
              date: rowDate,
            });
            break;

          case "TRANSFER":
            if (!row.transferAccountId) {
              throw new Error("DESTINATION_ACCOUNT_REQUIRED: Transfer row requires a destination account");
            }
            journal = await FinancialCommand.postTransfer(tx, {
              householdId,
              sourceAccountId: row.accountId,
              destinationAccountId: row.transferAccountId,
              amount: decAmount,
              description: `CSV Import Transfer: ${row.description}`,
              date: rowDate,
            });
            break;

          default:
            throw new Error(`UNSUPPORTED_TRANSACTION_TYPE: ${row.type}`);
        }

        await tx.transaction.create({
          data: {
            householdId,
            accountId: row.accountId,
            transferAccountId: row.transferAccountId || null,
            categoryId: row.categoryId || null,
            userId,
            date: rowDate,
            amount: decAmount,
            type: row.type,
            description: row.description,
            notes: row.notes || null,
            tags: row.tags || "csv-import",
            journalId: journal.id,
          },
        });
      });
      postedCount++;
    } catch (err: any) {
      skippedCount++;
      errors.push(`Failed to post ${row.description}: ${err?.message || "Error"}`);
    }
  }

  return { postedCount, skippedCount, errors };
}
