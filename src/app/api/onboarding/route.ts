import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parseNonNegativeMoney, parsePositiveMoney } from "@/lib/financial-validation";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, name: true, isOnboarded: true, onboardingStep: true },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const household = await prisma.household.findUnique({
      where: { id: session.householdId },
      include: {
        _count: {
          select: {
            accounts: true,
            incomeSources: true,
            budgets: true,
            recurringTransactions: true,
            goals: true,
            assets: true,
            liabilities: true,
            members: true,
          },
        },
      },
    });

    if (!household) return NextResponse.json({ error: "Household not found" }, { status: 404 });

    const accounts = await prisma.account.findMany({
      where: { householdId: session.householdId, isArchived: false },
      select: { id: true, name: true, type: true, balance: true, currency: true },
    });

    const incomeSources = await prisma.incomeSource.findMany({
      where: { householdId: session.householdId, isActive: true },
      select: { id: true, name: true, category: true, expectedAmount: true, frequency: true },
    });

    const categories = await prisma.category.findMany({
      where: { householdId: session.householdId },
      select: { id: true, name: true, type: true, icon: true, color: true },
    });

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const budgets = await prisma.budget.findMany({
      where: { householdId: session.householdId, month: currentMonth, year: currentYear },
      include: { category: true },
    });

    return NextResponse.json({
      user,
      household: {
        id: household.id,
        name: household.name,
        currency: household.currency,
        financialYearStart: household.financialYearStart,
        memberCount: household._count.members,
      },
      counts: household._count,
      accounts,
      incomeSources,
      categories,
      budgets,
    });
  } catch (error) {
    console.error("Failed to fetch onboarding state:", error);
    return NextResponse.json({ error: "Failed to fetch onboarding state" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const { step, action, householdName, currency, financialYearStart, invitationCode, accounts, incomeSources, budgets, bills, goals, assets } = body;

    const stepNum = Number(step);

    // Step 1: Household Preferences or Join Household
    if (stepNum === 1) {
      if (action === "join" && invitationCode) {
        // Join household via invitation
        const invite = await prisma.householdInvitation.findUnique({
          where: { code: invitationCode.trim() },
        });

        if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
          return NextResponse.json({ error: "Invalid or expired invitation code" }, { status: 400 });
        }

        await prisma.$transaction(async (tx) => {
          await tx.householdMember.upsert({
            where: {
              householdId_userId: {
                householdId: invite.householdId,
                userId: session.id,
              },
            },
            create: {
              householdId: invite.householdId,
              userId: session.id,
              role: invite.role,
            },
            update: {
              role: invite.role,
            },
          });

          await tx.householdInvitation.update({
            where: { id: invite.id },
            data: { status: "ACCEPTED" },
          });

          await tx.user.update({
            where: { id: session.id },
            data: { onboardingStep: 2 },
          });
        });

        return NextResponse.json({ success: true, step: 2, message: "Successfully joined household" });
      }

      // Default: Update Household preferences
      await prisma.$transaction(async (tx) => {
        await tx.household.update({
          where: { id: session.householdId },
          data: {
            ...(householdName ? { name: householdName.trim() } : {}),
            ...(currency ? { currency: currency.trim() } : {}),
            ...(financialYearStart ? { financialYearStart: financialYearStart.trim() } : {}),
          },
        });

        await tx.user.update({
          where: { id: session.id },
          data: { onboardingStep: 2 },
        });
      });

      return NextResponse.json({ success: true, step: 2 });
    }

    // Step 2: Configure Opening Accounts (Bank, Cash, Cards, Loans)
    if (stepNum === 2) {
      if (Array.isArray(accounts) && accounts.length > 0) {
        await prisma.$transaction(async (tx) => {
          for (const acc of accounts) {
            if (!acc.name || !acc.type) continue;
            const bal = parseNonNegativeMoney(acc.balance) ?? new Prisma.Decimal(0);
            const limit = acc.creditLimit ? parseNonNegativeMoney(acc.creditLimit) : null;

            // Idempotent upsert by household & name
            const existing = await tx.account.findFirst({
              where: { householdId: session.householdId, name: acc.name.trim() },
            });

            if (existing) {
              await tx.account.update({
                where: { id: existing.id },
                data: { balance: bal, creditLimit: limit },
              });
            } else {
              await tx.account.create({
                data: {
                  householdId: session.householdId,
                  userId: session.id,
                  name: acc.name.trim(),
                  type: acc.type,
                  balance: acc.type === "CREDIT" || acc.type === "LOAN" ? bal.negated() : bal,
                  creditLimit: limit,
                  isShared: acc.isShared !== false,
                },
              });
            }
          }

          await tx.user.update({
            where: { id: session.id },
            data: { onboardingStep: 3 },
          });
        });
      } else {
        await prisma.user.update({
          where: { id: session.id },
          data: { onboardingStep: 3 },
        });
      }

      return NextResponse.json({ success: true, step: 3 });
    }

    // Step 3: Income Sources
    if (stepNum === 3) {
      if (Array.isArray(incomeSources) && incomeSources.length > 0) {
        await prisma.$transaction(async (tx) => {
          for (const src of incomeSources) {
            if (!src.name) continue;
            const amt = parsePositiveMoney(src.expectedAmount) ?? new Prisma.Decimal(0);

            const existing = await tx.incomeSource.findFirst({
              where: { householdId: session.householdId, name: src.name.trim() },
            });

            if (!existing) {
              await tx.incomeSource.create({
                data: {
                  householdId: session.householdId,
                  name: src.name.trim(),
                  category: src.category || "Salary",
                  expectedAmount: amt,
                  frequency: src.frequency || "MONTHLY",
                  expectedDay: Number(src.expectedDay) || 1,
                  behavior: "RECURRING",
                },
              });
            }
          }

          await tx.user.update({
            where: { id: session.id },
            data: { onboardingStep: 4 },
          });
        });
      } else {
        await prisma.user.update({
          where: { id: session.id },
          data: { onboardingStep: 4 },
        });
      }

      return NextResponse.json({ success: true, step: 4 });
    }

    // Step 4: Category Budgets
    if (stepNum === 4) {
      if (Array.isArray(budgets) && budgets.length > 0) {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        await prisma.$transaction(async (tx) => {
          for (const b of budgets) {
            if (!b.categoryId) continue;
            const amt = parseNonNegativeMoney(b.amount);
            if (!amt) continue;

            await tx.budget.upsert({
              where: {
                householdId_categoryId_month_year: {
                  householdId: session.householdId,
                  categoryId: b.categoryId,
                  month: currentMonth,
                  year: currentYear,
                },
              },
              create: {
                householdId: session.householdId,
                categoryId: b.categoryId,
                month: currentMonth,
                year: currentYear,
                amount: amt,
              },
              update: {
                amount: amt,
              },
            });
          }

          await tx.user.update({
            where: { id: session.id },
            data: { onboardingStep: 5 },
          });
        });
      } else {
        await prisma.user.update({
          where: { id: session.id },
          data: { onboardingStep: 5 },
        });
      }

      return NextResponse.json({ success: true, step: 5 });
    }

    // Step 5: Recurring Bills, Goals & Assets
    if (stepNum === 5) {
      await prisma.$transaction(async (tx) => {
        // Process bills
        if (Array.isArray(bills)) {
          const defaultAcc = await tx.account.findFirst({
            where: { householdId: session.householdId, isArchived: false },
          });
          for (const bill of bills) {
            if (!bill.name) continue;
            const amt = parsePositiveMoney(bill.amount);
            if (!amt || !defaultAcc) continue;

            const existing = await tx.recurringTransaction.findFirst({
              where: { householdId: session.householdId, name: bill.name.trim() },
            });
            if (!existing) {
              await tx.recurringTransaction.create({
                data: {
                  householdId: session.householdId,
                  accountId: defaultAcc.id,
                  name: bill.name.trim(),
                  amount: amt,
                  frequency: bill.frequency || "MONTHLY",
                  type: "EXPENSE",
                },
              });
            }
          }
        }

        // Process goals
        if (Array.isArray(goals)) {
          for (const g of goals) {
            if (!g.name) continue;
            const target = parsePositiveMoney(g.targetAmount);
            if (!target) continue;

            const existing = await tx.goal.findFirst({
              where: { householdId: session.householdId, name: g.name.trim() },
            });
            if (!existing) {
              await tx.goal.create({
                data: {
                  householdId: session.householdId,
                  name: g.name.trim(),
                  targetAmount: target,
                  targetDate: g.targetDate ? new Date(g.targetDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                },
              });
            }
          }
        }

        // Process assets
        if (Array.isArray(assets)) {
          for (const a of assets) {
            if (!a.name) continue;
            const val = parsePositiveMoney(a.value);
            if (!val) continue;

            const existing = await tx.asset.findFirst({
              where: { householdId: session.householdId, name: a.name.trim() },
            });
            if (!existing) {
              await tx.asset.create({
                data: {
                  householdId: session.householdId,
                  name: a.name.trim(),
                  type: a.type || "OTHER",
                  value: val,
                },
              });
            }
          }
        }

        await tx.user.update({
          where: { id: session.id },
          data: { onboardingStep: 6 },
        });
      });

      return NextResponse.json({ success: true, step: 6 });
    }

    // Step 6: Final Setup Confirmation & Completion
    if (stepNum === 6 || action === "complete") {
      await prisma.user.update({
        where: { id: session.id },
        data: { isOnboarded: true, onboardingStep: 6 },
      });

      return NextResponse.json({ success: true, isOnboarded: true, redirectUrl: "/" });
    }

    return NextResponse.json({ error: "Invalid step number" }, { status: 400 });
  } catch (error) {
    console.error("Failed to update onboarding state:", error);
    return NextResponse.json({ error: "Failed to update onboarding step" }, { status: 500 });
  }
}
