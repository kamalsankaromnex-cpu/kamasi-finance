export type TransactionStatus = "DRAFT" | "POSTED" | "RECONCILED" | "REVERSED" | "ARCHIVED";

export class TransactionLifecycle {
  /**
   * Only DRAFT transactions may be edited.
   * Posted, Reconciled, Reversed, or Archived transactions are immutable.
   */
  static canEdit(status: TransactionStatus): boolean {
    return status === "DRAFT";
  }

  /**
   * Only DRAFT transactions can be posted to the double-entry ledger.
   */
  static canPost(status: TransactionStatus): boolean {
    return status === "DRAFT";
  }

  /**
   * POSTED transactions can be reconciled.
   */
  static canReconcile(status: TransactionStatus): boolean {
    return status === "POSTED";
  }

  /**
   * POSTED and RECONCILED transactions can be reversed via compensating journal.
   */
  static canReverse(status: TransactionStatus): boolean {
    return status === "POSTED" || status === "RECONCILED";
  }

  /**
   * Any active status can be archived.
   */
  static canArchive(status: TransactionStatus): boolean {
    return status !== "ARCHIVED";
  }

  /**
   * ARCHIVED transactions can be restored to their previous non-archived state.
   */
  static canRestore(status: TransactionStatus): boolean {
    return status === "ARCHIVED";
  }

  /**
   * Validate transition matrix and throw explicit error if invalid.
   */
  static assertCanTransition(from: TransactionStatus, to: TransactionStatus, action: string): void {
    if (to === "REVERSED" && !this.canReverse(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot reverse transaction in ${from} status`);
    }

    if (from === to) return;

    if (to === "DRAFT" && from !== "DRAFT") {
      throw new Error(`INVALID_TRANSITION: Cannot transition transaction in ${from} status back to DRAFT`);
    }

    if (to === "POSTED" && !this.canPost(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot post transaction in ${from} status`);
    }

    if (to === "RECONCILED" && !this.canReconcile(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot reconcile transaction in ${from} status`);
    }

    if (to === "ARCHIVED" && !this.canArchive(from)) {
      throw new Error(`INVALID_TRANSITION: Transaction is already archived`);
    }

    if (from === "ARCHIVED" && to !== "ARCHIVED" && !this.canRestore(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot restore transaction from ${from} status`);
    }

    if (from === "REVERSED" && to !== "ARCHIVED") {
      throw new Error(`INVALID_TRANSITION: Reversed transactions are locked and cannot transition to ${to}`);
    }
  }
}
