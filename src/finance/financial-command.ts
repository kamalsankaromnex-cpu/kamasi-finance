import { Prisma } from "@prisma/client";
import { LedgerService } from "./ledger.service";

export interface PostExpenseCommandInput {
  householdId: string;
  accountId: string;
  amount: Prisma.Decimal;
  description: string;
  categoryId?: string | null;
  date?: Date;
  idempotencyKey?: string | null;
}

export interface PostIncomeCommandInput {
  householdId: string;
  accountId: string;
  amount: Prisma.Decimal;
  description: string;
  categoryId?: string | null;
  grossAmount?: Prisma.Decimal | null;
  deductionsAmount?: Prisma.Decimal | null;
  taxWithheld?: Prisma.Decimal | null;
  date?: Date;
  idempotencyKey?: string | null;
}

export interface PostTransferCommandInput {
  householdId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: Prisma.Decimal;
  description: string;
  date?: Date;
  idempotencyKey?: string | null;
}

export interface PostRefundCommandInput {
  householdId: string;
  accountId: string;
  amount: Prisma.Decimal;
  description: string;
  refundOfId?: string | null;
  date?: Date;
  idempotencyKey?: string | null;
}

export interface PostGoalContributionCommandInput {
  householdId: string;
  accountId: string;
  goalName: string;
  amount: Prisma.Decimal;
  idempotencyKey?: string | null;
}

export interface PostGoalWithdrawalCommandInput {
  householdId: string;
  accountId: string;
  goalName: string;
  amount: Prisma.Decimal;
  idempotencyKey?: string | null;
}



export interface PostDividendCommandInput {
  householdId: string;
  accountId: string;
  investmentName: string;
  amount: Prisma.Decimal;
  idempotencyKey?: string | null;
}

export interface PostLoanPaymentCommandInput {
  householdId: string;
  payingAccountId: string;
  liabilityName: string;
  principalAmount: Prisma.Decimal;
  interestAmount: Prisma.Decimal;
  idempotencyKey?: string | null;
}

export interface PostAssetPurchaseCommandInput {
  householdId: string;
  payingAccountId: string;
  assetName: string;
  amount: Prisma.Decimal;
  idempotencyKey?: string | null;
}

export interface PostAssetSaleCommandInput {
  householdId: string;
  receivingAccountId: string;
  assetName: string;
  amount: Prisma.Decimal;
  idempotencyKey?: string | null;
}

export interface PostAssetValuationAdjustmentCommandInput {
  householdId: string;
  assetName: string;
  deltaAmount: Prisma.Decimal; // Positive for appreciation, negative for depreciation
}

export interface PostAssetAcquisitionCommandInput {
  householdId: string;
  assetName: string;
  amount: Prisma.Decimal;
  payingAccountId?: string | null;
  assetAccountId?: string | null;
  idempotencyKey?: string | null;
}

export interface PostAssetRevaluationCommandInput {
  householdId: string;
  assetName: string;
  deltaAmount: Prisma.Decimal;
  assetAccountId?: string | null;
  adjustmentAccountId?: string | null;
  idempotencyKey?: string | null;
}

export interface PostAssetDisposalCommandInput {
  householdId: string;
  assetName: string;
  carryingValue: Prisma.Decimal;
  proceeds: Prisma.Decimal;
  receivingAccountId?: string | null;
  assetAccountId?: string | null;
  adjustmentAccountId?: string | null;
  idempotencyKey?: string | null;
}

export interface PostLiabilityBorrowCommandInput {
  householdId: string;
  liabilityName: string;
  principalAmount: Prisma.Decimal;
  receivingAccountId?: string | null;
  liabilityAccountId?: string | null;
  idempotencyKey?: string | null;
}

export interface PostLiabilityRepaymentCommandInput {
  householdId: string;
  liabilityName: string;
  principalAmount: Prisma.Decimal;
  payingAccountId?: string | null;
  liabilityAccountId?: string | null;
  idempotencyKey?: string | null;
}

export interface PostLiabilityInterestAccrualCommandInput {
  householdId: string;
  liabilityName: string;
  interestAmount: Prisma.Decimal;
  liabilityAccountId?: string | null;
  expenseAccountId?: string | null;
  idempotencyKey?: string | null;
}

