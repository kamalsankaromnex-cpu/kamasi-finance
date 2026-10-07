import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { maskAccountNumber, parseFiniteMoney, parseIsoDate, parseNonNegativeMoney } from "@/lib/financial-validation";
import { FinancialCommand } from "@/finance/financial-command";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const account = await prisma.account.findFirst({
      where: { id, householdId: session.householdId, OR: [{ isShared: true }, { userId: session.id }] },
      include: {
        userHolder: { select: { id: true, name: true, avatarUrl: true } },
        financialInstitution: { select: { id: true, name: true, shortCode: true, logoUrl: true } },
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json(maskAccountNumber(account));
  } catch (error) {
    console.error("Failed to fetch account:", error);
    return NextResponse.json({ error: "Failed to fetch account" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid account payload" }, { status: 400 });
    const {
      name,
      type,
      balance,
      accountNumber,
      currency,
      isShared,
      financialInstitutionId,
      logoMode,
      customLogoUrl,
      iconName,
      creditLimit,
      billingCycleDay,
      paymentDueDate,
      interestRate,
      maturityDate,
      isArchived,
    } = body as Record<string, unknown>;

    // IDOR Check
    const existing = await prisma.account.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (!existing.isShared && existing.userId !== session.id) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const hasLedgerActivity = (await prisma.journalEntry.count({
      where: { accountId: id },
    })) > 0;

    const updateData: Prisma.AccountUpdateInput = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 120) return NextResponse.json({ error: "Account name must be 1–120 characters" }, { status: 400 });
      updateData.name = name.trim();
    }
    if (type !== undefined) {
      if (typeof type !== "string" || !["BANK", "CREDIT", "INVESTMENT", "CASH", "LOAN"].includes(type)) return NextResponse.json({ error: "Invalid account type" }, { status: 400 });
      if (type !== existing.type && hasLedgerActivity) {
        return NextResponse.json({ error: "Account type cannot be changed after financial activity exists. Create a replacement account instead." }, { status: 400 });
      }
      updateData.type = type;
    }
    let requestedBalance: Prisma.Decimal | null = null;
    if (balance !== undefined) {
      requestedBalance = parseFiniteMoney(balance);
      if (!requestedBalance) return NextResponse.json({ error: "Account balance must be a finite decimal" }, { status: 400 });
    }
    if (accountNumber !== undefined) {
      if (accountNumber !== null && (typeof accountNumber !== "string" || accountNumber.length > 64 || /[\r\n]/.test(accountNumber))) return NextResponse.json({ error: "Account number is invalid" }, { status: 400 });
      updateData.accountNumber = typeof accountNumber === "string" && accountNumber.trim() ? accountNumber.trim() : null;
    }
    if (currency !== undefined) {
      if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency)) return NextResponse.json({ error: "Currency must be a three-letter code" }, { status: 400 });
      const newCurrency = currency.toUpperCase();
      if (newCurrency !== existing.currency && hasLedgerActivity) {
        return NextResponse.json({ error: "Account currency cannot be changed after financial activity exists." }, { status: 400 });
      }
      updateData.currency = newCurrency;
    }
    if (isShared !== undefined) {
      if (typeof isShared !== "boolean") return NextResponse.json({ error: "Sharing setting must be boolean" }, { status: 400 });
      updateData.isShared = isShared;
    }
    if (financialInstitutionId !== undefined) {
      updateData.financialInstitution = financialInstitutionId
        ? { connect: { id: String(financialInstitutionId).trim() } }
        : { disconnect: true };
    }
    if (logoMode !== undefined) {
      if (!["AUTO", "CUSTOM", "ICON", "INITIAL"].includes(String(logoMode))) return NextResponse.json({ error: "Invalid logo mode" }, { status: 400 });
      updateData.logoMode = String(logoMode);
    }
    if (customLogoUrl !== undefined) {
      updateData.customLogoUrl = customLogoUrl ? String(customLogoUrl).trim() : null;
    }
    if (iconName !== undefined) {
      updateData.iconName = iconName ? String(iconName).trim() : null;
    }
    if (creditLimit !== undefined) {
      const parsed = creditLimit !== null && creditLimit !== "" ? parseNonNegativeMoney(creditLimit) : null;
      if (creditLimit !== null && creditLimit !== "" && !parsed) return NextResponse.json({ error: "Credit limit must be non-negative" }, { status: 400 });
      updateData.creditLimit = parsed;
    }
    const parseDay = (value: unknown) => value === null || value === "" ? null : Number(value);
    if (billingCycleDay !== undefined || paymentDueDate !== undefined) {
      const cycleDay = billingCycleDay === undefined ? existing.billingCycleDay : parseDay(billingCycleDay);
      const dueDay = paymentDueDate === undefined ? existing.paymentDueDate : parseDay(paymentDueDate);
      if ((cycleDay !== null && (!Number.isInteger(cycleDay) || cycleDay < 1 || cycleDay > 31)) || (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31))) return NextResponse.json({ error: "Billing and due days must be integers from 1 to 31" }, { status: 400 });
      if (billingCycleDay !== undefined) updateData.billingCycleDay = cycleDay;
      if (paymentDueDate !== undefined) updateData.paymentDueDate = dueDay;
    }
    if (interestRate !== undefined) {
      const parsed = interestRate !== null && interestRate !== "" ? parseNonNegativeMoney(interestRate) : null;
      if (interestRate !== null && interestRate !== "" && (!parsed || parsed.greaterThan(100))) return NextResponse.json({ error: "Interest rate must be from 0 to 100" }, { status: 400 });
      updateData.interestRate = parsed;
    }
    if (maturityDate !== undefined) {
      const parsed = maturityDate ? parseIsoDate(maturityDate) : null;
      if (maturityDate && !parsed) return NextResponse.json({ error: "Maturity date must be a valid ISO date" }, { status: 400 });
      updateData.maturityDate = parsed;
    }
    if (isArchived !== undefined) {
      if (typeof isArchived !== "boolean") return NextResponse.json({ error: "Archive state must be boolean" }, { status: 400 });
      updateData.isArchived = isArchived;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.account.update({ where: { id }, data: updateData });

      if (requestedBalance && !requestedBalance.equals(existing.balance)) {
        const diff = requestedBalance.sub(existing.balance);
        await FinancialCommand.postAdjustment(tx, {
          householdId: session.householdId,
          accountId: id,
          amount: diff,
          reason: "Manual balance adjustment via settings",
        });
      }

      return tx.account.findUniqueOrThrow({
        where: { id },
        include: {
          financialInstitution: { select: { id: true, name: true, shortCode: true, logoUrl: true } },
        },
      });
    });

    return NextResponse.json(maskAccountNumber(updated));
  } catch (error) {
    console.error("Failed to update account:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}

// DELETE maps to SOFT CLOSE / ARCHIVE so database record and historical transactions remain intact
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const existing = await prisma.account.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (!existing.isShared && existing.userId !== session.id) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Soft close (archive) without deleting row from DB
    const archived = await prisma.account.update({
      where: { id },
      data: { isArchived: true },
    });

    return NextResponse.json({
      message: "Account closed and archived successfully (historical ledger transactions preserved)",
      account: maskAccountNumber(archived),
    });
  } catch (error) {
    console.error("Failed to close account:", error);
    return NextResponse.json({ error: "Failed to close account" }, { status: 500 });
  }
}
