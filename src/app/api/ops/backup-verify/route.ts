import { NextRequest, NextResponse } from 'next/server';
import { BackupWorker } from '@/finance/monitoring/backup-worker';

function validateOpsAuth(req: NextRequest): boolean {
  const opsKey = req.headers.get('x-ops-api-key');
  const configuredKey = process.env.OPS_API_KEY;
  if (!configuredKey || !opsKey) return false;
  return opsKey === configuredKey;
}

/**
 * Trigger Asynchronous Backup Verification Drill
 * POST /api/ops/backup-verify
 * Requires header: x-ops-api-key
 * Returns HTTP 202 Accepted { status: "QUEUED", jobId }
 */
export async function POST(req: NextRequest) {
  if (!validateOpsAuth(req)) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED_OPERATIONS_ACCESS', message: 'Valid x-ops-api-key header is required' },
      { status: 401 }
    );
  }

  const job = BackupWorker.enqueueBackupVerification();
  return NextResponse.json(job, { status: 202 });
}

/**
 * Check Backup Verification Drill Job Status
 * GET /api/ops/backup-verify?jobId=...
 * Requires header: x-ops-api-key
 */
export async function GET(req: NextRequest) {
  if (!validateOpsAuth(req)) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED_OPERATIONS_ACCESS', message: 'Valid x-ops-api-key header is required' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ error: 'MISSING_JOB_ID', message: 'jobId parameter is required' }, { status: 400 });
  }

  const job = BackupWorker.getJobStatus(jobId);
  if (!job) {
    return NextResponse.json({ error: 'JOB_NOT_FOUND', message: `Job ${jobId} not found` }, { status: 404 });
  }

  return NextResponse.json(job, { status: 200 });
}
