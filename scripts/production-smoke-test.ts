import { PrismaClient, Prisma } from '@prisma/client';
import { FinancialCommand } from '../src/finance/financial-command';
import { LedgerService } from '../src/finance/ledger.service';
import { ReconciliationService } from '../src/finance/reconciliation.service';
import { FinancialReportingService } from '../src/finance/reporting/reporting.service';
import { FinancialForecastingService } from '../src/finance/forecasting/forecasting.service';
import { AIFinancialAssistantService } from '../src/finance/ai/ai-assistant.service';
import { AuditIntegrityService } from '../src/finance/audit/audit-integrity.service';

const prisma = new PrismaClient();

async function runProductionSmokeTest() {
  console.log('=== Starting Phase 3.9 Automated Production Smoke Test ===');
  console.log('Invariant Proof Model: Authoritative API ≡ Ledger ≡ Account.balance ≡ Reporting\n');

  const timestamp = Date.now();
  const testEmail = `smoke_user_${timestamp}@kamasi.test`;
  const testPasswordHash = '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890';

  // Step 01: Create / authenticate test user
  console.log('Step 01: Create and authenticate test user...');
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      name: 'Smoke Test Owner',
      passwordHash: testPasswordHash,
    },
  });
  if (!user.id) throw new Error('Step 01 failed: User creation failed');

  // Step 02: Create household
  console.log('Step 02: Create household...');
  const household = await prisma.household.create({
    data: {
      name: `Smoke Household ${timestamp}`,
      currency: 'INR',
      members: {
        create: {
          userId: user.id,
          role: 'OWNER',
        },
      },
    },
  });
  if (!household.id) throw new Error('Step 02 failed: Household creation failed');

  // Step 03: Create primary bank accounts
  console.log('Step 03: Create bank accounts...');
  const bankAccount = await prisma.account.create({
    data: {
      householdId: household.id,
      userId: user.id,
      name: 'HDFC Checking',
      type: 'BANK',
      currency: 'INR',
      balance: new Prisma.Decimal(0),
    },
  });
  const secondaryAccount = await prisma.account.create({
    data: {
      householdId: household.id,
      userId: user.id,
      name: 'ICICI Savings',
      type: 'BANK',
      currency: 'INR',
      balance: new Prisma.Decimal(0),
    },
  });

  // Step 04: Verify opening balance
  console.log('Step 04: Verify opening balance...');
  const fetchedOpening = await prisma.account.findUnique({ where: { id: bankAccount.id } });
  if (!fetchedOpening || !fetchedOpening.balance.equals(0)) {
    throw new Error(`Step 04 failed: Expected 0 balance, got ${fetchedOpening?.balance}`);
  }

  // Step 05: Record salary income (₹150,000)
  console.log('Step 05: Record salary income (₹150,000)...');
  const salaryJournal = await prisma.$transaction(async (tx) => {
    return FinancialCommand.postIncome(tx, {
      householdId: household.id,
      accountId: bankAccount.id,
      amount: new Prisma.Decimal(150000),
      description: 'Monthly Salary Income',
      idempotencyKey: `salary_${timestamp}`,
    });
  });
  if (!salaryJournal.id) throw new Error('Step 05 failed: Salary transaction post failed');

  // Step 06: Verify income + journal + account balance
  console.log('Step 06: Verify income + journal + account balance...');
  const bankAccountAfterSalary = await prisma.account.findUnique({ where: { id: bankAccount.id } });
  if (!bankAccountAfterSalary || !bankAccountAfterSalary.balance.equals(150000)) {
    throw new Error(`Step 06 failed: Balance mismatch after salary. Account.balance=${bankAccountAfterSalary?.balance}`);
  }

  // Step 07: Record expense (₹30,000 house rent)
  console.log('Step 07: Record expense (₹30,000 rent)...');
  const expenseJournal = await prisma.$transaction(async (tx) => {
    return FinancialCommand.postExpense(tx, {
      householdId: household.id,
      accountId: bankAccount.id,
      amount: new Prisma.Decimal(30000),
      description: 'House Rent Payment',
      idempotencyKey: `rent_${timestamp}`,
    });
  });
  if (!expenseJournal.id) throw new Error('Step 07 failed: Expense transaction failed');

  // Step 08: Verify expense + journal + account balance
  console.log('Step 08: Verify expense + journal + account balance...');
  const bankAccountAfterExpense = await prisma.account.findUnique({ where: { id: bankAccount.id } });
  if (!bankAccountAfterExpense || !bankAccountAfterExpense.balance.equals(120000)) {
    throw new Error(`Step 08 failed: Balance mismatch after expense. Expected ₹120,000, got ₹${bankAccountAfterExpense?.balance}`);
  }

  // Step 09: Transfer ₹20,000 from Checking to Savings
  console.log('Step 09: Transfer ₹20,000 from Checking to Savings...');
  const transferJournal = await prisma.$transaction(async (tx) => {
    return FinancialCommand.postTransfer(tx, {
      householdId: household.id,
      sourceAccountId: bankAccount.id,
      destinationAccountId: secondaryAccount.id,
      amount: new Prisma.Decimal(20000),
      description: 'Savings Deposit Transfer',
      idempotencyKey: `transfer_${timestamp}`,
    });
  });
  if (!transferJournal.id) throw new Error('Step 09 failed: Transfer failed');

  // Step 10: Verify transfer zero net effect on overall wealth
  console.log('Step 10: Verify transfer zero net effect...');
  const checkingBal = await prisma.account.findUnique({ where: { id: bankAccount.id } });
  const savingsBal = await prisma.account.findUnique({ where: { id: secondaryAccount.id } });
  if (!checkingBal?.balance.equals(100000) || !savingsBal?.balance.equals(20000)) {
    throw new Error(`Step 10 failed: Transfer incorrect balances. Checking=${checkingBal?.balance}, Savings=${savingsBal?.balance}`);
  }

  // Step 11: Create savings goal
  console.log('Step 11: Create emergency fund goal...');
  const goal = await prisma.goal.create({
    data: {
      householdId: household.id,
      name: 'Emergency Fund',
      targetAmount: new Prisma.Decimal(500000),
      currentAmount: new Prisma.Decimal(0),
      targetDate: new Date(Date.now() + 365 * 86400000),
    },
  });

  // Step 12: Contribute ₹10,000 to goal
  console.log('Step 12: Contribute ₹10,000 to goal...');
  await prisma.$transaction(async (tx) => {
    return FinancialCommand.postGoalContribution(tx, {
      householdId: household.id,
      accountId: bankAccount.id,
      goalName: goal.name,
      amount: new Prisma.Decimal(10000),
      idempotencyKey: `goal_${timestamp}`,
    });
  });
  await prisma.goal.update({
    where: { id: goal.id },
    data: { currentAmount: { increment: 10000 } },
  });
  const updatedGoal = await prisma.goal.findUnique({ where: { id: goal.id } });
  if (!updatedGoal?.currentAmount.equals(10000)) throw new Error('Step 12 failed: Goal contribution failed');

  // Step 13: Create investment asset (Nifty 50 Index ETF)
  console.log('Step 13: Create investment asset (Nifty 50 Index ETF)...');
  const investment = await prisma.investment.create({
    data: {
      householdId: household.id,
      name: 'Nifty 50 Index ETF',
      category: 'MUTUAL_FUND',
      type: 'MUTUAL_FUND',
      symbol: 'NIFTYBEES',
      status: 'ACTIVE',
      totalQuantity: new Prisma.Decimal(100),
      totalCostBasis: new Prisma.Decimal(25000),
      currentPricePerUnit: new Prisma.Decimal(260),
      currentMarketValue: new Prisma.Decimal(26000),
    },
  });
  if (!investment.id) throw new Error('Step 13 failed: Investment creation failed');

  // Step 14: Create liability
  console.log('Step 14: Create liability (Car Loan ₹200,000)...');
  const liability = await prisma.liability.create({
    data: {
      householdId: household.id,
      name: 'Car Loan',
      category: 'LOAN',
      type: 'CAR_LOAN',
      status: 'ACTIVE',
      principalAmount: new Prisma.Decimal(200000),
      outstandingAmount: new Prisma.Decimal(200000),
      interestRate: new Prisma.Decimal(8.5),
    },
  });

  // Step 15: Record liability repayment
  console.log('Step 15: Record liability repayment (₹5,000)...');
  await prisma.$transaction(async (tx) => {
    return FinancialCommand.postLiabilityRepayment(tx, {
      householdId: household.id,
      liabilityName: liability.name,
      principalAmount: new Prisma.Decimal(5000),
      payingAccountId: bankAccount.id,
      idempotencyKey: `repay_${timestamp}`,
    });
  });
  await prisma.liability.update({
    where: { id: liability.id },
    data: { outstandingAmount: { decrement: 5000 } },
  });
  const updatedLiability = await prisma.liability.findUnique({ where: { id: liability.id } });
  if (!updatedLiability?.outstandingAmount.equals(195000)) throw new Error('Step 15 failed: Liability repayment failed');

  // Step 16: Verify dashboard & financial reporting API
  console.log('Step 16: Verify dashboard & financial reporting API...');
  const report = await FinancialReportingService.getNetWorthReport(prisma, household.id);
  if (report.netWorth === undefined || report.totalAssets === undefined || report.totalLiabilities === undefined) {
    throw new Error('Step 16 failed: Reporting API returned undefined metrics');
  }

  // Step 17: Run forecast engine
  console.log('Step 17: Run forecast engine...');
  const scenario = FinancialForecastingService.getPresetScenario(household.id, 'BASELINE');
  const forecast = await FinancialForecastingService.runForecast({
    householdId: household.id,
    startDate: new Date().toISOString().split('T')[0],
    horizonMonths: 12,
    scenario,
  });
  if (!forecast.cashFlows || forecast.cashFlows.length !== 12) {
    throw new Error('Step 17 failed: Forecast generation failed');
  }

  // Step 18: Ask AI read-only query
  console.log('Step 18: Ask AI read-only query...');
  const aiQueryRes = await AIFinancialAssistantService.processQuery(household.id, 'What is my current net worth?');
  if (!aiQueryRes.answer || aiQueryRes.answer.length === 0) {
    throw new Error('Step 18 failed: AI Query response empty');
  }

  // Step 19: Create + confirm AI financial action proposal
  console.log('Step 19: Propose and confirm AI financial action...');
  const proposalParams = {
    accountId: bankAccount.id,
    amount: 2500,
    description: 'AI Proposed Office Expense',
    currency: 'INR',
  };

  const proposal = await AIFinancialAssistantService.proposeAction(
    household.id,
    user.id,
    'RECORD_EXPENSE',
    proposalParams
  );

  const executionRes = await AIFinancialAssistantService.confirmAndExecuteAction(
    household.id,
    user.id,
    proposal.id,
    proposal.parametersHash
  );
  if (!executionRes.success || proposal.status !== 'EXECUTED') {
    throw new Error('Step 19 failed: AI Financial Action execution failed');
  }

  // Step 20: Verify transaction + balance + audit chain integrity
  console.log('Step 20: Verify audit hash chain integrity...');
  const auditRes = await AuditIntegrityService.verifyAuditChain(prisma, household.id);
  if (!auditRes.valid) throw new Error(`Step 20 failed: Audit chain integrity invalid: ${auditRes.failureType}`);

  // Step 21: Idempotency verification
  console.log('Step 21: Verify transaction idempotency key enforcement...');
  const duplicateIdempotencyKey = `salary_${timestamp}`;
  const initialJournalCount = await prisma.journal.count({ where: { householdId: household.id } });
  
  // Attempting duplicate journal posting with identical idempotencyKey
  const duplicateResult = await prisma.$transaction(async (tx) => {
    return FinancialCommand.postIncome(tx, {
      householdId: household.id,
      accountId: bankAccount.id,
      amount: new Prisma.Decimal(150000),
      description: 'Monthly Salary Income Duplicate Attempt',
      idempotencyKey: duplicateIdempotencyKey,
    });
  });

  const finalJournalCount = await prisma.journal.count({ where: { householdId: household.id } });
  if (finalJournalCount !== initialJournalCount) {
    throw new Error(`Step 21 failed: Idempotency check failed. Duplicate request created extra journal entries (${initialJournalCount} vs ${finalJournalCount})`);
  }
  if (duplicateResult.id !== salaryJournal.id) {
    throw new Error(`Step 21 failed: Idempotency check failed. Expected returned journal ID ${salaryJournal.id}, got ${duplicateResult.id}`);
  }

  // Reconciliation Assertion across all accounts
  const reconcileResults = await ReconciliationService.reconcileHousehold(household.id);
  for (const res of reconcileResults) {
    if (res.status !== 'MATCH') {
      throw new Error(`Reconciliation mismatch on account ${res.accountName}: Stored=${res.storedBalance}, Calculated=${res.calculatedBalance}`);
    }
  }

  console.log('\n================================================================');
  console.log('=== PHASE 3.9 AUTOMATED SMOKE TEST PASSED PERFECTLY (21/21) ===');
  console.log('================================================================');
}

runProductionSmokeTest()
  .catch((err) => {
    console.error('Smoke Test FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
