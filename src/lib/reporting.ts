export interface LedgerReportRow {
  date: string | Date;
  amount: string | number;
  type: string;
  isVoided?: boolean;
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
      if (row.type === "INCOME") totals.income += amount;
      if (row.type === "EXPENSE") totals.expenses += amount;
      return totals;
    },
    { income: 0, expenses: 0 },
  );
}
