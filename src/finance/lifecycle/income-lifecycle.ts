export type IncomeStatus = "EXPECTED" | "CONFIRMED" | "CREDITED" | "RECONCILED" | "CANCELLED" | "REVERSED" | "ARCHIVED";

export class IncomeLifecycle {
  /**
   * EXPECTED or CONFIRMED income records can be edited. Credited/Reconciled are immutable.
   */
  static canEdit(status: IncomeStatus): boolean {
    return status === "EXPECTED" || status === "CONFIRMED";
  }

  /**
   * EXPECTED income can be confirmed.
   */
  static canConfirm(status: IncomeStatus): boolean {
    return status === "EXPECTED";
  }

  /**
   * Only CONFIRMED income can be credited to the account balance.
   */
  static canCredit(status: IncomeStatus): boolean {
    return status === "CONFIRMED";
  }

  /**
   * CREDITED income can be reconciled.
   */
  static canReconcile(status: IncomeStatus): boolean {
    return status === "CREDITED";
  }

  /**
   * EXPECTED or CONFIRMED income can be cancelled.
   */
  static canCancel(status: IncomeStatus): boolean {
    return status === "EXPECTED" || status === "CONFIRMED";
  }

  /**
   * CREDITED income can be reversed.
   */
  static canReverse(status: IncomeStatus): boolean {
    return status === "CREDITED";
  }

  /**
   * Any non-archived status can be archived.
   */
  static canArchive(status: IncomeStatus): boolean {
    return status !== "ARCHIVED";
  }

  /**
   * ARCHIVED income can be restored.
   */
  static canRestore(status: IncomeStatus): boolean {
    return status === "ARCHIVED";
  }

  /**
   * Validate income transition matrix.
   */
  static assertCanTransition(from: IncomeStatus, to: IncomeStatus, action: string): void {
    if (from === to) return;

    if (to === "CONFIRMED" && !this.canConfirm(from)) {
      throw new Error(`INVALID_TRANSITION: Income must be in EXPECTED status before it can be CONFIRMED. Current status: ${from}`);
    }

    if (to === "CREDITED" && !this.canCredit(from)) {
      throw new Error(`INVALID_TRANSITION: Income must be CONFIRMED before it can be CREDITED. Current status: ${from}`);
    }

    if (to === "RECONCILED" && !this.canReconcile(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot reconcile income in ${from} status`);
    }

    if (to === "CANCELLED" && !this.canCancel(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot cancel income in ${from} status`);
    }

    if (to === "REVERSED" && !this.canReverse(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot reverse income in ${from} status`);
    }

    if (to === "ARCHIVED" && !this.canArchive(from)) {
      throw new Error(`INVALID_TRANSITION: Income record is already archived`);
    }

    if (from === "ARCHIVED" && to !== "ARCHIVED" && !this.canRestore(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot restore income from ${from} status`);
    }
  }
}
