import Papa from "papaparse";

export interface CSVTransactionRow {
  date: string;
  description: string;
  amount: string | number;
  type?: "INCOME" | "EXPENSE" | "TRANSFER";
  category?: string;
  account?: string;
  notes?: string;
  tags?: string;
}

export interface CSVParseResult {
  data: CSVTransactionRow[];
  errors: string[];
}

export function parseTransactionCSV(csvContent: string): CSVParseResult {
  const result = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const errors: string[] = [];
  const parsedData: CSVTransactionRow[] = [];

  if (result.errors) {
    result.errors.forEach((err: { row?: number; message: string }) => {
      errors.push(`Line ${err.row ?? 'unknown'}: ${err.message}`);
    });
  }

  if (result.data) {
    result.data.forEach((row: Record<string, string>, idx: number) => {
      const dateKey = Object.keys(row).find((k) => /date/i.test(k)) || "date";
      const descKey = Object.keys(row).find((k) => /desc|narration|payee|title|details/i.test(k)) || "description";
      const amountKey = Object.keys(row).find((k) => /amount|val|price|sum/i.test(k)) || "amount";
      const typeKey = Object.keys(row).find((k) => /type|kind|direction/i.test(k));
      const categoryKey = Object.keys(row).find((k) => /category|cat/i.test(k));
      const accountKey = Object.keys(row).find((k) => /account|acc/i.test(k));
      const notesKey = Object.keys(row).find((k) => /note|memo|remark/i.test(k));
      const tagsKey = Object.keys(row).find((k) => /tag/i.test(k));

      const rawDate = row[dateKey];
      const rawDesc = row[descKey];
      const rawAmount = row[amountKey];

      if (!rawDate || !rawDesc || rawAmount === undefined) {
        errors.push(`Row ${idx + 2}: Missing required fields (date, description, or amount)`);
        return;
      }

      const cleanAmount = parseFloat(String(rawAmount).replace(/[^0-9.-]+/g, ""));
      if (isNaN(cleanAmount)) {
        errors.push(`Row ${idx + 2}: Invalid numeric amount "${rawAmount}"`);
        return;
      }

      let type: "INCOME" | "EXPENSE" | "TRANSFER" = "EXPENSE";
      if (typeKey && row[typeKey]) {
        const upper = row[typeKey].toUpperCase();
        if (upper.includes("INC") || upper.includes("CR") || upper.includes("CREDIT")) type = "INCOME";
        else if (upper.includes("TRANS")) type = "TRANSFER";
      } else {
        if (cleanAmount > 0) type = "INCOME";
      }

      parsedData.push({
        date: new Date(rawDate).toISOString(),
        description: rawDesc.trim(),
        amount: Math.abs(cleanAmount),
        type,
        category: categoryKey ? row[categoryKey] : undefined,
        account: accountKey ? row[accountKey] : undefined,
        notes: notesKey ? row[notesKey] : undefined,
        tags: tagsKey ? row[tagsKey] : undefined,
      });
    });
  }

  return { data: parsedData, errors };
}

export function exportToCSV(data: Record<string, unknown>[], filename: string): void {
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
