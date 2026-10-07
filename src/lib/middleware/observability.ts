import crypto from 'crypto';

export interface CorrelationContext {
  requestId: string;
  correlationId: string;
  householdId?: string;
  userId?: string;
  operation: string;
  entityId?: string;
  idempotencyKey?: string;
  durationMs?: number;
  result: 'SUCCESS' | 'FAILURE' | 'PENDING';
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'authorization',
  'cookie',
  'creditcard',
  'cvv',
  'ssn',
]);

/**
 * Recursively redacts sensitive payload fields.
 */
export function redactSensitiveData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  const redacted: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

export function createCorrelationContext(
  operation: string,
  overrides?: Partial<CorrelationContext>
): CorrelationContext {
  return {
    requestId: overrides?.requestId || crypto.randomUUID(),
    correlationId: overrides?.correlationId || crypto.randomUUID(),
    householdId: overrides?.householdId,
    userId: overrides?.userId,
    operation,
    entityId: overrides?.entityId,
    idempotencyKey: overrides?.idempotencyKey,
    result: overrides?.result || 'PENDING',
  };
}

export function logFinancialOperation(
  context: CorrelationContext,
  extraDetails?: Record<string, any>
): void {
  const sanitizedExtra = extraDetails ? redactSensitiveData(extraDetails) : undefined;
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: context.result === 'FAILURE' ? 'ERROR' : 'INFO',
    ...context,
    details: sanitizedExtra,
  };

  // Structured stdout output
  if (process.env.NODE_ENV !== 'test') {
    console.log(JSON.stringify(logEntry));
  }
}
