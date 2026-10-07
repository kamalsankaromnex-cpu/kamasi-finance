export type LiabilityStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PARTIALLY_SETTLED"
  | "SETTLED"
  | "ARCHIVED";

export interface LiabilityStatusTransition {
  from: LiabilityStatus;
  to: LiabilityStatus;
  action: string;
}

export class LiabilityLifecycle {
  private static VALID_TRANSITIONS: LiabilityStatusTransition[] = [
    { from: "DRAFT", to: "DRAFT", action: "edit" },
    { from: "DRAFT", to: "ACTIVE", action: "borrow" },
    { from: "ACTIVE", to: "ACTIVE", action: "accrue_interest" },
    { from: "ACTIVE", to: "ACTIVE", action: "edit" },
    { from: "ACTIVE", to: "PARTIALLY_SETTLED", action: "repay" },
    { from: "ACTIVE", to: "SETTLED", action: "repay" },
    { from: "ACTIVE", to: "SETTLED", action: "settle" },
    { from: "PARTIALLY_SETTLED", to: "PARTIALLY_SETTLED", action: "accrue_interest" },
    { from: "PARTIALLY_SETTLED", to: "PARTIALLY_SETTLED", action: "edit" },
    { from: "PARTIALLY_SETTLED", to: "PARTIALLY_SETTLED", action: "repay" },
    { from: "PARTIALLY_SETTLED", to: "SETTLED", action: "repay" },
    { from: "PARTIALLY_SETTLED", to: "SETTLED", action: "settle" },
    { from: "ACTIVE", to: "ARCHIVED", action: "archive" },
    { from: "PARTIALLY_SETTLED", to: "ARCHIVED", action: "archive" },
    { from: "SETTLED", to: "ARCHIVED", action: "archive" },
    { from: "ARCHIVED", to: "ACTIVE", action: "restore" },
    { from: "ARCHIVED", to: "PARTIALLY_SETTLED", action: "restore" },
    { from: "ARCHIVED", to: "SETTLED", action: "restore" },
    { from: "ARCHIVED", to: "DRAFT", action: "restore" },
  ];

  static canTransition(from: LiabilityStatus, to: LiabilityStatus, action: string): boolean {
    return this.VALID_TRANSITIONS.some(
      (t) => t.from === from && t.to === to && t.action === action
    );
  }

  static assertCanTransition(from: LiabilityStatus, to: LiabilityStatus, action: string): void {
    if (!this.canTransition(from, to, action)) {
      throw new Error(
        `INVALID_LIABILITY_LIFECYCLE_TRANSITION: Cannot perform '${action}' from '${from}' to '${to}'.`
      );
    }
  }

  static canEdit(status: LiabilityStatus): boolean {
    return status === "DRAFT" || status === "ACTIVE" || status === "PARTIALLY_SETTLED";
  }

  static canBorrow(status: LiabilityStatus): boolean {
    return status === "DRAFT";
  }

  static canAccrueInterest(status: LiabilityStatus): boolean {
    return status === "ACTIVE" || status === "PARTIALLY_SETTLED";
  }

  static canRepay(status: LiabilityStatus): boolean {
    return status === "ACTIVE" || status === "PARTIALLY_SETTLED";
  }

  static canArchive(status: LiabilityStatus): boolean {
    return status === "ACTIVE" || status === "PARTIALLY_SETTLED" || status === "SETTLED";
  }

  static canRestore(status: LiabilityStatus): boolean {
    return status === "ARCHIVED";
  }
}
