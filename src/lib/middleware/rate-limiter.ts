export type RateLimitCategory =
  | 'AUTH'
  | 'AI_QUERY'
  | 'AI_ACTION'
  | 'REPORT'
  | 'FORECAST'
  | 'FILE_UPLOAD'
  | 'GENERAL_API';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const BUCKET_CONFIGS: Record<RateLimitCategory, RateLimitConfig> = {
  AUTH: { maxRequests: 10, windowMs: 60 * 1000 },
  AI_QUERY: { maxRequests: 20, windowMs: 60 * 1000 },
  AI_ACTION: { maxRequests: 10, windowMs: 60 * 1000 },
  REPORT: { maxRequests: 30, windowMs: 60 * 1000 },
  FORECAST: { maxRequests: 15, windowMs: 60 * 1000 },
  FILE_UPLOAD: { maxRequests: 10, windowMs: 60 * 1000 },
  GENERAL_API: { maxRequests: 100, windowMs: 60 * 1000 },
};

interface WindowEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, WindowEntry>();

export class RateLimitExceededError extends Error {
  constructor(public category: RateLimitCategory, public retryAfterMs: number) {
    super(`Rate limit exceeded for category '${category}'. Retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'RateLimitExceededError';
  }
}

export function checkRateLimit(
  identifier: string,
  category: RateLimitCategory
): { allowed: boolean; remaining: number; resetMs: number } {
  const config = BUCKET_CONFIGS[category] || BUCKET_CONFIGS.GENERAL_API;
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const storeKey = `${category}:${identifier}`;

  let entry = rateLimitStore.get(storeKey);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(storeKey, entry);
  }

  // Filter timestamps within current window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= config.maxRequests) {
    const oldest = entry.timestamps[0];
    const resetMs = oldest + config.windowMs - now;
    return { allowed: false, remaining: 0, resetMs };
  }

  entry.timestamps.push(now);
  const remaining = config.maxRequests - entry.timestamps.length;
  return { allowed: true, remaining, resetMs: config.windowMs };
}

export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}
