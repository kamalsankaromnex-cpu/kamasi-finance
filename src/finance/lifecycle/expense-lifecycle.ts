export type ExpenseStatus =
  | "DRAFT"
  | "POSTED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "RECONCILED"
  | "REVERSED"
  | "ARCHIVED";

export class ExpenseLifecycle {
  /**
   * Only DRAFT expenses can be edited.
   */
  static canEdit(status: ExpenseStatus): boolean {
    return status === "DRAFT";
  }

  /**
   * Only DRAFT expenses can be posted.
   */
  static canPost(status: ExpenseStatus): boolean {
    return status === "DRAFT";
  }

  /**
   * POSTED or PARTIALLY_REFUNDED expenses can accept refunds.
   */
  static canRefund(status: ExpenseStatus): boolean {
    return status === "POSTED" || status === "PARTIALLY_REFUNDED";
  }

  /**
   * POSTED, PARTIALLY_REFUNDED, or REFUNDED expenses can be reconciled.
   */
  static canReconcile(status: ExpenseStatus): boolean {
    return status === "POSTED" || status === "PARTIALLY_REFUNDED" || status === "REFUNDED";
  }

  /**
   * POSTED, PARTIALLY_REFUNDED, or RECONCILED expenses can be reversed.
   */
  static canReverse(status: ExpenseStatus): boolean {
    return status === "POSTED" || status === "PARTIALLY_REFUNDED" || status === "RECONCILED";
  }

  /**
   * Any non-archived status can be archived.
   */
  static canArchive(status: ExpenseStatus): boolean {
    return status !== "ARCHIVED";
  }

  /**
   * ARCHIVED expenses can be restored.
   */
  static canRestore(status: ExpenseStatus): boolean {
    return status === "ARCHIVED";
  }

  /**
   * Validate expense transition matrix.
   */
  static assertCanTransition(from: ExpenseStatus, to: ExpenseStatus, action: string): void {
    if (from === to) return;

    if (to === "DRAFT" && from !== "DRAFT") {
      throw new Error(`INVALID_TRANSITION: Cannot transition expense in ${from} status back to DRAFT`);
    }

    if (to === "POSTED" && !this.canPost(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot post expense in ${from} status`);
    }

    if ((to === "PARTIALLY_REFUNDED" || to === "REFUNDED") && !this.canRefund(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot process refund for expense in ${from} status`);
    }

    if (to === "RECONCILED" && !this.canReconcile(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot reconcile expense in ${from} status`);
    }

    if (to === "REVERSED" && !this.canReverse(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot reverse expense in ${from} status`);
    }

    if (to === "ARCHIVED" && !this.canArchive(from)) {
      throw new Error(`INVALID_TRANSITION: Expense record is already archived`);
    }

    if (from === "ARCHIVED" && to !== "ARCHIVED" && !this.canRestore(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot restore expense from ${from} status`);
    }
  }
}
