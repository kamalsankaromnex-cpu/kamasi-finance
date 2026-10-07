export type InvestmentStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PARTIALLY_SOLD"
  | "CLOSED"
  | "ARCHIVED";

export interface InvestmentStatusTransition {
  from: InvestmentStatus;
  to: InvestmentStatus;
  action: string;
}

export class InvestmentLifecycle {
  private static VALID_TRANSITIONS: InvestmentStatusTransition[] = [
    { from: "DRAFT", to: "DRAFT", action: "edit" },
    { from: "DRAFT", to: "ACTIVE", action: "buy" },
    { from: "ACTIVE", to: "ACTIVE", action: "buy" },
    { from: "ACTIVE", to: "ACTIVE", action: "edit" },
    { from: "ACTIVE", to: "ACTIVE", action: "revalue" },
    { from: "ACTIVE", to: "ACTIVE", action: "income" },
    { from: "ACTIVE", to: "ACTIVE", action: "fee" },
    { from: "ACTIVE", to: "PARTIALLY_SOLD", action: "sell" },
    { from: "ACTIVE", to: "CLOSED", action: "sell" },
    { from: "PARTIALLY_SOLD", to: "PARTIALLY_SOLD", action: "buy" },
    { from: "PARTIALLY_SOLD", to: "PARTIALLY_SOLD", action: "edit" },
    { from: "PARTIALLY_SOLD", to: "PARTIALLY_SOLD", action: "revalue" },
    { from: "PARTIALLY_SOLD", to: "PARTIALLY_SOLD", action: "income" },
    { from: "PARTIALLY_SOLD", to: "PARTIALLY_SOLD", action: "fee" },
    { from: "PARTIALLY_SOLD", to: "PARTIALLY_SOLD", action: "sell" },
    { from: "PARTIALLY_SOLD", to: "CLOSED", action: "sell" },
    { from: "ACTIVE", to: "ARCHIVED", action: "archive" },
    { from: "PARTIALLY_SOLD", to: "ARCHIVED", action: "archive" },
    { from: "CLOSED", to: "ARCHIVED", action: "archive" },
    { from: "ARCHIVED", to: "ACTIVE", action: "restore" },
    { from: "ARCHIVED", to: "PARTIALLY_SOLD", action: "restore" },
    { from: "ARCHIVED", to: "CLOSED", action: "restore" },
    { from: "ARCHIVED", to: "DRAFT", action: "restore" },
    // Reversal Transitions
    { from: "ACTIVE", to: "DRAFT", action: "reverse_buy" },
    { from: "ACTIVE", to: "ACTIVE", action: "reverse_buy" },
    { from: "PARTIALLY_SOLD", to: "PARTIALLY_SOLD", action: "reverse_buy" },
    { from: "CLOSED", to: "PARTIALLY_SOLD", action: "reverse_sell" },
    { from: "CLOSED", to: "ACTIVE", action: "reverse_sell" },
    { from: "PARTIALLY_SOLD", to: "PARTIALLY_SOLD", action: "reverse_sell" },
    { from: "PARTIALLY_SOLD", to: "ACTIVE", action: "reverse_sell" },
    { from: "ACTIVE", to: "ACTIVE", action: "reverse_event" },
    { from: "PARTIALLY_SOLD", to: "PARTIALLY_SOLD", action: "reverse_event" },
    { from: "CLOSED", to: "CLOSED", action: "reverse_event" },
  ];

  static canTransition(from: InvestmentStatus, to: InvestmentStatus, action: string): boolean {
    return this.VALID_TRANSITIONS.some(
      (t) => t.from === from && t.to === to && t.action === action
    );
  }

  static assertCanTransition(from: InvestmentStatus, to: InvestmentStatus, action: string): void {
    if (!this.canTransition(from, to, action)) {
      throw new Error(
        `INVALID_INVESTMENT_LIFECYCLE_TRANSITION: Cannot perform '${action}' from '${from}' to '${to}'.`
      );
    }
  }

  static canEdit(status: InvestmentStatus): boolean {
    return status === "DRAFT" || status === "ACTIVE" || status === "PARTIALLY_SOLD";
  }

  static canBuy(status: InvestmentStatus): boolean {
    return status === "DRAFT" || status === "ACTIVE" || status === "PARTIALLY_SOLD";
  }

  static canSell(status: InvestmentStatus): boolean {
    return status === "ACTIVE" || status === "PARTIALLY_SOLD";
  }

  static canRecordIncome(status: InvestmentStatus): boolean {
    return status === "ACTIVE" || status === "PARTIALLY_SOLD";
  }

  static canRecordFee(status: InvestmentStatus): boolean {
    return status === "ACTIVE" || status === "PARTIALLY_SOLD";
  }

  static canRevalue(status: InvestmentStatus): boolean {
    return status === "ACTIVE" || status === "PARTIALLY_SOLD";
  }

  static canArchive(status: InvestmentStatus): boolean {
    return status === "ACTIVE" || status === "PARTIALLY_SOLD" || status === "CLOSED";
  }

  static canRestore(status: InvestmentStatus): boolean {
    return status === "ARCHIVED";
  }
}
