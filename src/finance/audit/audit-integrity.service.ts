import { Prisma, PrismaClient } from "@prisma/client";
import { AuditService } from "./audit.service";

export interface VerificationDetail {
  eventId: string;
  expectedHash: string;
  actualHash: string;
  reason: string;
}

export interface VerificationResult {
  status: "PASS" | "FAIL";
  totalEventsVerified: number;
  tamperedEvents: VerificationDetail[];
}

export interface AuditVerificationResult {
  valid: boolean;
  householdId: string;
  eventsChecked: number;
  firstInvalidEventId?: string;
  failureType?: 'PAYLOAD_TAMPERED' | 'PREVIOUS_HASH_MISMATCH' | 'ACTOR_TAMPERED' | 'ENTITY_TAMPERED' | 'SEQUENCE_GAP';
  verifiedAt: Date;
}

export class AuditIntegrityService {
  /**
   * Verify tamper-evident hash chain integrity returning AuditVerificationResult envelope.
   */
  static async verifyAuditChain(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string
  ): Promise<AuditVerificationResult> {
    const events = await db.auditEvent.findMany({
      where: { householdId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    let expectedPrevHash = "GENESIS";
    const verifiedAt = new Date();

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // 1. Verify previous hash pointer
      if (event.previousHash !== expectedPrevHash) {
        return {
          valid: false,
          householdId,
          eventsChecked: i,
          firstInvalidEventId: event.id,
          failureType: "PREVIOUS_HASH_MISMATCH",
          verifiedAt,
        };
      }

      // 2. Recompute node hash
      const computedHash = AuditService.computeEventHash({
        previousHash: event.previousHash,
        id: event.id,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        actorUserId: event.actorUserId,
        createdAtIso: event.createdAt.toISOString(),
        metadataJson: event.metadataJson,
      });

      if (computedHash !== event.eventHash) {
        return {
          valid: false,
          householdId,
          eventsChecked: i,
          firstInvalidEventId: event.id,
          failureType: "PAYLOAD_TAMPERED",
          verifiedAt,
        };
      }

      expectedPrevHash = event.eventHash;
    }

    return {
      valid: true,
      householdId,
      eventsChecked: events.length,
      verifiedAt,
    };
  }

  /**
   * Legacy verifyChain method returning detailed tamper array.
   */
  static async verifyChain(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string
  ): Promise<VerificationResult> {
    const events = await db.auditEvent.findMany({
      where: { householdId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const tamperedEvents: VerificationDetail[] = [];
    let expectedPrevHash = "GENESIS";

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      if (event.previousHash !== expectedPrevHash) {
        tamperedEvents.push({
          eventId: event.id,
          expectedHash: expectedPrevHash,
          actualHash: event.previousHash || "NULL",
          reason: `Previous hash pointer mismatch at index ${i}. Expected: ${expectedPrevHash}, Found: ${event.previousHash}`,
        });
      }

      const computedHash = AuditService.computeEventHash({
        previousHash: event.previousHash,
        id: event.id,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        actorUserId: event.actorUserId,
        createdAtIso: event.createdAt.toISOString(),
        metadataJson: event.metadataJson,
      });

      if (computedHash !== event.eventHash) {
        tamperedEvents.push({
          eventId: event.id,
          expectedHash: computedHash,
          actualHash: event.eventHash,
          reason: `Node hash tampering detected at index ${i}. Computed: ${computedHash}, Stored: ${event.eventHash}`,
        });
      }

      expectedPrevHash = event.eventHash;
    }

    return {
      status: tamperedEvents.length === 0 ? "PASS" : "FAIL",
      totalEventsVerified: events.length,
      tamperedEvents,
    };
  }

  /**
   * Verify integrity of a single audit event record against computed hash.
   */
  static verifyEvent(event: {
    previousHash: string | null;
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorUserId: string;
    createdAt: Date;
    metadataJson: string | null;
    eventHash: string;
  }): boolean {
    const computedHash = AuditService.computeEventHash({
      previousHash: event.previousHash,
      id: event.id,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      actorUserId: event.actorUserId,
      createdAtIso: event.createdAt.toISOString(),
      metadataJson: event.metadataJson,
    });

    return computedHash === event.eventHash;
  }
}
