export interface LedgerReportRow {
  date: string | Date;
  amount: string | number;
  type: string;
  isVoided?: boolean;
  refundOfId?: string | null;
  refundedAmount?: string | number | null;
}

export function summarizeMonth(rows: LedgerReportRow[], year: number, monthIndex: number) {
  return rows.reduce(
    (totals, row) => {
      const date = new Date(row.date);
      const amount = Number(row.amount);
      if (
        !Number.isFinite(amount) ||
        date.getFullYear() !== year ||
        date.getMonth() !== monthIndex ||
        row.isVoided || row.type === "VOIDED"
      ) return totals;

      // Exclude refund income transactions from gross income (refunds reduce expenses, never income)
      if (row.type === "INCOME" && !row.refundOfId) {
        totals.income += amount;
      }

      // Net out any recorded refunds from expense transactions
      if (row.type === "EXPENSE") {
        const refunded = Number(row.refundedAmount || 0);
        const netExpense = Math.max(0, amount - (Number.isFinite(refunded) ? refunded : 0));
        totals.expenses += netExpense;
      }

      return totals;
    },
    { income: 0, expenses: 0 },
  );
}
