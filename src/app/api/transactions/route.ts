import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { hideIdempotencyKey, isValidIdempotencyKey, isValidTransactionType, parsePositiveMoney } from "@/lib/financial-validation";
import { FinancialCommand } from "@/finance/financial-command";
import { validateClassificationCombination } from "@/lib/services/classification-service";
import { AuditService } from "@/finance/audit/audit.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const url = new URL(req.url);
    const paramProfileId = url.searchParams.get("profileId");
    const paramType = url.searchParams.get("type");

    const andConditions: any[] = [
      { OR: [{ transferAccountId: null }, { transferAccount: { is: { OR: [{ isShared: true }, { userId: session.id }] } } }] },
    ];

    if (paramType) {
      if (!isValidTransactionType(paramType)) {
        return NextResponse.json(
          { error: "Invalid transaction type filter. Allowed: INCOME, EXPENSE, TRANSFER" },
          { status: 400 }
        );
      }
      andConditions.push({ type: paramType });
    }

    if (paramProfileId) {
      if (paramProfileId !== "ALL") {
        const profile = await prisma.familyProfile.findFirst({
          where: { id: paramProfileId, householdId: session.householdId },
        });
        if (!profile) return NextResponse.json({ error: "Forbidden: Profile not in household" }, { status: 403 });
        andConditions.push({ profileId: paramProfileId });
      }
    } else if (session.activeProfile && !session.activeProfile.isFamilyView) {
      if (session.activeProfile.isPrimary) {
        andConditions.push({
          OR: [{ profileId: session.activeProfile.id }, { profileId: null }],
        });
      } else {
        andConditions.push({ profileId: session.activeProfile.id });
      }
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        householdId: session.householdId,
        account: { is: { OR: [{ isShared: true }, { userId: session.id }] } },
        AND: andConditions,
      },
      orderBy: { date: "desc" },
      include: {
        account: { select: { id: true, name: true, type: true, balance: true, currency: true, isShared: true, userId: true } },
        transferAccount: { select: { id: true, name: true, type: true, balance: true, currency: true, isShared: true, userId: true } },
        category: true,
        scope: true,
        subcategory: true,
        costCenter: true,
        user: { select: { id: true, name: true } },
        profile: { select: { id: true, name: true, relationship: true, color: true } },
      },
    });
    return NextResponse.json(transactions.map(hideIdempotencyKey));
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let idempotencyKey: string | null = null;
  let requestSession: { id: string; householdId: string } | null = null;
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    requestSession = session;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const {
      accountId,
      categoryId,
      scopeId,
      subcategoryId,
      costCenterId,
      date,
      amount,
      type,
      status: requestedStatus,
      transferAccountId,
      description,
      notes,
      tags,
      merchant,
      receiptUrl,
      splitsJson,
      reimbursementStatus,
      reimbursedAmount,
      profileId: bodyProfileId,
    } = body;

    const txnStatus = requestedStatus === "DRAFT" ? "DRAFT" : "POSTED";

    if (!accountId || amount === undefined || amount === null || typeof description !== "string" || !description.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let targetProfileId: string | null = null;
    if (typeof bodyProfileId === "string" && bodyProfileId.trim()) {
      const p = await prisma.familyProfile.findFirst({
        where: { id: bodyProfileId.trim(), householdId: session.householdId, isActive: true },
      });
      if (!p) return NextResponse.json({ error: "Forbidden: Profile not in household" }, { status: 403 });
      targetProfileId = p.id;
    } else if (session.activeProfile && !session.activeProfile.isFamilyView) {
      targetProfileId = session.activeProfile.id;
    } else {
      const primary = await prisma.familyProfile.findFirst({
        where: { householdId: session.householdId, isPrimary: true, isActive: true },
      });
      targetProfileId = primary?.id || null;
    }

    // Validate classification combination if any classification fields provided
    if (scopeId || categoryId || subcategoryId || costCenterId) {
      const classValidation = await validateClassificationCombination({
        householdId: session.householdId,
        scopeId,
        categoryId,
        subcategoryId,
        costCenterId,
        isNewRecord: true,
      });

      if (!classValidation.valid) {
        return NextResponse.json({ error: classValidation.error }, { status: 400 });
      }
    }

    // Validate splits sum if splitsJson is provided
    if (splitsJson) {
      try {
        const parsedSplits = typeof splitsJson === "string" ? JSON.parse(splitsJson) : splitsJson;
        if (Array.isArray(parsedSplits) && parsedSplits.length > 0) {
          const splitSum = parsedSplits.reduce((acc: number, s: any) => acc + (parseFloat(s.amount) || 0), 0);
          const totalNum = parseFloat(String(amount));
          if (Math.abs(splitSum - totalNum) > 0.01) {
            return NextResponse.json(
              { error: `Split amounts sum (${splitSum.toFixed(2)}) must equal total transaction amount (${totalNum.toFixed(2)})` },
              { status: 400 }
            );
          }
        }
      } catch {
        return NextResponse.json({ error: "Invalid splitsJson format" }, { status: 400 });
      }
    }

    idempotencyKey = req.headers.get("Idempotency-Key")?.trim() || null;
    if (!idempotencyKey || !isValidIdempotencyKey(idempotencyKey)) {
      return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
    }

    const normalizedType = type ?? "EXPENSE";
    if (!isValidTransactionType(normalizedType)) {
      return NextResponse.json({ error: "Transaction type must be INCOME, EXPENSE, or TRANSFER" }, { status: 400 });
    }
    const decAmount = parsePositiveMoney(amount);
    if (!decAmount) {
      return NextResponse.json({ error: "Amount must be a finite positive number" }, { status: 400 });
    }
    const txnDate = date === undefined ? new Date() : new Date(date);
    if (Number.isNaN(txnDate.getTime())) return NextResponse.json({ error: "Invalid transaction date" }, { status: 400 });
    const previouslyPosted = await prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (previouslyPosted) {
      if (previouslyPosted.householdId !== session.householdId || previouslyPosted.userId !== session.id) {
        return NextResponse.json({ error: "Idempotency key has already been used" }, { status: 409 });
      }
      const sameRequest = previouslyPosted.accountId === accountId &&
        previouslyPosted.transferAccountId === (normalizedType === "TRANSFER" ? transferAccountId : null) &&
        previouslyPosted.categoryId === (categoryId || null) && previouslyPosted.type === normalizedType &&
        previouslyPosted.description === description.trim() && previouslyPosted.amount.equals(decAmount) &&
        previouslyPosted.date.getTime() === txnDate.getTime() && (previouslyPosted.notes || null) === (notes || null) &&
        (previouslyPosted.tags || null) === (tags || null);
      return sameRequest
        ? NextResponse.json(hideIdempotencyKey(previouslyPosted), { status: 200 })
        : NextResponse.json({ error: "Idempotency key was reused with different transaction data" }, { status: 409 });
    }

    // Verify account belongs to user's household (IDOR Prevention)
    const sourceAccount = await prisma.account.findFirst({
      where: { id: accountId, householdId: session.householdId },
    });

    if (!sourceAccount) {
      return NextResponse.json(
        { error: "Forbidden: Account does not belong to user's household" },
        { status: 403 }
      );
    }
    if (!sourceAccount.isShared && sourceAccount.userId !== session.id) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (sourceAccount.isArchived) return NextResponse.json({ error: "Archived accounts cannot receive transactions" }, { status: 400 });

    if (categoryId) {
      const category = await prisma.category.findFirst({ where: { id: categoryId, householdId: session.householdId } });
      if (!category || (normalizedType === "TRANSFER" ? category.type !== "TRANSFER" : category.type !== normalizedType)) {
        return NextResponse.json({ error: "Category is invalid for this transaction" }, { status: 400 });
      }
    }

    if (normalizedType === "TRANSFER") {
      if (!transferAccountId || transferAccountId === accountId) {
        return NextResponse.json({ error: "A distinct destination account is required for a transfer" }, { status: 400 });
      }
      const destAccount = await prisma.account.findFirst({
        where: { id: transferAccountId, householdId: session.householdId },
      });

      if (!destAccount) {
        return NextResponse.json(
          { error: "Forbidden: Destination account does not belong to user's household" },
          { status: 403 }
        );
      }
      if ((!destAccount.isShared && destAccount.userId !== session.id) || destAccount.isArchived) {
        return NextResponse.json({ error: "Destination account is unavailable" }, { status: 400 });
      }
    }

    // Atomic Database Transaction Scoped to Session Household
    const result = await prisma.$transaction(async (tx) => {
      let postedJournal: any = null;
      if (txnStatus === "POSTED") {
        if (normalizedType === "INCOME") {
          postedJournal = await FinancialCommand.postIncome(tx, {
            householdId: session.householdId,
            accountId,
            amount: decAmount,
            description: description.trim(),
            categoryId,
            date: txnDate,
            idempotencyKey,
          });
        } else if (normalizedType === "EXPENSE") {
          postedJournal = await FinancialCommand.postExpense(tx, {
            householdId: session.householdId,
            accountId,
            amount: decAmount,
            description: description.trim(),
            categoryId,
            date: txnDate,
            idempotencyKey,
          });
        } else if (normalizedType === "TRANSFER") {
          postedJournal = await FinancialCommand.postTransfer(tx, {
            householdId: session.householdId,
            sourceAccountId: accountId,
            destinationAccountId: transferAccountId!,
            amount: decAmount,
            description: description.trim(),
            date: txnDate,
            idempotencyKey,
          });
        }
      }

      const createdTxn = await tx.transaction.create({
        data: {
          householdId: session.householdId,
          profileId: targetProfileId,
          accountId,
          categoryId: categoryId || null,
          scopeId: scopeId || null,
          subcategoryId: subcategoryId || null,
          costCenterId: costCenterId || null,
          userId: session.id,
          journalId: postedJournal?.id || null,
          idempotencyKey,
          date: txnDate,
          amount: decAmount,
          type: normalizedType,
          status: txnStatus,
          postedAt: txnStatus === "POSTED" ? new Date() : null,
          transferAccountId: normalizedType === "TRANSFER" ? transferAccountId : null,
          description: description.trim(),
          notes: notes || null,
          tags: tags || null,
          merchant: merchant || null,
          receiptUrl: receiptUrl || null,
          splitsJson: splitsJson ? (typeof splitsJson === "string" ? splitsJson : JSON.stringify(splitsJson)) : null,
          reimbursementStatus: reimbursementStatus || "NONE",
          reimbursedAmount: reimbursedAmount ? new Prisma.Decimal(reimbursedAmount) : new Prisma.Decimal(0),
        },
      });

      return createdTxn;
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      actorUserId: session.id,
      action: "CREATE",
      entityType: "TRANSACTION",
      entityId: result.id,
      metadata: {
        amount: result.amount.toString(),
        type: result.type,
        accountId: result.accountId,
        profileId: targetProfileId,
        userEmail: session.email,
      },
    });

    return NextResponse.json(hideIdempotencyKey(result), { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002" && idempotencyKey && requestSession) {
      const existing = await prisma.transaction.findUnique({ where: { idempotencyKey } });
      if (existing && existing.householdId === requestSession.householdId && existing.userId === requestSession.id) {
        return NextResponse.json(hideIdempotencyKey(existing), { status: 200 });
      }
    }
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") return NextResponse.json({ error: "Insufficient available balance or credit" }, { status: 409 });
    if (error instanceof Error && error.message === "ACCOUNT_UNAVAILABLE") return NextResponse.json({ error: "Account is unavailable" }, { status: 400 });
    console.error("Failed to create transaction:", error);
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }
}
