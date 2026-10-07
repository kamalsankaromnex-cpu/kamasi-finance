import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Internal Readiness Endpoint
 * GET /api/health/ready
 * Verifies application and database connectivity safely.
 */
export async function GET() {
  try {
    // Perform simple ping to check DB connectivity
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: 'ready',
        service: 'kamasi-finance',
        database: 'connected',
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unready',
        service: 'kamasi-finance',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
