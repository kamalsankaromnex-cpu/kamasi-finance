import { NextRequest, NextResponse } from 'next/server';
import { FinancialIntegrityMonitor } from '@/finance/monitoring/financial-integrity-monitor';

function validateOpsAuth(req: NextRequest): boolean {
  const opsKey = req.headers.get('x-ops-api-key');
  const configuredKey = process.env.OPS_API_KEY;
  if (!configuredKey || !opsKey) return false;
  return opsKey === configuredKey;
}

/**
 * Protected Operations Integrity Probe
 * GET /api/ops/integrity-check
 * Requires header: x-ops-api-key
 */
export async function GET(req: NextRequest) {
  if (!validateOpsAuth(req)) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED_OPERATIONS_ACCESS', message: 'Valid x-ops-api-key header is required' },
      { status: 401 }
    );
  }

  try {
    const scanResult = await FinancialIntegrityMonitor.runFullIntegrityScan();

    const statusCode = scanResult.status === 'HEALTHY' ? 200 : 500;
    return NextResponse.json(scanResult, { status: statusCode });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'ERROR', message: error.message || 'Integrity scan error' },
      { status: 500 }
    );
  }
}
