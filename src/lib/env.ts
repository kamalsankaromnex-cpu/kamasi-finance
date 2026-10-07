/**
 * Production Environment Configuration Validator
 * Validates required environment variables at runtime with strict type & safety checks.
 */

export interface EnvConfig {
  DATABASE_URL: string;
  JWT_SECRET: string;
  NODE_ENV: 'development' | 'production' | 'test';
  APPLICATION_URL: string;
  PORT?: number;
}

export function validateEnv(): EnvConfig {
  const errors: string[] = [];

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    errors.push("DATABASE_URL environment variable is required.");
  }

  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    errors.push("JWT_SECRET environment variable is required.");
  } else if (new TextEncoder().encode(JWT_SECRET).length < 32) {
    errors.push("JWT_SECRET must be at least 32 bytes for cryptographic security.");
  }

  const nodeEnvStr = (process.env.NODE_ENV || 'development').toLowerCase();
  if (!['development', 'production', 'test'].includes(nodeEnvStr)) {
    errors.push(`Invalid NODE_ENV '${process.env.NODE_ENV}'. Expected development, production, or test.`);
  }

  const APPLICATION_URL = process.env.APPLICATION_URL || 'http://localhost:3000';

  if (nodeEnvStr === 'production') {
    if (JWT_SECRET && (JWT_SECRET.includes('dev') || JWT_SECRET.includes('secret') || JWT_SECRET.includes('change-me'))) {
      errors.push("JWT_SECRET contains insecure development placeholder in production.");
    }
  }

  if (errors.length > 0) {
    const errorMsg = `[ENV VALIDATION ERROR] Missing or invalid production environment configuration:\n  - ${errors.join('\n  - ')}`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(errorMsg);
    } else {
      console.warn(errorMsg);
    }
  }

  return {
    DATABASE_URL: DATABASE_URL || 'file:./dev.db',
    JWT_SECRET: JWT_SECRET || 'dev_secret_key_must_be_at_least_32_bytes_long_for_hs256',
    NODE_ENV: nodeEnvStr as EnvConfig['NODE_ENV'],
    APPLICATION_URL,
    PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  };
}

export const env = validateEnv();
