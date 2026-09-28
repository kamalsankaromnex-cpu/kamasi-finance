import {
  initialMockUsers,
  initialMockHousehold,
  initialMockAccounts,
  initialMockCategories,
  initialMockTransactions,
  initialMockBudgets,
  initialMockGoals,
  initialMockInvestments,
  initialMockAssets,
  initialMockLiabilities,
  initialMockForecastScenario,
  MockUser,
  MockHousehold,
  MockAccount,
  MockCategory,
  MockTransaction,
  MockBudget,
  MockGoal,
  MockInvestment,
  MockAsset,
  MockLiability,
  MockForecastScenario,
} from "./mock-data";

class FinanceStore {
  users: MockUser[] = [...initialMockUsers];
  household: MockHousehold = { ...initialMockHousehold };
  accounts: MockAccount[] = [...initialMockAccounts];
  categories: MockCategory[] = [...initialMockCategories];
  transactions: MockTransaction[] = [...initialMockTransactions];
  budgets: MockBudget[] = [...initialMockBudgets];
  goals: MockGoal[] = [...initialMockGoals];
  investments: MockInvestment[] = [...initialMockInvestments];
  assets: MockAsset[] = [...initialMockAssets];
  liabilities: MockLiability[] = [...initialMockLiabilities];
  forecastScenario: MockForecastScenario = { ...initialMockForecastScenario };

  // Transactions CRUD
  addTransaction(txn: Omit<MockTransaction, "id">): MockTransaction {
    const newTxn: MockTransaction = {
      ...txn,
      id: `txn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
    this.transactions.unshift(newTxn);

    // Update account balances atomically (Double-Entry Ledger rules)
    const acc = this.accounts.find((a) => a.id === txn.accountId);
    if (acc) {
      if (txn.type === "INCOME") {
        acc.balance += txn.amount;
      } else if (txn.type === "EXPENSE") {
        acc.balance -= txn.amount;
      } else if (txn.type === "TRANSFER") {
        acc.balance -= txn.amount;
        if (txn.transferAccountId) {
          const destAcc = this.accounts.find((a) => a.id === txn.transferAccountId);
          if (destAcc) {
            destAcc.balance += txn.amount;
          }
        }
      }
    }
    return newTxn;
  }

  deleteTransaction(id: string): boolean {
    const idx = this.transactions.findIndex((t) => t.id === id);
    if (idx !== -1) {
      const txn = this.transactions[idx];
      const acc = this.accounts.find((a) => a.id === txn.accountId);
      if (acc) {
        if (txn.type === "INCOME") {
          acc.balance -= txn.amount;
        } else if (txn.type === "EXPENSE") {
          acc.balance += txn.amount;
        } else if (txn.type === "TRANSFER") {
          acc.balance += txn.amount;
          if (txn.transferAccountId) {
            const destAcc = this.accounts.find((a) => a.id === txn.transferAccountId);
            if (destAcc) {
              destAcc.balance -= txn.amount;
            }
          }
        }
      }
      this.transactions.splice(idx, 1);
      return true;
    }
    return false;
  }

  // Accounts CRUD
  addAccount(acc: Omit<MockAccount, "id">): MockAccount {
    const newAcc: MockAccount = {
      ...acc,
      id: `acc-${Date.now()}`,
    };
    this.accounts.push(newAcc);
    return newAcc;
  }

  // Goals CRUD
  addGoal(goal: Omit<MockGoal, "id">): MockGoal {
    const newGoal: MockGoal = {
      ...goal,
      id: `gl-${Date.now()}`,
    };
    this.goals.push(newGoal);
    return newGoal;
  }

  contributeToGoal(goalId: string, amount: number, accountId: string, userId?: string): boolean {
    const g = this.goals.find((goal) => goal.id === goalId);
    const acc = this.accounts.find((a) => a.id === accountId);
    if (g && acc) {
      g.currentAmount += amount;
      this.addTransaction({
        householdId: this.household.id,
        accountId,
        userId: userId || this.users[0]?.id,
        date: new Date().toISOString(),
        amount,
        type: "EXPENSE",
        isRecurring: false,
        description: `Goal Savings Allocation: ${g.name}`,
        tags: "savings-goal,allocation",
      });
      return true;
    }
    return false;
  }

  updateGoalProgress(id: string, amountToAdd: number, accountId?: string): boolean {
    if (accountId) {
      return this.contributeToGoal(id, amountToAdd, accountId);
    }
    const defaultAccId = this.accounts[0]?.id || "acc-1";
    return this.contributeToGoal(id, amountToAdd, defaultAccId);
  }

  // Investments CRUD
  addInvestment(inv: Omit<MockInvestment, "id">): MockInvestment {
    const newInv: MockInvestment = {
      ...inv,
      id: `inv-${Date.now()}`,
    };
    this.investments.push(newInv);
    return newInv;
  }

  // Assets CRUD
  addAsset(ast: Omit<MockAsset, "id">): MockAsset {
    const newAst: MockAsset = {
      ...ast,
      id: `ast-${Date.now()}`,
    };
    this.assets.push(newAst);
    return newAst;
  }

  // Liabilities CRUD
  addLiability(lia: Omit<MockLiability, "id">): MockLiability {
    const newLia: MockLiability = {
      ...lia,
      id: `lia-${Date.now()}`,
    };
    this.liabilities.push(newLia);
    return newLia;
  }

  // Budgets CRUD
  upsertBudget(categoryId: string, amount: number, month: number, year: number): MockBudget {
    const existing = this.budgets.find(
      (b) => b.categoryId === categoryId && b.month === month && b.year === year
    );
    if (existing) {
      existing.amount = amount;
      return existing;
    }
    const newB: MockBudget = {
      id: `bdg-${Date.now()}`,
      householdId: this.household.id,
      categoryId,
      amount,
      month,
      year,
    };
    this.budgets.push(newB);
    return newB;
  }
}

const globalStore = globalThis as unknown as { financeStore?: FinanceStore };
export const store = globalStore.financeStore || new FinanceStore();
if (process.env.NODE_ENV !== "production") globalStore.financeStore = store;
