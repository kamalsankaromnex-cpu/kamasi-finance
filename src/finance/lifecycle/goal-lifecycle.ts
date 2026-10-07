export type GoalStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";

export class GoalLifecycle {
  /**
   * Only ACTIVE goals permit editing parameters.
   */
  static canEdit(status: GoalStatus): boolean {
    return status === "ACTIVE";
  }

  /**
   * Only ACTIVE goals permit new savings contributions.
   * PAUSED, COMPLETED, and ARCHIVED goals disallow contributions.
   */
  static canContribute(status: GoalStatus): boolean {
    return status === "ACTIVE";
  }

  /**
   * Only ACTIVE goals permit savings withdrawals.
   * PAUSED, COMPLETED, and ARCHIVED goals disallow withdrawals.
   */
  static canWithdraw(status: GoalStatus): boolean {
    return status === "ACTIVE";
  }

  /**
   * ACTIVE goals can be PAUSED.
   */
  static canPause(status: GoalStatus): boolean {
    return status === "ACTIVE";
  }

  /**
   * PAUSED goals can be RESUMED (transitioned back to ACTIVE).
   */
  static canResume(status: GoalStatus): boolean {
    return status === "PAUSED";
  }

  /**
   * ACTIVE goals can be marked COMPLETED when currentAmount >= targetAmount.
   */
  static canComplete(status: GoalStatus): boolean {
    return status === "ACTIVE";
  }

  /**
   * Any non-archived status can be ARCHIVED.
   */
  static canArchive(status: GoalStatus): boolean {
    return status !== "ARCHIVED";
  }

  /**
   * ARCHIVED goals can be RESTORED.
   */
  static canRestore(status: GoalStatus): boolean {
    return status === "ARCHIVED";
  }

  /**
   * Validate goal transition matrix.
   */
  static assertCanTransition(from: GoalStatus, to: GoalStatus, action: string): void {
    if (from === to) return;

    if (to === "PAUSED" && !this.canPause(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot pause goal in ${from} status`);
    }

    if (to === "ACTIVE" && from === "PAUSED" && !this.canResume(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot resume goal from ${from} status`);
    }

    if (to === "COMPLETED" && !this.canComplete(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot mark goal completed in ${from} status`);
    }

    if (to === "ARCHIVED" && !this.canArchive(from)) {
      throw new Error(`INVALID_TRANSITION: Goal is already archived`);
    }

    if (from === "ARCHIVED" && to !== "ARCHIVED" && !this.canRestore(from)) {
      throw new Error(`INVALID_TRANSITION: Cannot restore goal from ${from} status`);
    }

    if ((from === "PAUSED" || from === "COMPLETED" || from === "ARCHIVED") && (action === "contribute" || action === "withdraw")) {
      throw new Error(`INVALID_TRANSITION: Cannot ${action} on goal in ${from} status`);
    }
  }
}