export interface PostLiabilityEMICommandInput {
  householdId: string;
  liabilityName: string;
  principalAmount: Prisma.Decimal;
  interestAmount: Prisma.Decimal;
  payingAccountId?: string | null;
  liabilityAccountId?: string | null;
  idempotencyKey?: string | null;
}

export interface PostInvestmentBuyCommandInput {
  householdId: string;
  investmentName: string;
  totalCost?: Prisma.Decimal;
  totalAmount?: Prisma.Decimal;
  payingAccountId?: string | null;
  investmentAccountId?: string | null;
  accountId?: string | null;
  idempotencyKey?: string | null;
}

export interface PostInvestmentSellCommandInput {
  householdId: string;
  investmentName: string;
  proceeds?: Prisma.Decimal;
  costBasis?: Prisma.Decimal;
  totalAmount?: Prisma.Decimal;
  receivingAccountId?: string | null;
  investmentAccountId?: string | null;
  accountId?: string | null;
  gainLossAccountId?: string | null;
  idempotencyKey?: string | null;
}

export interface PostInvestmentIncomeCommandInput {
  householdId: string;
  investmentName: string;
  incomeType: "DIVIDEND" | "INTEREST";
  amount: Prisma.Decimal;
  receivingAccountId?: string | null;
  incomeAccountId?: string | null;
  idempotencyKey?: string | null;
}

export interface PostInvestmentFeeCommandInput {
  householdId: string;
  investmentName: string;
  amount: Prisma.Decimal;
  payingAccountId?: string | null;
  feeAccountId?: string | null;
  idempotencyKey?: string | null;
}

export interface PostInvestmentRevaluationCommandInput {
  householdId: string;
  investmentName: string;
  deltaMarketValue: Prisma.Decimal;
  investmentAccountId?: string | null;
  idempotencyKey?: string | null;
}

export interface PostOpeningBalanceCommandInput {
  householdId: string;
  accountId: string;
  accountType: string;
  openingBalance: Prisma.Decimal;
}

export interface PostAdjustmentCommandInput {
  householdId: string;
  accountId: string;
  amount: Prisma.Decimal; // Positive or negative difference
  reason: string;
}

