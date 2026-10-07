import { Prisma, PrismaClient } from "@prisma/client";
import { AuditService } from "@/finance/audit/audit.service";
import {
  CreatePaymentRequirementInput,
  AllocatePaymentInput,
  PaymentRequirementStatus,
} from "./types";

export class ProjectPaymentService {
  /**
   * Add a Payment Requirement commitment schedule to the project.
   * e.g. Year 1 Installment ₹4L due on 2027-06-01.
   */
  static async addPaymentRequirement(
    tx: Prisma.TransactionClient,
    input: CreatePaymentRequirementInput
  ) {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Payment requirement name is required");
    }
    if (input.plannedAmount < 0) {
      throw new Error("Planned amount must be non-negative");
    }

    const project = await tx.project.findFirst({
      where: { id: input.projectId, householdId: input.householdId },
    });
    if (!project) {
      throw new Error("Project not found in this household");
    }

    if (input.costItemId) {
      const costItem = await tx.projectCostItem.findFirst({
        where: { id: input.costItemId, projectId: input.projectId },
      });
      if (!costItem) {
        throw new Error("Linked cost item not found in this project");
      }
    }

    const initialStatus: PaymentRequirementStatus = input.committedAmount && input.committedAmount > 0 ? "COMMITTED" : "PLANNED";

    const payment = await tx.projectPaymentRequirement.create({
      data: {
        projectId: input.projectId,
        householdId: input.householdId,
        costItemId: input.costItemId || null,
        name: input.name.trim(),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        plannedAmount: new Prisma.Decimal(input.plannedAmount),
        committedAmount: new Prisma.Decimal(input.committedAmount || 0),
        paidAmount: new Prisma.Decimal(0),
        status: initialStatus,
      },
    });

    await AuditService.record(tx, {
      householdId: input.householdId,
      entityType: "PROJECT_PAYMENT",
      entityId: payment.id,
      action: "CREATE",
      actorUserId: input.userId || null,
      metadata: {
        projectId: input.projectId,
        name: payment.name,
        plannedAmount: input.plannedAmount,
        committedAmount: input.committedAmount || 0,
      },
    });

    return payment;
  }

  /**
   * Allocate an authoritative posted financial transaction (e.g. an Expense payment)
   * to a Project Payment Requirement without duplicating financial truth.
   */
  static async allocateTransactionToPayment(
    tx: Prisma.TransactionClient,
    input: AllocatePaymentInput
  ) {
    const payment = await tx.projectPaymentRequirement.findFirst({
      where: { id: input.paymentRequirementId, projectId: input.projectId, householdId: input.householdId },
      include: { allocations: true },
    });
    if (!payment) {
      throw new Error("Payment requirement not found in this project");
    }

    // Verify transaction exists in same household and is posted/reconciled
    const txn = await tx.transaction.findFirst({
      where: { id: input.transactionId, householdId: input.householdId },
    });
    if (!txn) {
      throw new Error("Transaction not found in this household");
    }
    if (txn.isVoided || txn.status === "REVERSED") {
      throw new Error("Cannot allocate a voided or reversed transaction");
    }

    const txnAmount = Number(txn.amount);
    const allocationAmount = input.allocatedAmount ? Math.min(input.allocatedAmount, txnAmount) : txnAmount;
    if (allocationAmount <= 0) {
      throw new Error("Allocated amount must be positive");
    }

    const allocation = await tx.projectPaymentAllocation.create({
      data: {
        paymentRequirementId: payment.id,
        transactionId: txn.id,
        householdId: input.householdId,
        allocatedAmount: new Prisma.Decimal(allocationAmount),
        notes: input.notes || null,
      },
    });

    // Re-sum all allocations for this payment requirement
    const allAllocations = await tx.projectPaymentAllocation.findMany({
      where: { paymentRequirementId: payment.id },
    });
    const totalPaid = allAllocations.reduce((sum: number, a: { allocatedAmount: Prisma.Decimal }) => sum + Number(a.allocatedAmount), 0);
    const planned = Number(payment.plannedAmount);
    const committed = Number(payment.committedAmount);
    const targetThreshold = committed > 0 ? committed : planned;

    let newStatus: PaymentRequirementStatus = "PARTIALLY_PAID";
    if (totalPaid >= targetThreshold && targetThreshold > 0) {
      newStatus = "PAID";
    } else if (totalPaid === 0) {
      newStatus = payment.status as PaymentRequirementStatus;
    }

    await tx.projectPaymentRequirement.update({
      where: { id: payment.id },
      data: {
        paidAmount: new Prisma.Decimal(totalPaid),
        status: newStatus,
      },
    });

    await AuditService.record(tx, {
      householdId: input.householdId,
      entityType: "PROJECT_ALLOCATION",
      entityId: allocation.id,
      action: "CREATE",
      actorUserId: input.userId || null,
      metadata: {
        paymentRequirementId: payment.id,
        transactionId: txn.id,
        allocatedAmount: allocationAmount,
      },
    });

    return allocation;
  }
}
