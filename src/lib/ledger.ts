import { Prisma } from "@prisma/client";

export async function debitAccountWithinLimit(
  tx: Prisma.TransactionClient,
  input: { accountId: string; householdId: string; amount: Prisma.Decimal },
) {
  const account = await tx.account.findFirst({
    where: { id: input.accountId, householdId: input.householdId, isArchived: false },
    select: { id: true, type: true, balance: true, creditLimit: true },
  });
  if (!account) throw new Error("ACCOUNT_UNAVAILABLE");

  // Credit balances are stored as negative outstanding debt. All other account types
  // may only be debited from a non-negative available balance.
  const minBalance = account.type === "CREDIT" && account.creditLimit
    ? Prisma.Decimal.sub(input.amount, account.creditLimit)
    : input.amount;
  const changed = await tx.account.updateMany({
    where: {
      id: account.id,
      householdId: input.householdId,
      isArchived: false,
      type: account.type,
      balance: { gte: minBalance },
      ...(account.type === "CREDIT" ? { creditLimit: account.creditLimit } : {}),
    },
    data: { balance: { decrement: input.amount } },
  });
  if (changed.count !== 1) throw new Error("INSUFFICIENT_FUNDS");
  return tx.account.findUniqueOrThrow({ where: { id: account.id } });
}
