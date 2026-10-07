export type ProjectType =
  | "PERSONAL"
  | "FAMILY"
  | "MARRIAGE"
  | "HOME"
  | "PROPERTY"
  | "AGRICULTURE"
  | "LIVESTOCK"
  | "BUSINESS"
  | "EQUIPMENT"
  | "EDUCATION"
  | "VEHICLE"
  | "OTHER";

export type ProjectStatus =
  | "DRAFT"
  | "PLANNED"
  | "ACTIVE"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED";

export type ProjectPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ProjectHealthStatus =
  | "ON_TRACK"
  | "FUNDING_GAP"
  | "BUDGET_RISK"
  | "PAYMENT_DUE"
  | "PAYMENT_OVERDUE"
  | "EXECUTION_DELAY"
  | "FUNDING_RISK"
  | "COMPLETED";

export type CostItemStatus = "PLANNED" | "COMMITTED" | "COMPLETED" | "CANCELLED";

export type PaymentRequirementStatus =
  | "PLANNED"
  | "COMMITTED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export type FundingSourceType =
  | "OWN_CASH"
  | "INCOME"
  | "INVESTMENT"
  | "ASSET_SALE"
  | "BORROWING"
  | "OTHER";

export type FundingSourceStatus =
  | "PLANNED"
  | "COMMITTED"
  | "RECEIVED"
  | "ALLOCATED"
  | "USED"
  | "CANCELLED";

export type ProjectTaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";

export type ProjectMilestoneStatus = "PLANNED" | "IN_PROGRESS" | "ACHIEVED" | "CANCELLED";

export interface CreateProjectInput {
  householdId: string;
  name: string;
  description?: string | null;
  notes?: string | null;
  projectType?: ProjectType;
  priority?: ProjectPriority;
  startDate?: Date | string | null;
  targetDate?: Date | string | null;
  ownerMemberId?: string | null;
  primaryGoalId?: string | null;
  estimatedTotalCost?: number;
  userId?: string | null;
}

export interface UpdateProjectInput {
  householdId: string;
  projectId: string;
  name?: string;
  description?: string | null;
  notes?: string | null;
  projectType?: ProjectType;
  priority?: ProjectPriority;
  startDate?: Date | string | null;
  targetDate?: Date | string | null;
  ownerMemberId?: string | null;
  primaryGoalId?: string | null;
  userId?: string | null;
}

export interface TransitionProjectStatusInput {
  householdId: string;
  projectId: string;
  toStatus: ProjectStatus;
  reason?: string | null;
  userId?: string | null;
}

export interface CreateFinancialPlanVersionInput {
  householdId: string;
  projectId: string;
  estimatedTotalCost: number;
  notes?: string | null;
  reason?: string | null;
  userId?: string | null;
}

export interface CreateCostItemInput {
  householdId: string;
  projectId: string;
  name: string;
  description?: string | null;
  plannedAmount: number;
  dueDate?: Date | string | null;
  categoryId?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  userId?: string | null;
}

export interface CreatePaymentRequirementInput {
  householdId: string;
  projectId: string;
  costItemId?: string | null;
  name: string;
  dueDate?: Date | string | null;
  plannedAmount: number;
  committedAmount?: number;
  userId?: string | null;
}

export interface CreateFundingSourceInput {
  householdId: string;
  projectId: string;
  sourceType: FundingSourceType;
  name: string;
  plannedAmount: number;
  committedAmount?: number;
  receivedAmount?: number;
  notes?: string | null;
  linkedAccountId?: string | null;
  linkedBorrowingId?: string | null;
  linkedInvestmentId?: string | null;
  linkedAssetId?: string | null;
  linkedGoalId?: string | null;
  userId?: string | null;
}

export interface AllocatePaymentInput {
  householdId: string;
  projectId: string;
  paymentRequirementId: string;
  transactionId: string;
  allocatedAmount?: number;
  notes?: string | null;
  userId?: string | null;
}

export interface CreateTaskInput {
  householdId: string;
  projectId: string;
  title: string;
  description?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assignedMemberId?: string | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  parentTaskId?: string | null;
  userId?: string | null;
}

export interface CreateMilestoneInput {
  householdId: string;
  projectId: string;
  title: string;
  description?: string | null;
  targetDate?: Date | string | null;
  order?: number;
  userId?: string | null;
}

export interface ProjectFinancialSnapshot {
  project: {
    id: string;
    householdId: string;
    name: string;
    description: string | null;
    projectType: string;
    status: string;
    priority: string;
    startDate: string | null;
    targetDate: string | null;
    completedAt: string | null;
    version: number;
  };
  health: {
    status: ProjectHealthStatus;
    reasons: string[];
  };
  metrics: {
    estimatedCost: number;
    budgetedAmount: number;
    committedAmount: number;
    actualPaidAmount: number;
    remainingPlannedCost: number;
    securedFunding: number;
    plannedFunding: number;
    fundingGap: number;
    executionProgressPercent: number;
    financialProgressPercent: number;
    fundingProgressPercent: number;
  };
  plan: {
    currentVersion: number;
    estimatedTotalCost: number;
    versionsCount: number;
  };
  funding: {
    totalPlanned: number;
    totalCommitted: number;
    totalReceived: number;
    sources: Array<{
      id: string;
      sourceType: string;
      name: string;
      plannedAmount: number;
      committedAmount: number;
      receivedAmount: number;
      status: string;
      linkedBorrowingId?: string | null;
      linkedAccountId?: string | null;
      linkedInvestmentId?: string | null;
      linkedAssetId?: string | null;
      linkedGoalId?: string | null;
    }>;
  };
  payments: {
    totalPlanned: number;
    totalCommitted: number;
    totalPaid: number;
    totalRemaining: number;
    items: Array<{
      id: string;
      name: string;
      dueDate: string | null;
      plannedAmount: number;
      committedAmount: number;
      paidAmount: number;
      remainingAmount: number;
      status: string;
      allocationsCount: number;
    }>;
  };
  costItems: Array<{
    id: string;
    name: string;
    plannedAmount: number;
    categoryName?: string;
    status: string;
    priority: string;
  }>;
  tasks: {
    total: number;
    completed: number;
    pending: number;
    items: Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      dueDate: string | null;
    }>;
  };
  milestones: {
    total: number;
    achieved: number;
    items: Array<{
      id: string;
      title: string;
      targetDate: string | null;
      status: string;
      achievedAt: string | null;
    }>;
  };
  linkedEntities: {
    goal?: { id: string; name: string; targetAmount: number; currentAmount: number } | null;
    borrowings: Array<{ id: string; name: string; principal: number; outstanding: number; status: string }>;
  };
}
