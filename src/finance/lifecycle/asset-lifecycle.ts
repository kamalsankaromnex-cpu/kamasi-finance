export type AssetStatus = "DRAFT" | "ACTIVE" | "DISPOSED" | "ARCHIVED";

export interface AssetStatusTransition {
  from: AssetStatus;
  to: AssetStatus;
  action: string;
}

export class AssetLifecycle {
  private static VALID_TRANSITIONS: AssetStatusTransition[] = [
    { from: "DRAFT", to: "DRAFT", action: "edit" },
    { from: "DRAFT", to: "ACTIVE", action: "acquire" },
    { from: "ACTIVE", to: "ACTIVE", action: "revalue" },
    { from: "ACTIVE", to: "ACTIVE", action: "edit" },
    { from: "ACTIVE", to: "DISPOSED", action: "dispose" },
    { from: "ACTIVE", to: "ARCHIVED", action: "archive" },
    { from: "DISPOSED", to: "ARCHIVED", action: "archive" },
    { from: "ARCHIVED", to: "ACTIVE", action: "restore" },
    { from: "ARCHIVED", to: "DISPOSED", action: "restore" },
    { from: "ARCHIVED", to: "DRAFT", action: "restore" },
  ];

  static canTransition(from: AssetStatus, to: AssetStatus, action: string): boolean {
    return this.VALID_TRANSITIONS.some(
      (t) => t.from === from && t.to === to && t.action === action
    );
  }

  static assertCanTransition(from: AssetStatus, to: AssetStatus, action: string): void {
    if (!this.canTransition(from, to, action)) {
      throw new Error(
        `INVALID_ASSET_LIFECYCLE_TRANSITION: Cannot perform '${action}' from '${from}' to '${to}'.`
      );
    }
  }

  static canEdit(status: AssetStatus): boolean {
    return status === "DRAFT" || status === "ACTIVE";
  }

  static canAcquire(status: AssetStatus): boolean {
    return status === "DRAFT";
  }

  static canRevalue(status: AssetStatus): boolean {
    return status === "ACTIVE";
  }

  static canDispose(status: AssetStatus): boolean {
    return status === "ACTIVE";
  }

  static canArchive(status: AssetStatus): boolean {
    return status === "ACTIVE" || status === "DISPOSED";
  }

  static canRestore(status: AssetStatus): boolean {
    return status === "ARCHIVED";
  }
}
