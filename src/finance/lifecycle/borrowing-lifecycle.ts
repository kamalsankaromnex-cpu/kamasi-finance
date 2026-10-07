export type BorrowingStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PARTIALLY_SETTLED"
  | "SETTLED"
  | "CANCELLED"
  | "ARCHIVED";

export interface BorrowingStatusTransition {
  from: BorrowingStatus;
  to: BorrowingStatus;
  action: string;
}

export class BorrowingLifecycle {
  private static VALID_TRANSITIONS: BorrowingStatusTransition[] = [
    { from: "DRAFT", to: "DRAFT", action: "edit" },
    { from: "DRAFT", to: "ACTIVE", action: "disburse" },
    { from: "DRAFT", to: "CANCELLED", action: "cancel" },

    { from: "ACTIVE", to: "ACTIVE", action: "edit" },
    { from: "ACTIVE", to: "ACTIVE", action: "accrue_interest" },
    { from: "ACTIVE", to: "PARTIALLY_SETTLED", action: "repay" },
    { from: "ACTIVE", to: "SETTLED", action: "repay" },
    { from: "ACTIVE", to: "SETTLED", action: "settle" },
    { from: "ACTIVE", to: "CANCELLED", action: "reverse_disbursement" },

    { from: "PARTIALLY_SETTLED", to: "PARTIALLY_SETTLED", action: "edit" },
    { from: "PARTIALLY_SETTLED", to: "PARTIALLY_SETTLED", action: "accrue_interest" },
    { from: "PARTIALLY_SETTLED", to: "PARTIALLY_SETTLED", action: "repay" },
    { from: "PARTIALLY_SETTLED", to: "ACTIVE", action: "reverse_repayment" },
    { from: "PARTIALLY_SETTLED", to: "PARTIALLY_SETTLED", action: "reverse_repayment" },
    { from: "PARTIALLY_SETTLED", to: "SETTLED", action: "repay" },
    { from: "PARTIALLY_SETTLED", to: "SETTLED", action: "settle" },

    { from: "SETTLED", to: "SETTLED", action: "edit" },
    { from: "SETTLED", to: "PARTIALLY_SETTLED", action: "reverse_repayment" },
    { from: "SETTLED", to: "ACTIVE", action: "reverse_repayment" },

    { from: "ACTIVE", to: "ARCHIVED", action: "archive" },
    { from: "PARTIALLY_SETTLED", to: "ARCHIVED", action: "archive" },
    { from: "SETTLED", to: "ARCHIVED", action: "archive" },
    { from: "CANCELLED", to: "ARCHIVED", action: "archive" },

    { from: "ARCHIVED", to: "ACTIVE", action: "restore" },
    { from: "ARCHIVED", to: "PARTIALLY_SETTLED", action: "restore" },
    { from: "ARCHIVED", to: "SETTLED", action: "restore" },
    { from: "ARCHIVED", to: "DRAFT", action: "restore" },
    { from: "ARCHIVED", to: "CANCELLED", action: "restore" },
  ];

  static canTransition(from: BorrowingStatus, to: BorrowingStatus, action: string): boolean {
    return this.VALID_TRANSITIONS.some(
      (t) => t.from === from && t.to === to && t.action === action
    );
  }

  static assertCanTransition(from: BorrowingStatus, to: BorrowingStatus, action: string): void {
    if (!this.canTransition(from, to, action)) {
      throw new Error(
        `INVALID_BORROWING_LIFECYCLE_TRANSITION: Cannot perform '${action}' from '${from}' to '${to}'.`
      );
    }
  }

  static canEdit(status: BorrowingStatus): boolean {
    return status === "DRAFT" || status === "ACTIVE" || status === "PARTIALLY_SETTLED";
  }

  static canDisburse(status: BorrowingStatus): boolean {
    return status === "DRAFT";
  }

  static canAccrueInterest(status: BorrowingStatus): boolean {
    return status === "ACTIVE" || status === "PARTIALLY_SETTLED";
  }

  static canRepay(status: BorrowingStatus): boolean {
    return status === "ACTIVE" || status === "PARTIALLY_SETTLED";
  }

  static canSettle(status: BorrowingStatus): boolean {
    return status === "ACTIVE" || status === "PARTIALLY_SETTLED";
  }

  static canArchive(status: BorrowingStatus): boolean {
    return ["ACTIVE", "PARTIALLY_SETTLED", "SETTLED", "CANCELLED"].includes(status);
  }

  static canRestore(status: BorrowingStatus): boolean {
    return status === "ARCHIVED";
  }

  static canGenerateSchedule(status: BorrowingStatus): boolean {
    return status === "DRAFT" || status === "ACTIVE" || status === "PARTIALLY_SETTLED";
  }
}
