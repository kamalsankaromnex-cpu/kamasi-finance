-- DropIndex
DROP INDEX "LiabilityFinancialEvent_householdId_idx";

-- DropIndex
DROP INDEX "LiabilityFinancialEvent_liabilityId_idx";

-- CreateTable
CREATE TABLE "FamilyProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'OTHER',
    "avatarUrl" TEXT,
    "color" TEXT DEFAULT '#6366f1',
    "dateOfBirth" DATETIME,
    "notes" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FamilyProfile_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialInstitution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shortCode" TEXT,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FinancialScope" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'layers',
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "externalSystem" TEXT,
    "externalEntityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialScope_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScopeCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scopeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScopeCategory_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FinancialScope" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScopeCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CategorySubcategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CategorySubcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CategorySubcategory_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "externalSystem" TEXT,
    "externalEntityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostCenter_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostCenter_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FinancialScope" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'P1_HIGH',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "householdId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "message" TEXT NOT NULL,
    "evidenceJson" TEXT,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AlertEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonitorHeartbeat" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'PRIMARY_MONITOR',
    "lastScanTimestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scansCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'HEALTHY',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lender" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BANK',
    "contactInfo" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lender_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Borrowing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "lenderId" TEXT,
    "scopeId" TEXT,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "costCenterId" TEXT,
    "assetId" TEXT,
    "liabilityAccountId" TEXT,
    "receivingAccountId" TEXT,
    "disbursementJournalId" TEXT,
    "liabilityId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "borrowingType" TEXT NOT NULL DEFAULT 'TERM_LOAN',
    "financingType" TEXT NOT NULL DEFAULT 'SECURED',
    "repaymentMethod" TEXT NOT NULL DEFAULT 'AMORTIZED_EMI',
    "purpose" TEXT,
    "principalAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "interestRate" DECIMAL NOT NULL DEFAULT 0.00,
    "tenureMonths" INTEGER DEFAULT 12,
    "outstandingPrincipal" DECIMAL NOT NULL DEFAULT 0.00,
    "totalPrincipalPaid" DECIMAL NOT NULL DEFAULT 0.00,
    "totalInterestPaid" DECIMAL NOT NULL DEFAULT 0.00,
    "startDate" DATETIME,
    "maturityDate" DATETIME,
    "firstPaymentDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "archivedAt" DATETIME,
    "archivedByUserId" TEXT,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Borrowing_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Borrowing_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FamilyProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Borrowing_lenderId_fkey" FOREIGN KEY ("lenderId") REFERENCES "Lender" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Borrowing_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FinancialScope" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Borrowing_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Borrowing_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "CategorySubcategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Borrowing_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Borrowing_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Borrowing_liabilityAccountId_fkey" FOREIGN KEY ("liabilityAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Borrowing_receivingAccountId_fkey" FOREIGN KEY ("receivingAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Borrowing_disbursementJournalId_fkey" FOREIGN KEY ("disbursementJournalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Borrowing_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepaymentSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "borrowingId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "totalInstallments" INTEGER NOT NULL DEFAULT 0,
    "totalPrincipal" DECIMAL NOT NULL DEFAULT 0.00,
    "totalInterest" DECIMAL NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepaymentSchedule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepaymentSchedule_borrowingId_fkey" FOREIGN KEY ("borrowingId") REFERENCES "Borrowing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepaymentInstallment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "borrowingId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "principalAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "interestAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "paidPrincipal" DECIMAL NOT NULL DEFAULT 0.00,
    "paidInterest" DECIMAL NOT NULL DEFAULT 0.00,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "remainingAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "paidAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepaymentInstallment_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepaymentInstallment_borrowingId_fkey" FOREIGN KEY ("borrowingId") REFERENCES "Borrowing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepaymentInstallment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "RepaymentSchedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BorrowingFinancialEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "borrowingId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "principalAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "interestAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "journalId" TEXT,
    "reversalOfEventId" TEXT,
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BorrowingFinancialEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BorrowingFinancialEvent_borrowingId_fkey" FOREIGN KEY ("borrowingId") REFERENCES "Borrowing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BorrowingFinancialEvent_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BorrowingFinancialEvent_reversalOfEventId_fkey" FOREIGN KEY ("reversalOfEventId") REFERENCES "BorrowingFinancialEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BorrowingLifecycleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "borrowingId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BorrowingLifecycleHistory_borrowingId_fkey" FOREIGN KEY ("borrowingId") REFERENCES "Borrowing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FundingAssumptionSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'Standard Assumption Set',
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" DATETIME,
    "fixedIncomeLow" DECIMAL NOT NULL DEFAULT 5.00,
    "fixedIncomeBase" DECIMAL NOT NULL DEFAULT 6.50,
    "fixedIncomeHigh" DECIMAL NOT NULL DEFAULT 7.50,
    "investmentLow" DECIMAL NOT NULL DEFAULT 7.00,
    "investmentBase" DECIMAL NOT NULL DEFAULT 11.00,
    "investmentHigh" DECIMAL NOT NULL DEFAULT 14.00,
    "emergencyReserveMonths" INTEGER NOT NULL DEFAULT 6,
    "maxDebtServiceRatio" DECIMAL NOT NULL DEFAULT 0.35,
    "borrowingAnnualInterestRate" DECIMAL,
    "essentialExpenseRatio" DECIMAL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FundingAssumptionSet_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoalFundingPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentPlanId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "strategyType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "score" REAL NOT NULL DEFAULT 0.0,
    "monthlyBurden" DECIMAL NOT NULL DEFAULT 0.00,
    "totalCost" DECIMAL NOT NULL DEFAULT 0.00,
    "riskScore" REAL NOT NULL DEFAULT 0.0,
    "liquidityScore" REAL NOT NULL DEFAULT 100.0,
    "flexibilityScore" REAL NOT NULL DEFAULT 100.0,
    "projectedLow" DECIMAL NOT NULL DEFAULT 0.00,
    "projectedBase" DECIMAL NOT NULL DEFAULT 0.00,
    "projectedHigh" DECIMAL NOT NULL DEFAULT 0.00,
    "fundingGap" DECIMAL NOT NULL DEFAULT 0.00,
    "projectedCompletionDate" DATETIME,
    "planDetailsJson" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "reasonCodes" TEXT NOT NULL,
    "assumptionSetVersion" INTEGER NOT NULL DEFAULT 1,
    "rankingModelVersion" INTEGER NOT NULL DEFAULT 1,
    "rankingWeightsJson" TEXT,
    "calculationDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "approvedByUserId" TEXT,
    "supersededAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoalFundingPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoalFundingPlan_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoalFundingPlan_parentPlanId_fkey" FOREIGN KEY ("parentPlanId") REFERENCES "GoalFundingPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoalFundingPlanLifecycleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "performedBy" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalFundingPlanLifecycleHistory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GoalFundingPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "projectType" TEXT NOT NULL DEFAULT 'PERSONAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "startDate" DATETIME,
    "targetDate" DATETIME,
    "completedAt" DATETIME,
    "ownerMemberId" TEXT,
    "primaryGoalId" TEXT,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Project_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FamilyProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_primaryGoalId_fkey" FOREIGN KEY ("primaryGoalId") REFERENCES "Goal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectFinancialPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "estimatedTotalCost" DECIMAL NOT NULL DEFAULT 0.00,
    "planningStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "reason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectFinancialPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectCostItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "plannedAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "dueDate" DATETIME,
    "categoryId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectCostItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectCostItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectPaymentRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "costItemId" TEXT,
    "name" TEXT NOT NULL,
    "dueDate" DATETIME,
    "plannedAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "committedAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectPaymentRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectPaymentRequirement_costItemId_fkey" FOREIGN KEY ("costItemId") REFERENCES "ProjectCostItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectFundingSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'OWN_CASH',
    "name" TEXT NOT NULL,
    "plannedAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "committedAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "receivedAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "linkedAccountId" TEXT,
    "linkedBorrowingId" TEXT,
    "linkedInvestmentId" TEXT,
    "linkedAssetId" TEXT,
    "linkedGoalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectFundingSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectPaymentAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentRequirementId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectPaymentAllocation_paymentRequirementId_fkey" FOREIGN KEY ("paymentRequirementId") REFERENCES "ProjectPaymentRequirement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectPaymentAllocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "assignedMemberId" TEXT,
    "startDate" DATETIME,
    "dueDate" DATETIME,
    "parentTaskId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectTask_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "ProjectTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectMilestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetDate" DATETIME,
    "achievedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectLifecycleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "performedBy" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectLifecycleHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "userId" TEXT,
    "financialInstitutionId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BANK',
    "balance" DECIMAL NOT NULL DEFAULT 0.00,
    "accountNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isShared" BOOLEAN NOT NULL DEFAULT true,
    "logoMode" TEXT NOT NULL DEFAULT 'AUTO',
    "customLogoUrl" TEXT,
    "iconName" TEXT,
    "creditLimit" DECIMAL,
    "billingCycleDay" INTEGER,
    "paymentDueDate" INTEGER,
    "interestRate" DECIMAL,
    "maturityDate" DATETIME,
    "principalAmount" DECIMAL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FamilyProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_financialInstitutionId_fkey" FOREIGN KEY ("financialInstitutionId") REFERENCES "FinancialInstitution" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("accountNumber", "balance", "billingCycleDay", "createdAt", "creditLimit", "currency", "householdId", "id", "interestRate", "isArchived", "isShared", "maturityDate", "name", "paymentDueDate", "principalAmount", "type", "updatedAt", "userId") SELECT "accountNumber", "balance", "billingCycleDay", "createdAt", "creditLimit", "currency", "householdId", "id", "interestRate", "isArchived", "isShared", "maturityDate", "name", "paymentDueDate", "principalAmount", "type", "updatedAt", "userId" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "scopeId" TEXT,
    "costCenterId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "fundingEligibility" TEXT NOT NULL DEFAULT 'OPTIONAL',
    "description" TEXT,
    "initialValue" DECIMAL NOT NULL DEFAULT 0.00,
    "currentValue" DECIMAL NOT NULL DEFAULT 0.00,
    "value" DECIMAL NOT NULL DEFAULT 0.00,
    "purchaseDate" DATETIME,
    "acquisitionDate" DATETIME,
    "disposedAt" DATETIME,
    "disposalProceeds" DECIMAL,
    "notes" TEXT,
    "assetAccountId" TEXT,
    "acquisitionJournalId" TEXT,
    "archivedAt" DATETIME,
    "archivedByUserId" TEXT,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Asset_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FamilyProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asset_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FinancialScope" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asset_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asset_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asset_acquisitionJournalId_fkey" FOREIGN KEY ("acquisitionJournalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Asset" ("acquisitionDate", "acquisitionJournalId", "archivedAt", "archivedByUserId", "assetAccountId", "category", "createdAt", "currentValue", "description", "disposalProceeds", "disposedAt", "householdId", "id", "initialValue", "name", "notes", "purchaseDate", "status", "type", "updatedAt", "value") SELECT "acquisitionDate", "acquisitionJournalId", "archivedAt", "archivedByUserId", "assetAccountId", "category", "createdAt", "currentValue", "description", "disposalProceeds", "disposedAt", "householdId", "id", "initialValue", "name", "notes", "purchaseDate", "status", "type", "updatedAt", "value" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE TABLE "new_Budget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT,
    "periodType" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "month" INTEGER,
    "year" INTEGER,
    "amount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "categoryId" TEXT,
    "scopeId" TEXT,
    "subcategoryId" TEXT,
    "costCenterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Budget_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Budget_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FinancialScope" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Budget_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "CategorySubcategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Budget_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Budget" ("amount", "categoryId", "createdAt", "householdId", "id", "month", "updatedAt", "year") SELECT "amount", "categoryId", "createdAt", "householdId", "id", "month", "updatedAt", "year" FROM "Budget";
DROP TABLE "Budget";
ALTER TABLE "new_Budget" RENAME TO "Budget";
CREATE INDEX "Budget_householdId_status_startDate_endDate_idx" ON "Budget"("householdId", "status", "startDate", "endDate");
CREATE INDEX "Budget_householdId_categoryId_idx" ON "Budget"("householdId", "categoryId");
CREATE INDEX "Budget_householdId_scopeId_idx" ON "Budget"("householdId", "scopeId");
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'tag',
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "type" TEXT NOT NULL DEFAULT 'EXPENSE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("color", "createdAt", "householdId", "icon", "id", "isDefault", "name", "parentId", "type") SELECT "color", "createdAt", "householdId", "icon", "id", "isDefault", "name", "parentId", "type" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE TABLE "new_Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT,
    "scopeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetAmount" DECIMAL NOT NULL,
    "currentAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "targetDate" DATETIME NOT NULL,
    "category" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "deadlineFlexibility" TEXT NOT NULL DEFAULT 'MODERATE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "monthlyContribution" DECIMAL DEFAULT 0.00,
    "archivedAt" DATETIME,
    "archivedByUserId" TEXT,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Goal_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Goal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Goal_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FamilyProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Goal_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FinancialScope" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Goal" ("accountId", "archivedAt", "archivedByUserId", "category", "createdAt", "currentAmount", "description", "householdId", "id", "name", "priority", "status", "targetAmount", "targetDate", "updatedAt") SELECT "accountId", "archivedAt", "archivedByUserId", "category", "createdAt", "currentAmount", "description", "householdId", "id", "name", "priority", "status", "targetAmount", "targetDate", "updatedAt" FROM "Goal";
DROP TABLE "Goal";
ALTER TABLE "new_Goal" RENAME TO "Goal";
CREATE TABLE "new_IncomeSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "categoryId" TEXT,
    "scopeId" TEXT,
    "description" TEXT,
    "defaultAccountId" TEXT,
    "expectedAmount" DECIMAL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "behavior" TEXT NOT NULL DEFAULT 'RECURRING',
    "frequency" TEXT DEFAULT 'MONTHLY',
    "expectedDay" INTEGER DEFAULT 1,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomeSource_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IncomeSource_defaultAccountId_fkey" FOREIGN KEY ("defaultAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IncomeSource_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IncomeSource_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FinancialScope" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_IncomeSource" ("behavior", "category", "categoryId", "createdAt", "currency", "defaultAccountId", "description", "endDate", "expectedAmount", "expectedDay", "frequency", "householdId", "id", "isActive", "name", "startDate", "updatedAt") SELECT "behavior", "category", "categoryId", "createdAt", "currency", "defaultAccountId", "description", "endDate", "expectedAmount", "expectedDay", "frequency", "householdId", "id", "isActive", "name", "startDate", "updatedAt" FROM "IncomeSource";
DROP TABLE "IncomeSource";
ALTER TABLE "new_IncomeSource" RENAME TO "IncomeSource";
CREATE TABLE "new_Investment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "scopeId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'MUTUAL_FUND',
    "type" TEXT NOT NULL DEFAULT 'MUTUAL_FUND',
    "symbol" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "totalQuantity" DECIMAL NOT NULL DEFAULT 0.00000000,
    "totalCostBasis" DECIMAL NOT NULL DEFAULT 0.00,
    "weightedAverageCost" DECIMAL NOT NULL DEFAULT 0.00,
    "currentPricePerUnit" DECIMAL NOT NULL DEFAULT 0.00,
    "currentMarketValue" DECIMAL NOT NULL DEFAULT 0.00,
    "realizedGainLoss" DECIMAL NOT NULL DEFAULT 0.00,
    "notes" TEXT,
    "investmentAccountId" TEXT,
    "closedAt" DATETIME,
    "archivedAt" DATETIME,
    "archivedByUserId" TEXT,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Investment_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Investment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FamilyProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Investment_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FinancialScope" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Investment_investmentAccountId_fkey" FOREIGN KEY ("investmentAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Investment" ("archivedAt", "archivedByUserId", "category", "closedAt", "createdAt", "currency", "currentMarketValue", "currentPricePerUnit", "description", "householdId", "id", "investmentAccountId", "name", "notes", "realizedGainLoss", "status", "symbol", "totalCostBasis", "totalQuantity", "type", "updatedAt", "weightedAverageCost") SELECT "archivedAt", "archivedByUserId", "category", "closedAt", "createdAt", "currency", "currentMarketValue", "currentPricePerUnit", "description", "householdId", "id", "investmentAccountId", "name", "notes", "realizedGainLoss", "status", "symbol", "totalCostBasis", "totalQuantity", "type", "updatedAt", "weightedAverageCost" FROM "Investment";
DROP TABLE "Investment";
ALTER TABLE "new_Investment" RENAME TO "Investment";
CREATE TABLE "new_InvestmentFinancialEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investmentId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "quantity" DECIMAL DEFAULT 0.00000000,
    "pricePerUnit" DECIMAL DEFAULT 0.00,
    "amount" DECIMAL NOT NULL DEFAULT 0.00,
    "costBasis" DECIMAL DEFAULT 0.00,
    "gainOrLoss" DECIMAL DEFAULT 0.00,
    "journalId" TEXT,
    "reversalOfEventId" TEXT,
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentFinancialEvent_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentFinancialEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentFinancialEvent_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InvestmentFinancialEvent_reversalOfEventId_fkey" FOREIGN KEY ("reversalOfEventId") REFERENCES "InvestmentFinancialEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InvestmentFinancialEvent" ("amount", "costBasis", "createdAt", "createdByUserId", "effectiveDate", "eventType", "gainOrLoss", "householdId", "id", "idempotencyKey", "investmentId", "journalId", "pricePerUnit", "quantity", "reason") SELECT "amount", "costBasis", "createdAt", "createdByUserId", "effectiveDate", "eventType", "gainOrLoss", "householdId", "id", "idempotencyKey", "investmentId", "journalId", "pricePerUnit", "quantity", "reason" FROM "InvestmentFinancialEvent";
DROP TABLE "InvestmentFinancialEvent";
ALTER TABLE "new_InvestmentFinancialEvent" RENAME TO "InvestmentFinancialEvent";
CREATE UNIQUE INDEX "InvestmentFinancialEvent_reversalOfEventId_key" ON "InvestmentFinancialEvent"("reversalOfEventId");
CREATE UNIQUE INDEX "InvestmentFinancialEvent_idempotencyKey_key" ON "InvestmentFinancialEvent"("idempotencyKey");
CREATE INDEX "InvestmentFinancialEvent_investmentId_effectiveDate_idx" ON "InvestmentFinancialEvent"("investmentId", "effectiveDate");
CREATE INDEX "InvestmentFinancialEvent_householdId_effectiveDate_idx" ON "InvestmentFinancialEvent"("householdId", "effectiveDate");
CREATE TABLE "new_Liability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "scopeId" TEXT,
    "costCenterId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "principalAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "outstandingAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "interestRate" DECIMAL NOT NULL DEFAULT 0.00,
    "startDate" DATETIME,
    "dueDate" DATETIME,
    "lender" TEXT,
    "notes" TEXT,
    "liabilityAccountId" TEXT,
    "borrowJournalId" TEXT,
    "archivedAt" DATETIME,
    "archivedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Liability_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Liability_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FinancialScope" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Liability_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Liability_liabilityAccountId_fkey" FOREIGN KEY ("liabilityAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Liability_borrowJournalId_fkey" FOREIGN KEY ("borrowJournalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Liability" ("archivedAt", "archivedByUserId", "borrowJournalId", "category", "createdAt", "description", "dueDate", "householdId", "id", "interestRate", "lender", "liabilityAccountId", "name", "notes", "outstandingAmount", "principalAmount", "startDate", "status", "type", "updatedAt") SELECT "archivedAt", "archivedByUserId", "borrowJournalId", "category", "createdAt", "description", "dueDate", "householdId", "id", "interestRate", "lender", "liabilityAccountId", "name", "notes", "outstandingAmount", "principalAmount", "startDate", "status", "type", "updatedAt" FROM "Liability";
DROP TABLE "Liability";
ALTER TABLE "new_Liability" RENAME TO "Liability";
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "scopeId" TEXT,
    "subcategoryId" TEXT,
    "costCenterId" TEXT,
    "userId" TEXT,
    "profileId" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'EXPENSE',
    "transferAccountId" TEXT,
    "incomeSourceId" TEXT,
    "occurrenceId" TEXT,
    "paymentMethod" TEXT,
    "referenceNo" TEXT,
    "idempotencyKey" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" DATETIME,
    "voidedByUserId" TEXT,
    "refundedAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "refundOfId" TEXT,
    "merchant" TEXT,
    "receiptUrl" TEXT,
    "splitsJson" TEXT,
    "reimbursementStatus" TEXT DEFAULT 'NONE',
    "reimbursedAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "recurringRuleId" TEXT,
    "recurringOccurrenceId" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "postedAt" DATETIME,
    "reconciledAt" DATETIME,
    "reversedAt" DATETIME,
    "archivedAt" DATETIME,
    "archivedByUserId" TEXT,
    "replacementTransactionId" TEXT,
    "journalId" TEXT,
    CONSTRAINT "Transaction_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_transferAccountId_fkey" FOREIGN KEY ("transferAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FinancialScope" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "CategorySubcategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FamilyProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "IncomeOccurrence" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_recurringRuleId_fkey" FOREIGN KEY ("recurringRuleId") REFERENCES "RecurringTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_recurringOccurrenceId_fkey" FOREIGN KEY ("recurringOccurrenceId") REFERENCES "RecurringBillOccurrence" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_replacementTransactionId_fkey" FOREIGN KEY ("replacementTransactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amount", "archivedAt", "archivedByUserId", "categoryId", "createdAt", "date", "description", "householdId", "id", "idempotencyKey", "incomeSourceId", "isRecurring", "isVoided", "journalId", "merchant", "notes", "occurrenceId", "paymentMethod", "postedAt", "receiptUrl", "reconciledAt", "recurringOccurrenceId", "recurringRuleId", "referenceNo", "refundOfId", "refundedAmount", "reimbursedAmount", "reimbursementStatus", "replacementTransactionId", "reversedAt", "splitsJson", "status", "tags", "transferAccountId", "type", "updatedAt", "userId", "voidedAt", "voidedByUserId") SELECT "accountId", "amount", "archivedAt", "archivedByUserId", "categoryId", "createdAt", "date", "description", "householdId", "id", "idempotencyKey", "incomeSourceId", "isRecurring", "isVoided", "journalId", "merchant", "notes", "occurrenceId", "paymentMethod", "postedAt", "receiptUrl", "reconciledAt", "recurringOccurrenceId", "recurringRuleId", "referenceNo", "refundOfId", "refundedAmount", "reimbursedAmount", "reimbursementStatus", "replacementTransactionId", "reversedAt", "splitsJson", "status", "tags", "transferAccountId", "type", "updatedAt", "userId", "voidedAt", "voidedByUserId" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");
CREATE UNIQUE INDEX "Transaction_replacementTransactionId_key" ON "Transaction"("replacementTransactionId");
CREATE UNIQUE INDEX "Transaction_journalId_key" ON "Transaction"("journalId");
CREATE INDEX "Transaction_refundOfId_idx" ON "Transaction"("refundOfId");
CREATE INDEX "Transaction_householdId_status_date_idx" ON "Transaction"("householdId", "status", "date");
CREATE INDEX "Transaction_householdId_accountId_date_idx" ON "Transaction"("householdId", "accountId", "date");
CREATE INDEX "Transaction_householdId_categoryId_date_idx" ON "Transaction"("householdId", "categoryId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FamilyProfile_householdId_idx" ON "FamilyProfile"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyProfile_householdId_name_key" ON "FamilyProfile"("householdId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialInstitution_name_key" ON "FinancialInstitution"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialScope_householdId_name_key" ON "FinancialScope"("householdId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ScopeCategory_scopeId_categoryId_key" ON "ScopeCategory"("scopeId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CategorySubcategory_householdId_categoryId_name_key" ON "CategorySubcategory"("householdId", "categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_householdId_scopeId_name_key" ON "CostCenter"("householdId", "scopeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AlertEvent_fingerprint_key" ON "AlertEvent"("fingerprint");

-- CreateIndex
CREATE INDEX "AlertEvent_alertType_idx" ON "AlertEvent"("alertType");

-- CreateIndex
CREATE INDEX "AlertEvent_status_idx" ON "AlertEvent"("status");

-- CreateIndex
CREATE INDEX "AlertEvent_severity_idx" ON "AlertEvent"("severity");

-- CreateIndex
CREATE INDEX "AlertEvent_householdId_idx" ON "AlertEvent"("householdId");

-- CreateIndex
CREATE INDEX "Lender_householdId_idx" ON "Lender"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "Lender_householdId_name_key" ON "Lender"("householdId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Borrowing_liabilityId_key" ON "Borrowing"("liabilityId");

-- CreateIndex
CREATE INDEX "Borrowing_householdId_idx" ON "Borrowing"("householdId");

-- CreateIndex
CREATE INDEX "Borrowing_householdId_status_idx" ON "Borrowing"("householdId", "status");

-- CreateIndex
CREATE INDEX "Borrowing_lenderId_idx" ON "Borrowing"("lenderId");

-- CreateIndex
CREATE INDEX "Borrowing_scopeId_idx" ON "Borrowing"("scopeId");

-- CreateIndex
CREATE INDEX "RepaymentSchedule_borrowingId_idx" ON "RepaymentSchedule"("borrowingId");

-- CreateIndex
CREATE INDEX "RepaymentSchedule_householdId_idx" ON "RepaymentSchedule"("householdId");

-- CreateIndex
CREATE INDEX "RepaymentInstallment_borrowingId_dueDate_idx" ON "RepaymentInstallment"("borrowingId", "dueDate");

-- CreateIndex
CREATE INDEX "RepaymentInstallment_householdId_status_dueDate_idx" ON "RepaymentInstallment"("householdId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "RepaymentInstallment_borrowingId_installmentNumber_key" ON "RepaymentInstallment"("borrowingId", "installmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BorrowingFinancialEvent_reversalOfEventId_key" ON "BorrowingFinancialEvent"("reversalOfEventId");

-- CreateIndex
CREATE UNIQUE INDEX "BorrowingFinancialEvent_idempotencyKey_key" ON "BorrowingFinancialEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BorrowingFinancialEvent_borrowingId_effectiveDate_idx" ON "BorrowingFinancialEvent"("borrowingId", "effectiveDate");

-- CreateIndex
CREATE INDEX "BorrowingFinancialEvent_householdId_effectiveDate_idx" ON "BorrowingFinancialEvent"("householdId", "effectiveDate");

-- CreateIndex
CREATE INDEX "BorrowingLifecycleHistory_borrowingId_idx" ON "BorrowingLifecycleHistory"("borrowingId");

-- CreateIndex
CREATE INDEX "BorrowingLifecycleHistory_householdId_idx" ON "BorrowingLifecycleHistory"("householdId");

-- CreateIndex
CREATE INDEX "FundingAssumptionSet_householdId_active_idx" ON "FundingAssumptionSet"("householdId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FundingAssumptionSet_householdId_version_key" ON "FundingAssumptionSet"("householdId", "version");

-- CreateIndex
CREATE INDEX "GoalFundingPlan_householdId_goalId_status_idx" ON "GoalFundingPlan"("householdId", "goalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GoalFundingPlan_goalId_version_key" ON "GoalFundingPlan"("goalId", "version");

-- CreateIndex
CREATE INDEX "GoalFundingPlanLifecycleHistory_planId_idx" ON "GoalFundingPlanLifecycleHistory"("planId");

-- CreateIndex
CREATE INDEX "GoalFundingPlanLifecycleHistory_householdId_idx" ON "GoalFundingPlanLifecycleHistory"("householdId");

-- CreateIndex
CREATE INDEX "Project_householdId_idx" ON "Project"("householdId");

-- CreateIndex
CREATE INDEX "Project_householdId_status_idx" ON "Project"("householdId", "status");

-- CreateIndex
CREATE INDEX "Project_primaryGoalId_idx" ON "Project"("primaryGoalId");

-- CreateIndex
CREATE INDEX "ProjectFinancialPlan_projectId_planningStatus_idx" ON "ProjectFinancialPlan"("projectId", "planningStatus");

-- CreateIndex
CREATE INDEX "ProjectFinancialPlan_householdId_idx" ON "ProjectFinancialPlan"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFinancialPlan_projectId_version_key" ON "ProjectFinancialPlan"("projectId", "version");

-- CreateIndex
CREATE INDEX "ProjectCostItem_projectId_idx" ON "ProjectCostItem"("projectId");

-- CreateIndex
CREATE INDEX "ProjectCostItem_householdId_idx" ON "ProjectCostItem"("householdId");

-- CreateIndex
CREATE INDEX "ProjectCostItem_categoryId_idx" ON "ProjectCostItem"("categoryId");

-- CreateIndex
CREATE INDEX "ProjectPaymentRequirement_projectId_idx" ON "ProjectPaymentRequirement"("projectId");

-- CreateIndex
CREATE INDEX "ProjectPaymentRequirement_householdId_idx" ON "ProjectPaymentRequirement"("householdId");

-- CreateIndex
CREATE INDEX "ProjectPaymentRequirement_status_idx" ON "ProjectPaymentRequirement"("status");

-- CreateIndex
CREATE INDEX "ProjectFundingSource_projectId_idx" ON "ProjectFundingSource"("projectId");

-- CreateIndex
CREATE INDEX "ProjectFundingSource_householdId_idx" ON "ProjectFundingSource"("householdId");

-- CreateIndex
CREATE INDEX "ProjectFundingSource_sourceType_idx" ON "ProjectFundingSource"("sourceType");

-- CreateIndex
CREATE INDEX "ProjectPaymentAllocation_paymentRequirementId_idx" ON "ProjectPaymentAllocation"("paymentRequirementId");

-- CreateIndex
CREATE INDEX "ProjectPaymentAllocation_transactionId_idx" ON "ProjectPaymentAllocation"("transactionId");

-- CreateIndex
CREATE INDEX "ProjectPaymentAllocation_householdId_idx" ON "ProjectPaymentAllocation"("householdId");

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_idx" ON "ProjectTask"("projectId");

-- CreateIndex
CREATE INDEX "ProjectTask_householdId_idx" ON "ProjectTask"("householdId");

-- CreateIndex
CREATE INDEX "ProjectTask_status_idx" ON "ProjectTask"("status");

-- CreateIndex
CREATE INDEX "ProjectMilestone_projectId_idx" ON "ProjectMilestone"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMilestone_householdId_idx" ON "ProjectMilestone"("householdId");

-- CreateIndex
CREATE INDEX "ProjectMilestone_status_idx" ON "ProjectMilestone"("status");

-- CreateIndex
CREATE INDEX "ProjectLifecycleHistory_projectId_idx" ON "ProjectLifecycleHistory"("projectId");

-- CreateIndex
CREATE INDEX "ProjectLifecycleHistory_householdId_idx" ON "ProjectLifecycleHistory"("householdId");

-- CreateIndex
CREATE INDEX "AssetFinancialEvent_assetId_effectiveDate_idx" ON "AssetFinancialEvent"("assetId", "effectiveDate");

-- CreateIndex
CREATE INDEX "AssetFinancialEvent_householdId_effectiveDate_idx" ON "AssetFinancialEvent"("householdId", "effectiveDate");

-- CreateIndex
CREATE INDEX "Journal_householdId_status_date_idx" ON "Journal"("householdId", "status", "date");

-- CreateIndex
CREATE INDEX "LiabilityFinancialEvent_liabilityId_effectiveDate_idx" ON "LiabilityFinancialEvent"("liabilityId", "effectiveDate");

-- CreateIndex
CREATE INDEX "LiabilityFinancialEvent_householdId_effectiveDate_idx" ON "LiabilityFinancialEvent"("householdId", "effectiveDate");