export class FinancialCommand {
  /**
   * Post Expense: Debit Expense Category / Credit Paying Bank Account
   */
  static async postExpense(tx: Prisma.TransactionClient, input: PostExpenseCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Expense: ${input.description}`,
      idempotencyKey: input.idempotencyKey,
      date: input.date,
      entries: [
        { debit: input.amount, credit: new Prisma.Decimal(0), description: `Expense Category Entry: ${input.categoryId || 'General'}` },
        { accountId: input.accountId, debit: new Prisma.Decimal(0), credit: input.amount, description: input.description },
      ],
    });
  }

  /**
   * Post Income: Debit Receiving Bank Account / Credit Income Category (with optional TDS / PF deductions)
   */
  static async postIncome(tx: Prisma.TransactionClient, input: PostIncomeCommandInput) {
    const gross = input.grossAmount || input.amount;
    const deductions = input.deductionsAmount || new Prisma.Decimal(0);
    const tax = input.taxWithheld || new Prisma.Decimal(0);
    const netReceived = input.amount;

    const entries: { accountId?: string | null; debit: Prisma.Decimal; credit: Prisma.Decimal; description: string }[] = [];

    // 1. Debit Receiving Bank/Cash Account for Net Amount
    entries.push({
      accountId: input.accountId,
      debit: netReceived,
      credit: new Prisma.Decimal(0),
      description: input.description,
    });

    // 2. Debit Tax Withheld / Deductions if present
    if (tax.gt(0)) {
      entries.push({
        debit: tax,
        credit: new Prisma.Decimal(0),
        description: `Tax Withheld (TDS): ${input.description}`,
      });
    }
    if (deductions.gt(0)) {
      entries.push({
        debit: deductions,
        credit: new Prisma.Decimal(0),
        description: `Income Deductions (PF/Fees): ${input.description}`,
      });
    }

    // 3. Credit Income Revenue Category for Gross Income
    entries.push({
      debit: new Prisma.Decimal(0),
      credit: gross,
      description: `Income Category Entry: ${input.categoryId || 'General'}`,
    });

    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Income: ${input.description}`,
      idempotencyKey: input.idempotencyKey,
      date: input.date,
      entries,
    });
  }

  /**
   * Post Transfer: Debit Destination Bank Account / Credit Source Bank Account
   */
  static async postTransfer(tx: Prisma.TransactionClient, input: PostTransferCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Transfer: ${input.description}`,
      idempotencyKey: input.idempotencyKey,
      date: input.date,
      entries: [
        { accountId: input.destinationAccountId, debit: input.amount, credit: new Prisma.Decimal(0), description: `Transfer In to ${input.destinationAccountId}` },
        { accountId: input.sourceAccountId, debit: new Prisma.Decimal(0), credit: input.amount, description: `Transfer Out from ${input.sourceAccountId}` },
      ],
    });
  }

  /**
   * Post Refund: Debit Bank Account / Credit Expense Refund
   */
  static async postRefund(tx: Prisma.TransactionClient, input: PostRefundCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Refund: ${input.description}`,
      idempotencyKey: input.idempotencyKey,
      date: input.date,
      entries: [
        { accountId: input.accountId, debit: input.amount, credit: new Prisma.Decimal(0), description: `Refund Credit to Account` },
        { debit: new Prisma.Decimal(0), credit: input.amount, description: `Expense Refund Reversal: ${input.refundOfId || 'Original Tx'}` },
      ],
    });
  }

  /**
   * Post Reversal: Creates compensating reversal journal with swapped debits and credits
   */
  static async postReversal(tx: Prisma.TransactionClient, journalId: string, householdId: string) {
    return LedgerService.reverseJournal(tx, journalId, householdId);
  }

  /**
   * Post Goal Contribution: Debit Goal Earmark / Credit Bank Account
   */
  static async postGoalContribution(tx: Prisma.TransactionClient, input: PostGoalContributionCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Goal Allocation: ${input.goalName}`,
      idempotencyKey: input.idempotencyKey,
      entries: [
        { debit: input.amount, credit: new Prisma.Decimal(0), description: `Earmarked Goal Allocation: ${input.goalName}` },
        { accountId: input.accountId, debit: new Prisma.Decimal(0), credit: input.amount, description: `Goal Savings Deduction: ${input.goalName}` },
      ],
    });
  }

  /**
   * Post Goal Withdrawal: Debit Bank Account / Credit Goal Earmark
   */
  static async postGoalWithdrawal(tx: Prisma.TransactionClient, input: PostGoalWithdrawalCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Goal Withdrawal: ${input.goalName}`,
      idempotencyKey: input.idempotencyKey,
      entries: [
        { accountId: input.accountId, debit: input.amount, credit: new Prisma.Decimal(0), description: `Goal Withdrawal Credit: ${input.goalName}` },
        { debit: new Prisma.Decimal(0), credit: input.amount, description: `Goal Earmark Reduction: ${input.goalName}` },
      ],
    });
  }



  /**
   * Post Dividend: Debit Bank Account / Credit Dividend Income
   */
  static async postDividend(tx: Prisma.TransactionClient, input: PostDividendCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Dividend Income: ${input.investmentName}`,
      idempotencyKey: input.idempotencyKey,
      entries: [
        { accountId: input.accountId, debit: input.amount, credit: new Prisma.Decimal(0), description: `Dividend Credit: ${input.investmentName}` },
        { debit: new Prisma.Decimal(0), credit: input.amount, description: `Dividend Revenue: ${input.investmentName}` },
      ],
    });
  }

  /**
   * Post Loan Payment (EMI): Debit Loan Principal Reduction, Debit Interest Expense / Credit Bank Account
   */
  static async postLoanPayment(tx: Prisma.TransactionClient, input: PostLoanPaymentCommandInput) {
    const totalEMI = input.principalAmount.add(input.interestAmount);
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Loan Payment EMI for ${input.liabilityName}`,
      idempotencyKey: input.idempotencyKey,
      entries: [
        { debit: input.principalAmount, credit: new Prisma.Decimal(0), description: `Loan Principal Reduction: ${input.liabilityName}` },
        { debit: input.interestAmount, credit: new Prisma.Decimal(0), description: `Interest Expense: ${input.liabilityName}` },
        { accountId: input.payingAccountId, debit: new Prisma.Decimal(0), credit: totalEMI, description: `Bank EMI Deduction: ${input.liabilityName}` },
      ],
    });
  }

  /**
   * Post Asset Purchase: Debit Vehicle/RealEstate Asset / Credit Paying Bank Account
   */
  static async postAssetPurchase(tx: Prisma.TransactionClient, input: PostAssetPurchaseCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Asset Purchase: ${input.assetName}`,
      idempotencyKey: input.idempotencyKey,
      entries: [
        { debit: input.amount, credit: new Prisma.Decimal(0), description: `Physical Asset Acquisition: ${input.assetName}` },
        { accountId: input.payingAccountId, debit: new Prisma.Decimal(0), credit: input.amount, description: `Bank Payment for ${input.assetName}` },
      ],
    });
  }

  /**
   * Post Asset Sale: Debit Bank Account / Credit Asset Account
   */
  static async postAssetSale(tx: Prisma.TransactionClient, input: PostAssetSaleCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Asset Sale: ${input.assetName}`,
      idempotencyKey: input.idempotencyKey,
      entries: [
        { accountId: input.receivingAccountId, debit: input.amount, credit: new Prisma.Decimal(0), description: `Bank Sale Proceeds: ${input.assetName}` },
        { debit: new Prisma.Decimal(0), credit: input.amount, description: `Physical Asset Liquidation: ${input.assetName}` },
      ],
    });
  }

  /**
   * Post Non-Cash Asset Valuation Adjustment (No Bank movement)
   */
  static async postAssetValuationAdjustment(tx: Prisma.TransactionClient, input: PostAssetValuationAdjustmentCommandInput) {
    const absDelta = input.deltaAmount.abs();
    const isGain = input.deltaAmount.gt(0);

    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Asset Valuation Adjustment: ${input.assetName}`,
      entries: isGain
        ? [
            { debit: absDelta, credit: new Prisma.Decimal(0), description: `Asset Appreciation: ${input.assetName}` },
            { debit: new Prisma.Decimal(0), credit: absDelta, description: `Valuation Reserve Equity: ${input.assetName}` },
          ]
        : [
            { debit: absDelta, credit: new Prisma.Decimal(0), description: `Valuation Loss Reserve: ${input.assetName}` },
            { debit: new Prisma.Decimal(0), credit: absDelta, description: `Asset Depreciation: ${input.assetName}` },
          ],
    });
  }

  /**
   * Post Account Opening Balance (Asset: Debit Account / Credit Equity; Liability: Debit Equity / Credit Account)
   */
  static async postOpeningBalance(tx: Prisma.TransactionClient, input: PostOpeningBalanceCommandInput) {
    if (input.openingBalance.isZero()) return null;

    const isAsset = ["BANK", "CASH", "INVESTMENT"].includes(input.accountType.toUpperCase());
    const absBal = input.openingBalance.abs();

    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Opening Balance for Account ${input.accountId}`,
      entries: isAsset
        ? [
            { accountId: input.accountId, debit: absBal, credit: new Prisma.Decimal(0), description: `Initial Asset Balance` },
            { debit: new Prisma.Decimal(0), credit: absBal, description: `Opening Equity Offset` },
          ]
        : [
            { debit: absBal, credit: new Prisma.Decimal(0), description: `Opening Equity Offset` },
            { accountId: input.accountId, debit: new Prisma.Decimal(0), credit: absBal, description: `Initial Liability Balance` },
          ],
    });
  }

  /**
   * Post Explicit Account Reconciliation Adjustment
   */
  static async postAdjustment(tx: Prisma.TransactionClient, input: PostAdjustmentCommandInput) {
    const absAmount = input.amount.abs();
    const isIncrease = input.amount.gt(0);

    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Account Adjustment: ${input.reason}`,
      entries: isIncrease
        ? [
            { accountId: input.accountId, debit: absAmount, credit: new Prisma.Decimal(0), description: input.reason },
            { debit: new Prisma.Decimal(0), credit: absAmount, description: `Equity Adjustment Credit` },
          ]
        : [
            { debit: absAmount, credit: new Prisma.Decimal(0), description: `Equity Adjustment Debit` },
            { accountId: input.accountId, debit: new Prisma.Decimal(0), credit: absAmount, description: input.reason },
          ],
    });
  }

  /**
   * Phase 3.1: Post Asset Acquisition (Debit Asset Account / Credit Paying Bank Account)
   */
  static async postAssetAcquisition(tx: Prisma.TransactionClient, input: PostAssetAcquisitionCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Asset Acquisition: ${input.assetName}`,
      idempotencyKey: input.idempotencyKey || null,
      entries: [
        { accountId: input.assetAccountId || null, debit: input.amount, credit: new Prisma.Decimal(0), description: `Asset Account Debit: ${input.assetName}` },
        { accountId: input.payingAccountId || null, debit: new Prisma.Decimal(0), credit: input.amount, description: `Payment Source Credit: ${input.assetName}` },
      ],
    });
  }

  /**
   * Phase 3.1: Post Asset Revaluation (Appreciation or Depreciation)
   */
  static async postAssetRevaluation(tx: Prisma.TransactionClient, input: PostAssetRevaluationCommandInput) {
    const absDelta = input.deltaAmount.abs();
    const isAppreciation = input.deltaAmount.gt(0);

    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Asset Revaluation (${isAppreciation ? 'Appreciation' : 'Depreciation'}): ${input.assetName}`,
      idempotencyKey: input.idempotencyKey || null,
      entries: isAppreciation
        ? [
            { accountId: input.assetAccountId || null, debit: absDelta, credit: new Prisma.Decimal(0), description: `Asset Appreciation Debit: ${input.assetName}` },
            { accountId: input.adjustmentAccountId || null, debit: new Prisma.Decimal(0), credit: absDelta, description: `Revaluation Gain Reserve Credit: ${input.assetName}` },
          ]
        : [
            { accountId: input.adjustmentAccountId || null, debit: absDelta, credit: new Prisma.Decimal(0), description: `Revaluation Loss Reserve Debit: ${input.assetName}` },
            { accountId: input.assetAccountId || null, debit: new Prisma.Decimal(0), credit: absDelta, description: `Asset Depreciation Credit: ${input.assetName}` },
          ],
    });
  }

  /**
   * Phase 3.1: Post Asset Disposal with Gain/Loss Accounting
   */
  static async postAssetDisposal(tx: Prisma.TransactionClient, input: PostAssetDisposalCommandInput) {
    const gainOrLoss = input.proceeds.sub(input.carryingValue);

    const entries: { accountId?: string | null; debit: Prisma.Decimal; credit: Prisma.Decimal; description: string }[] = [];

    // 1. Debit Cash/Bank for Disposal Proceeds
    entries.push({
      accountId: input.receivingAccountId || null,
      debit: input.proceeds,
      credit: new Prisma.Decimal(0),
      description: `Disposal Bank Proceeds: ${input.assetName}`,
    });

    // 2. Gain or Loss Entry
    if (gainOrLoss.gt(0)) {
      // Gain on disposal: Credit Gain Account
      entries.push({
        accountId: input.adjustmentAccountId || null,
        debit: new Prisma.Decimal(0),
        credit: gainOrLoss,
        description: `Gain on Asset Disposal: ${input.assetName}`,
      });
    } else if (gainOrLoss.lt(0)) {
      // Loss on disposal: Debit Loss Account
      entries.push({
        accountId: input.adjustmentAccountId || null,
        debit: gainOrLoss.abs(),
        credit: new Prisma.Decimal(0),
        description: `Loss on Asset Disposal: ${input.assetName}`,
      });
    }

    // 3. Credit Asset Account for Carrying Value Removal
    entries.push({
      accountId: input.assetAccountId || null,
      debit: new Prisma.Decimal(0),
      credit: input.carryingValue,
      description: `Asset Carrying Value Clearance: ${input.assetName}`,
    });

    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Asset Disposal: ${input.assetName}`,
      idempotencyKey: input.idempotencyKey || null,
      entries,
    });
  }

  /**
   * Phase 3.2: Post Liability Borrowing (Debit Cash/Bank receiving account / Credit Liability account)
   */
  static async postLiabilityBorrow(tx: Prisma.TransactionClient, input: PostLiabilityBorrowCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Liability Borrowing: ${input.liabilityName}`,
      idempotencyKey: input.idempotencyKey || null,
      entries: [
        { accountId: input.receivingAccountId || null, debit: input.principalAmount, credit: new Prisma.Decimal(0), description: `Cash/Bank Funds Received: ${input.liabilityName}` },
        { accountId: input.liabilityAccountId || null, debit: new Prisma.Decimal(0), credit: input.principalAmount, description: `Liability Debt Obligation: ${input.liabilityName}` },
      ],
    });
  }

  /**
   * Phase 3.2: Post Liability Principal Repayment (Debit Liability account / Credit Paying Bank account)
   */
  static async postLiabilityRepayment(tx: Prisma.TransactionClient, input: PostLiabilityRepaymentCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Liability Principal Repayment: ${input.liabilityName}`,
      idempotencyKey: input.idempotencyKey || null,
      entries: [
        { accountId: input.liabilityAccountId || null, debit: input.principalAmount, credit: new Prisma.Decimal(0), description: `Liability Debt Reduction: ${input.liabilityName}` },
        { accountId: input.payingAccountId || null, debit: new Prisma.Decimal(0), credit: input.principalAmount, description: `Cash/Bank Payment Source: ${input.liabilityName}` },
      ],
    });
  }

  /**
   * Phase 3.2: Post Liability Interest Accrual (Debit Interest Expense / Credit Liability account)
   */
  static async postLiabilityInterestAccrual(tx: Prisma.TransactionClient, input: PostLiabilityInterestAccrualCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Liability Interest Accrual: ${input.liabilityName}`,
      idempotencyKey: input.idempotencyKey || null,
      entries: [
        { accountId: input.expenseAccountId || null, debit: input.interestAmount, credit: new Prisma.Decimal(0), description: `Interest Expense Accrued: ${input.liabilityName}` },
        { accountId: input.liabilityAccountId || null, debit: new Prisma.Decimal(0), credit: input.interestAmount, description: `Interest Payable Addition: ${input.liabilityName}` },
      ],
    });
  }

  /**
   * Phase 3.2: Post Combined Liability EMI Payment (Principal reduction + Interest expense)
   */
  static async postLiabilityEMI(tx: Prisma.TransactionClient, input: PostLiabilityEMICommandInput) {
    const totalPayment = input.principalAmount.add(input.interestAmount);
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Liability EMI Payment: ${input.liabilityName}`,
      idempotencyKey: input.idempotencyKey || null,
      entries: [
        { accountId: input.liabilityAccountId || null, debit: input.principalAmount, credit: new Prisma.Decimal(0), description: `Principal Reduction: ${input.liabilityName}` },
        { debit: input.interestAmount, credit: new Prisma.Decimal(0), description: `Interest Expense: ${input.liabilityName}` },
        { accountId: input.payingAccountId || null, debit: new Prisma.Decimal(0), credit: totalPayment, description: `EMI Payment Cash Source: ${input.liabilityName}` },
      ],
    });
  }

  /**
   * Phase 3.3: Post Investment Purchase (Debit Investment Asset Account / Credit Paying Bank Account)
   */
  static async postInvestmentBuy(tx: Prisma.TransactionClient, input: PostInvestmentBuyCommandInput) {
    const cost = input.totalCost || input.totalAmount || new Prisma.Decimal(0);
    const payAcc = input.payingAccountId || input.accountId || null;
    const invAcc = input.investmentAccountId || null;

    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Investment Purchase: ${input.investmentName}`,
      idempotencyKey: input.idempotencyKey || null,
      entries: [
        { accountId: invAcc, debit: cost, credit: new Prisma.Decimal(0), description: `Investment Asset Debit: ${input.investmentName}` },
        { accountId: payAcc, debit: new Prisma.Decimal(0), credit: cost, description: `Payment Source Credit: ${input.investmentName}` },
      ],
    });
  }

  /**
   * Phase 3.3: Post Investment Sale with Realized Gain/Loss Accounting
   */
  static async postInvestmentSell(tx: Prisma.TransactionClient, input: PostInvestmentSellCommandInput) {
    const proc = input.proceeds || input.totalAmount || new Prisma.Decimal(0);
    const cost = input.costBasis || proc;
    const gainOrLoss = proc.sub(cost);
    const recAcc = input.receivingAccountId || input.accountId || null;
    const invAcc = input.investmentAccountId || null;

    const entries: { accountId?: string | null; debit: Prisma.Decimal; credit: Prisma.Decimal; description: string }[] = [];

    // 1. Debit Receiving Cash/Bank Account for Proceeds
    entries.push({
      accountId: recAcc,
      debit: proc,
      credit: new Prisma.Decimal(0),
      description: `Bank Sale Proceeds: ${input.investmentName}`,
    });

    // 2. Realized Gain or Loss Entry
    if (gainOrLoss.gt(0)) {
      // Gain on sale: Credit Realized Gain Account
      entries.push({
        accountId: input.gainLossAccountId || null,
        debit: new Prisma.Decimal(0),
        credit: gainOrLoss,
        description: `Realized Gain on Investment: ${input.investmentName}`,
      });
    } else if (gainOrLoss.lt(0)) {
      // Loss on sale: Debit Realized Loss Account
      entries.push({
        accountId: input.gainLossAccountId || null,
        debit: gainOrLoss.abs(),
        credit: new Prisma.Decimal(0),
        description: `Realized Loss on Investment: ${input.investmentName}`,
      });
    }

    // 3. Credit Investment Asset Account for Cost Basis Removal
    entries.push({
      accountId: invAcc,
      debit: new Prisma.Decimal(0),
      credit: cost,
      description: `Investment Cost Basis Clearance: ${input.investmentName}`,
    });

    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Investment Sale: ${input.investmentName}`,
      idempotencyKey: input.idempotencyKey || null,
      entries,
    });
  }

  /**
   * Phase 3.3: Post Investment Income (Dividend or Interest)
   */
  static async postInvestmentIncome(tx: Prisma.TransactionClient, input: PostInvestmentIncomeCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Investment ${input.incomeType}: ${input.investmentName}`,
      idempotencyKey: input.idempotencyKey || null,
      entries: [
        { accountId: input.receivingAccountId || null, debit: input.amount, credit: new Prisma.Decimal(0), description: `Cash/Bank Income Receipt: ${input.investmentName}` },
        { accountId: input.incomeAccountId || null, debit: new Prisma.Decimal(0), credit: input.amount, description: `${input.incomeType} Income Credit: ${input.investmentName}` },
      ],
    });
  }

  /**
   * Phase 3.3: Post Investment Fee Expense
   */
  static async postInvestmentFee(tx: Prisma.TransactionClient, input: PostInvestmentFeeCommandInput) {
    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Investment Fee: ${input.investmentName}`,
      idempotencyKey: input.idempotencyKey || null,
      entries: [
        { accountId: input.feeAccountId || null, debit: input.amount, credit: new Prisma.Decimal(0), description: `Investment Fee Expense Debit: ${input.investmentName}` },
        { accountId: input.payingAccountId || null, debit: new Prisma.Decimal(0), credit: input.amount, description: `Cash/Bank Payment Source: ${input.investmentName}` },
      ],
    });
  }

  /**
   * Phase 3.3: Post Investment Mark-to-Market Revaluation Adjustment
   */
  static async postInvestmentRevaluation(tx: Prisma.TransactionClient, input: PostInvestmentRevaluationCommandInput) {
    const absDelta = input.deltaMarketValue.abs();
    const isGain = input.deltaMarketValue.gt(0);

    return LedgerService.postJournal(tx, {
      householdId: input.householdId,
      description: `Investment Revaluation (${isGain ? 'Appreciation' : 'Depreciation'}): ${input.investmentName}`,
      idempotencyKey: input.idempotencyKey || null,
      entries: isGain
        ? [
            { accountId: input.investmentAccountId || null, debit: absDelta, credit: new Prisma.Decimal(0), description: `Unrealized Market Appreciation: ${input.investmentName}` },
            { debit: new Prisma.Decimal(0), credit: absDelta, description: `Unrealized Gain Reserve: ${input.investmentName}` },
          ]
        : [
            { debit: absDelta, credit: new Prisma.Decimal(0), description: `Unrealized Loss Reserve: ${input.investmentName}` },
            { accountId: input.investmentAccountId || null, debit: new Prisma.Decimal(0), credit: absDelta, description: `Unrealized Market Depreciation: ${input.investmentName}` },
          ],
    });
  }
}
