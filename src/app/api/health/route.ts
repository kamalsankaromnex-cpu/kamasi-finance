import { NextResponse } from 'next/server';

/**
 * Public Health Endpoint
 * GET /api/health
 * Returns application health status without revealing internal schema or migration details.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      service: 'kamasi-finance',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    { status: 200 }
  );
}
