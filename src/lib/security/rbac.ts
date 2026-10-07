import { PrismaClient } from '@prisma/client';

export type Role = 'OWNER' | 'MEMBER' | 'PARTNER' | 'VIEWER';

export type Capability =
  | 'VIEW_ACCOUNTS'
  | 'VIEW_REPORTS'
  | 'CREATE_EXPENSE'
  | 'CREATE_INCOME'
  | 'MANAGE_INVESTMENTS'
  | 'MANAGE_LIABILITIES'
  | 'ARCHIVE_RECORDS'
  | 'EXECUTE_AI_ACTION'
  | 'MANAGE_HOUSEHOLD';

const CAPABILITY_MATRIX: Record<string, Capability[]> = {
  OWNER: [
    'VIEW_ACCOUNTS',
    'VIEW_REPORTS',
    'CREATE_EXPENSE',
    'CREATE_INCOME',
    'MANAGE_INVESTMENTS',
    'MANAGE_LIABILITIES',
    'ARCHIVE_RECORDS',
    'EXECUTE_AI_ACTION',
    'MANAGE_HOUSEHOLD',
  ],
  PARTNER: [
    'VIEW_ACCOUNTS',
    'VIEW_REPORTS',
    'CREATE_EXPENSE',
    'CREATE_INCOME',
    'MANAGE_INVESTMENTS',
    'MANAGE_LIABILITIES',
    'ARCHIVE_RECORDS',
    'EXECUTE_AI_ACTION',
  ],
  MEMBER: [
    'VIEW_ACCOUNTS',
    'VIEW_REPORTS',
    'CREATE_EXPENSE',
    'CREATE_INCOME',
    'MANAGE_INVESTMENTS',
    'MANAGE_LIABILITIES',
    'ARCHIVE_RECORDS',
    'EXECUTE_AI_ACTION',
  ],
  VIEWER: ['VIEW_ACCOUNTS', 'VIEW_REPORTS'],
};

export class SecurityError extends Error {
  constructor(message: string, public statusCode: number = 403) {
    super(message);
    this.name = 'SecurityError';
  }
}

export interface HouseholdSecurityContext {
  householdId: string;
  userId: string;
  role: Role;
  memberId: string;
}

/**
 * Server-Derived Household Authorization Helper.
 * Derives user's active household membership directly from DB/session.
 * Client request parameters MUST NEVER determine access authorization without DB validation.
 */
export async function authorizeHouseholdRequest(
  prisma: PrismaClient,
  userId: string,
  requestedHouseholdId?: string | null,
  requiredCapability?: Capability
): Promise<HouseholdSecurityContext> {
  if (!userId) {
    throw new SecurityError('Authentication required', 401);
  }

  // Fetch memberships for user
  const memberships = await prisma.householdMember.findMany({
    where: { userId },
  });

  if (!memberships || memberships.length === 0) {
    throw new SecurityError('User is not associated with any active household', 403);
  }

  let selectedMembership = memberships[0];

  if (requestedHouseholdId) {
    const match = memberships.find((m) => m.householdId === requestedHouseholdId);
    if (!match) {
      throw new SecurityError(
        `Unauthorized cross-tenant access attempt to household: ${requestedHouseholdId}`,
        403
      );
    }
    selectedMembership = match;
  }

  const role = selectedMembership.role.toUpperCase() as Role;

  if (requiredCapability) {
    const allowedCaps = CAPABILITY_MATRIX[role] || CAPABILITY_MATRIX['VIEWER'];
    if (!allowedCaps.includes(requiredCapability)) {
      throw new SecurityError(
        `Role '${role}' lacks capability '${requiredCapability}' for household '${selectedMembership.householdId}'`,
        403
      );
    }
  }

  return {
    householdId: selectedMembership.householdId,
    userId,
    role,
    memberId: selectedMembership.id,
  };
}

export function hasCapability(role: string, capability: Capability): boolean {
  const allowedCaps = CAPABILITY_MATRIX[role.toUpperCase()] || CAPABILITY_MATRIX['VIEWER'];
  return allowedCaps.includes(capability);
}
