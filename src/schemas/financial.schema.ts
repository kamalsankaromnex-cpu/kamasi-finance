import { z } from "zod";

export const PositiveDecimalSchema = z
  .union([z.number(), z.string()])
  .transform((val) => Number(val))
  .refine((val) => !isNaN(val) && val > 0, { message: "Amount must be a positive finite number" });

export const NonNegativeDecimalSchema = z
  .union([z.number(), z.string()])
  .transform((val) => Number(val))
  .refine((val) => !isNaN(val) && val >= 0, { message: "Amount must be non-negative" });

export const TransactionCreateSchema = z.object({
  accountId: z.string().uuid({ message: "Valid accountId is required" }),
  categoryId: z.string().uuid().optional().nullable(),
  date: z.string().optional(),
  amount: PositiveDecimalSchema,
  type: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
  transferAccountId: z.string().uuid().optional().nullable(),
  description: z.string().min(1, "Description is required").max(500),
  merchant: z.string().max(200).optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
  splitsJson: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  tags: z.string().max(200).optional().nullable(),
});

export const GoalContributionSchema = z.object({
  amount: PositiveDecimalSchema,
  accountId: z.string().uuid({ message: "Valid source accountId is required" }),
});

export const GoalWithdrawalSchema = z.object({
  amount: PositiveDecimalSchema,
  accountId: z.string().uuid({ message: "Valid destination accountId is required" }),
});

export const AccountUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(["BANK", "CREDIT", "INVESTMENT", "CASH", "LOAN"]).optional(),
  balance: z.union([z.number(), z.string()]).optional(),
  accountNumber: z.string().max(64).optional().nullable(),
  currency: z.string().length(3).optional(),
  isShared: z.boolean().optional(),
  creditLimit: NonNegativeDecimalSchema.optional().nullable(),
  billingCycleDay: z.number().int().min(1).max(31).optional().nullable(),
  paymentDueDate: z.number().int().min(1).max(31).optional().nullable(),
  interestRate: NonNegativeDecimalSchema.optional().nullable(),
  isArchived: z.boolean().optional(),
});

export const InvestmentActivitySchema = z.object({
  investmentId: z.string().uuid(),
  type: z.enum(["BUY", "SELL", "DIVIDEND"]),
  quantity: NonNegativeDecimalSchema,
  pricePerUnit: NonNegativeDecimalSchema,
  totalAmount: PositiveDecimalSchema,
  notes: z.string().optional().nullable(),
});

export const AssetValuationSchema = z.object({
  assetId: z.string().uuid(),
  value: PositiveDecimalSchema,
  notes: z.string().optional().nullable(),
});
