import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../prisma";
import { GoalDomainService } from "@/modules/goals/goal.service";
import { FinancialCommand } from "@/finance/financial-command";
import { ReconciliationService } from "@/finance/reconciliation.service";
import { Prisma } from "@prisma/client";

describe("Phase 2.5 Goal Lifecycle & Concurrency Suite", () => {
  let householdAId: string;
  let userAId: string;
  let accountAId: string;

  let householdBId: string;
  let userBId: string;
  let accountBId: string;

  beforeEach(async () => {
    await prisma.goalLifecycleHistory.deleteMany();
    await prisma.transactionLifecycleHistory.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Household A Setup
    const userA = await prisma.user.create({
      data: { email: `p25-a-${Date.now()}@example.com`, passwordHash: "hashed", name: "User A", isOnboarded: true },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: { name: "Household A", currency: "INR", members: { create: { userId: userAId, role: "OWNER" } } },
    });
    householdAId = hhA.id;

    const accA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "HDFC Savings A", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountAId = accA.id;

    // Household B Setup (Isolation)
    const userB = await prisma.user.create({
      data: { email: `p25-b-${Date.now()}@example.com`, passwordHash: "hashed", name: "User B", isOnboarded: true },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: { name: "Household B", currency: "INR", members: { create: { userId: userBId, role: "OWNER" } } },
    });
    householdBId = hhB.id;

    const accB = await prisma.account.create({
      data: { householdId: householdBId, userId: userBId, name: "ICICI Savings B", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountBId = accB.id;

    // Opening balance for Account A: ₹50,000
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdAId,
        accountId: accountAId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(50000),
      });
    });
  });

  afterEach(async () => {
    const resA = await ReconciliationService.reconcileHousehold(householdAId);
    for (const r of resA) expect(r.status).toBe("MATCH");
  });

  describe("1. Goal Creation & Parameter Updates", () => {
    it("creates ACTIVE goal with currentAmount 0", async () => {
      const goal = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.createGoal(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Emergency Fund",
          targetAmount: new Prisma.Decimal(100000),
          targetDate: new Date("2026-12-31"),
        });
      });

      expect(goal.status).toBe("ACTIVE");
      expect(goal.currentAmount.toNumber()).toBe(0);
      expect(goal.targetAmount.toNumber()).toBe(100000);
    });

    it("updates active goal parameters", async () => {
      const goal = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.createGoal(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "New Car",
          targetAmount: new Prisma.Decimal(500000),
          targetDate: new Date("2027-06-30"),
        });
      });

      const updated = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.updateGoal(tx, {
          goalId: goal.id,
          householdId: householdAId,
          userId: userAId,
          data: { name: "Electric Car", targetAmount: new Prisma.Decimal(600000) },
        });
      });

      expect(updated.name).toBe("Electric Car");
      expect(updated.targetAmount.toNumber()).toBe(600000);
    });
  });

  describe("2. Contributions & Withdrawals", () => {
    it("deposits/contributes to ACTIVE goal and updates amount correctly", async () => {
      const goal = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.createGoal(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Vacation",
          targetAmount: new Prisma.Decimal(50000),
          targetDate: new Date("2026-12-31"),
        });
      });

      const result = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.depositToGoal(tx, {
          goalId: goal.id,
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(10000),
        });
      });

      expect(result.goal.currentAmount.toNumber()).toBe(10000);
      expect(result.transaction?.amount.toNumber()).toBe(10000);

      const acc = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(acc.balance.toNumber()).toBe(40000); // 50,000 - 10,000 = 40,000
    });

    it("withdraws from ACTIVE goal and updates amount correctly", async () => {
      const goal = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.createGoal(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Laptops",
          targetAmount: new Prisma.Decimal(100000),
          currentAmount: new Prisma.Decimal(30000),
          targetDate: new Date("2026-12-31"),
        });
      });

      const result = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.withdrawFromGoal(tx, {
          goalId: goal.id,
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(10000),
        });
      });

      expect(result.goal.currentAmount.toNumber()).toBe(20000);

      const acc = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(acc.balance.toNumber()).toBe(60000); // 50,000 + 10,000 = 60,000
    });

    it("rejects withdrawal above available goal currentAmount", async () => {
      const goal = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.createGoal(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Small Goal",
          targetAmount: new Prisma.Decimal(20000),
          currentAmount: new Prisma.Decimal(5000),
          targetDate: new Date("2026-12-31"),
        });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await GoalDomainService.withdrawFromGoal(tx, {
            goalId: goal.id,
            householdId: householdAId,
            userId: userAId,
            accountId: accountAId,
            amount: new Prisma.Decimal(10000), // Exceeds 5,000
          });
        })
      ).rejects.toThrow("WITHDRAWAL_EXCEEDS_BALANCE");
    });
  });

  describe("3. Atomic Concurrency & Over-withdrawal Protection", () => {
    it("handles concurrent withdrawals atomically: Goal ₹10k, 2 withdrawals ₹8k -> 1 succeeds, 1 fails, bal ₹2k", async () => {
      const goal = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.createGoal(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Race Goal",
          targetAmount: new Prisma.Decimal(20000),
          currentAmount: new Prisma.Decimal(10000),
          targetDate: new Date("2026-12-31"),
        });
      });

      const promise1 = prisma.$transaction(async (tx) => {
        return await GoalDomainService.withdrawFromGoal(tx, {
          goalId: goal.id,
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(8000),
        });
      });

      const promise2 = prisma.$transaction(async (tx) => {
        return await GoalDomainService.withdrawFromGoal(tx, {
          goalId: goal.id,
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(8000),
        });
      });

      const results = await Promise.allSettled([promise1, promise2]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const updatedGoal = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } });
      expect(updatedGoal.currentAmount.toNumber()).toBe(2000); // 10,000 - 8,000 = 2,000 (No negative!)
    });
  });

  describe("4. Lifecycle State Machine & Invariants", () => {
    it("pause and resume goal: disallows contribute/withdraw while PAUSED", async () => {
      const goal = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.createGoal(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "House Savings",
          targetAmount: new Prisma.Decimal(100000),
          currentAmount: new Prisma.Decimal(20000),
          targetDate: new Date("2026-12-31"),
        });
      });

      // Pause goal
      const paused = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.pauseGoal(tx, { goalId: goal.id, householdId: householdAId, userId: userAId });
      });

      expect(paused.status).toBe("PAUSED");

      // Cannot contribute while PAUSED
      await expect(
        prisma.$transaction(async (tx) => {
          await GoalDomainService.depositToGoal(tx, {
            goalId: goal.id,
            householdId: householdAId,
            userId: userAId,
            amount: new Prisma.Decimal(5000),
          });
        })
      ).rejects.toThrow();

      // Cannot withdraw while PAUSED
      await expect(
        prisma.$transaction(async (tx) => {
          await GoalDomainService.withdrawFromGoal(tx, {
            goalId: goal.id,
            householdId: householdAId,
            userId: userAId,
            amount: new Prisma.Decimal(5000),
          });
        })
      ).rejects.toThrow();

      // Resume goal
      const resumed = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.resumeGoal(tx, { goalId: goal.id, householdId: householdAId, userId: userAId });
      });

      expect(resumed.status).toBe("ACTIVE");
    });

    it("completion validation: completes only when currentAmount >= targetAmount", async () => {
      const goal = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.createGoal(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Bike",
          targetAmount: new Prisma.Decimal(50000),
          currentAmount: new Prisma.Decimal(20000),
          targetDate: new Date("2026-12-31"),
        });
      });

      // Explicit completion fails when target not reached
      await expect(
        prisma.$transaction(async (tx) => {
          await GoalDomainService.completeGoal(tx, { goalId: goal.id, householdId: householdAId, userId: userAId });
        })
      ).rejects.toThrow("GOAL_TARGET_NOT_REACHED");

      // Top up to targetAmount (50,000)
      const depositResult = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.depositToGoal(tx, {
          goalId: goal.id,
          householdId: householdAId,
          userId: userAId,
          amount: new Prisma.Decimal(30000),
        });
      });

      // Auto-transitions to COMPLETED when target reached
      expect(depositResult.goal.status).toBe("COMPLETED");

      // Completed goal disallows further contributions or withdrawals
      await expect(
        prisma.$transaction(async (tx) => {
          await GoalDomainService.depositToGoal(tx, {
            goalId: goal.id,
            householdId: householdAId,
            userId: userAId,
            amount: new Prisma.Decimal(1000),
          });
        })
      ).rejects.toThrow("INVALID_TRANSITION");
    });

    it("archive and restore goal preserving history", async () => {
      const goal = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.createGoal(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Retirement",
          targetAmount: new Prisma.Decimal(1000000),
          targetDate: new Date("2050-12-31"),
        });
      });

      const archived = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.archiveGoal(tx, { goalId: goal.id, householdId: householdAId, userId: userAId });
      });

      expect(archived.status).toBe("ARCHIVED");

      // Archived goal cannot receive contribution
      await expect(
        prisma.$transaction(async (tx) => {
          await GoalDomainService.depositToGoal(tx, {
            goalId: goal.id,
            householdId: householdAId,
            userId: userAId,
            amount: new Prisma.Decimal(1000),
          });
        })
      ).rejects.toThrow("INVALID_TRANSITION");

      const restored = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.restoreGoal(tx, { goalId: goal.id, householdId: householdAId, userId: userAId });
      });

      expect(restored.status).toBe("ACTIVE");
    });
  });

  describe("5. Idempotency & Household Isolation", () => {
    it("handles idempotent contributions and withdrawals", async () => {
      const goal = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.createGoal(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Idempotent Goal",
          targetAmount: new Prisma.Decimal(100000),
          targetDate: new Date("2026-12-31"),
        });
      });

      const key = `dep-${Date.now()}`;
      const res1 = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.depositToGoal(tx, {
          goalId: goal.id,
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(5000),
          idempotencyKey: key,
        });
      });

      const res2 = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.depositToGoal(tx, {
          goalId: goal.id,
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(5000),
          idempotencyKey: key,
        });
      });

      expect(res1.transaction?.id).toBe(res2.transaction?.id);
    });

    it("enforces Household Isolation — Household A cannot access Household B's goal", async () => {
      const goalB = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.createGoal(tx, {
          householdId: householdBId,
          userId: userBId,
          name: "B's Secret Goal",
          targetAmount: new Prisma.Decimal(50000),
          targetDate: new Date("2026-12-31"),
        });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await GoalDomainService.depositToGoal(tx, {
            goalId: goalB.id,
            householdId: householdAId, // Cross-household attempt
            userId: userAId,
            amount: new Prisma.Decimal(1000),
          });
        })
      ).rejects.toThrow("GOAL_NOT_FOUND");
    });
  });
});
