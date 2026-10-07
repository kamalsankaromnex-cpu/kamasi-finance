export type TransferStatus = "DRAFT" | "POSTED" | "RECONCILED" | "REVERSED" | "ARCHIVED";

export class TransferLifecycle {
  /**
   * Only DRAFT transfers can be edited.
   */
  static canEdit(status: TransferStatus): boolean {
    return status === "DRAFT";
  }

  /**
   * Only DRAFT transfers can be posted.
   */
  static canPost(status: TransferStatus): boolean {
    return status === "DRAFT";
  }

  /**
   * POSTED transfers can be reconciled.
   */
  static canReconcile(status: TransferStatus): boolean {
    return status === "POSTED";
  }

  /**
   * POSTED and RECONCILED transfers can be reversed.
   */
  static canReverse(status: TransferStatus): boolean {
    return status === "POSTED" || status === "RECONCILED";
  }

  /**
   * Any non-archived status can be archived.
   */
  static canArchive(status: TransferStatus): boolean {
    return status !== "ARCHIVED";
  }

  /**
   * ARCHIVED transfers can be restored.
   */
  static canRestore(status: TransferStatus): boolean {
    return status === "ARCHIVED";
  }

  /**
   * Validate transfer transition matrix.
   */
  static assertCanTransition(from: TransferStatus, to: TransferStatus, action: string): void {
    if (to === "REVERSED" && !this.canReverse(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot reverse transfer in ${from} status`);
    }

    if (from === to) return;

    if (to === "DRAFT" && from !== "DRAFT") {
      throw new Error(`INVALID_TRANSITION: Cannot transition transfer in ${from} status back to DRAFT`);
    }

    if (to === "POSTED" && !this.canPost(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot post transfer in ${from} status`);
    }

    if (to === "RECONCILED" && !this.canReconcile(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot reconcile transfer in ${from} status`);
    }

    if (to === "ARCHIVED" && !this.canArchive(from)) {
      throw new Error(`INVALID_TRANSITION: Transfer record is already archived`);
    }

    if (from === "ARCHIVED" && to !== "ARCHIVED" && !this.canRestore(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot restore transfer from ${from} status`);
    }

    if (from === "REVERSED" && to !== "ARCHIVED") {
      throw new Error(`INVALID_TRANSITION: Reversed transfers are locked and cannot transition to ${to}`);
    }
  }
}
