import { z } from "zod";

export const positiveAmountSchema = z
  .union([z.number(), z.string()])
  .transform((val) => (typeof val === "number" ? val : parseFloat(String(val))))
  .refine((val) => !isNaN(val) && isFinite(val) && val > 0, {
    message: "Amount must be a positive number greater than 0",
  });

export const nonNegativeAmountSchema = z
  .union([z.number(), z.string()])
  .transform((val) => (typeof val === "number" ? val : parseFloat(String(val))))
  .refine((val) => !isNaN(val) && isFinite(val) && val >= 0, {
    message: "Amount must be a non-negative number",
  });

export const transactionSchema = z
  .object({
    accountId: z.string().min(1, "Payment Account is required"),
    categoryId: z.string().optional().nullable(),
    transferAccountId: z.string().optional().nullable(),
    amount: positiveAmountSchema,
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
    description: z.string().trim().min(1, "Description is required").max(255, "Description cannot exceed 255 characters"),
    date: z.union([z.string(), z.date()]).optional(),
    merchant: z.string().optional().nullable(),
    receiptUrl: z.string().optional().nullable(),
    splitsJson: z.string().optional().nullable(),
    reimbursementStatus: z.enum(["NONE", "CLAIMED", "SETTLED"]).optional(),
    notes: z.string().optional().nullable(),
    tags: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.type === "TRANSFER") {
        return !!data.transferAccountId && data.transferAccountId !== data.accountId;
      }
      return true;
    },
    {
      message: "Transfer requires a distinct destination account different from the source account",
      path: ["transferAccountId"],
    }
  );

export const accountSchema = z
  .object({
    name: z.string().trim().min(1, "Account Name is required").max(100, "Account Name cannot exceed 100 characters"),
    type: z.enum(["BANK", "CREDIT", "CASH", "INVESTMENT", "LOAN"]),
    balance: z
      .union([z.number(), z.string()])
      .transform((val) => (typeof val === "number" ? val : parseFloat(String(val))))
      .refine((val) => !isNaN(val) && isFinite(val), { message: "Balance must be a valid number" }),
    creditLimit: z
      .union([z.number(), z.string()])
      .optional()
      .nullable()
      .transform((val) => (val === null || val === undefined || val === "" ? null : typeof val === "number" ? val : parseFloat(String(val)))),
    currency: z.string().default("INR"),
    isShared: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.type === "CREDIT" && data.creditLimit !== null) {
        return !isNaN(data.creditLimit) && data.creditLimit >= 0;
      }
      return true;
    },
    { message: "Credit limit must be a non-negative number for Credit Accounts", path: ["creditLimit"] }
  );

export const budgetSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  amount: positiveAmountSchema,
  categoryId: z.string().min(1, "Category is required"),
});

export const billSchema = z.object({
  name: z.string().trim().min(1, "Bill Name is required"),
  amount: positiveAmountSchema,
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  accountId: z.string().min(1, "Payment Account is required"),
  categoryId: z.string().optional().nullable(),
  startDate: z.union([z.string(), z.date()]).optional(),
});

export const goalSchema = z.object({
  name: z.string().trim().min(1, "Goal Name is required"),
  targetAmount: positiveAmountSchema,
  targetDate: z.union([z.string(), z.date()]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export const assetSchema = z.object({
  name: z.string().trim().min(1, "Asset Name is required"),
  type: z.string().default("OTHER"),
  value: positiveAmountSchema,
});

export const liabilitySchema = z.object({
  name: z.string().trim().min(1, "Liability Name is required"),
  type: z.string().default("OTHER"),
  amount: positiveAmountSchema,
  interestRate: nonNegativeAmountSchema.optional().nullable(),
  monthlyPayment: nonNegativeAmountSchema.optional().nullable(),
});

export const automationRuleSchema = z.object({
  name: z.string().trim().min(1, "Rule Name is required"),
  triggerType: z.enum(["TRANSACTION_CREATED", "SCHEDULED_CRON", "BUDGET_THRESHOLD", "RECURRING_DUE"]),
  conditionJson: z.string().min(1, "Condition JSON is required"),
  actionType: z.enum(["CATEGORIZE_TRANSACTION", "GENERATE_ALERT", "FLAG_DUPLICATE"]),
  actionJson: z.string().min(1, "Action JSON is required"),
});
