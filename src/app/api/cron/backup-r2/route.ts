/**
 * /api/cron/backup-r2 — 매주 R2 백업 (Cloudflare R2 무료 10GB)
 * 사장님 명령 (2026-04-28): 백업 / DR. Supabase Pro 자동 7일 PITR + R2 cold safety net.
 * 
 * 백업 대상: listings, admin_users (PII 제외), admin_audit_log, contacts(익명화), legal_documents
 * 보관: 4주 자동 삭제 (R2 lifecycle 또는 cron 정리)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const R2_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
const R2_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
const R2_SECRET = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.CLOUDFLARE_R2_BACKUP_BUCKET || 'wishes-backup';

export async function GET(request: NextRequest) {
  // G-73 (2026-05-03): fail-safe — CRON_SECRET 미설정이면 500 (이전엔 무인증 통과)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = (request.headers.get('authorization') || '');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!R2_ACCOUNT_ID || !R2_KEY || !R2_SECRET) {
    return NextResponse.json({
      success: false,
      error: 'R2 환경변수 미설정',
      action: 'CLOUDFLARE_R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BACKUP_BUCKET 등록 필요 (Cloudflare R2 무료 10GB)',
    }, { status: 503 });
  }

  const supabase = createServerClient();
  const week = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD

  // 백업 대상 SELECT
  const tables = ['listings', 'admin_users', 'admin_audit_log', 'contacts', 'appointments', 'legal_documents', 'user_consents', 'sota_reports'];
  // L-fix-pii-leak (2026-04-28): admin_users 의 password_hash, mfa_secret 등 민감 PII 제외
  //   contacts/appointments 도 PIPA 익명화 후 데이터만 백업 (이미 retention_until 후 익명화됨)
  const SAFE_COLS: Record<string, string> = {
    admin_users: 'id, email, role, status, business_number, business_verified, last_login_at, created_at, updated_at',
    contacts: 'id, listing_id, name, phone, email, message, status, retention_until, created_at',
    appointments: 'id, listing_id, name, phone, email, status, scheduled_at, retention_until, created_at',
  };
  const dump: Record<string, any[]> = {};
  for (const t of tables) {
    const cols = SAFE_COLS[t] || '*';
    const { data } = await supabase.from(t).select(cols).limit(50000);
    dump[t] = data || [];
  }

  const json = JSON.stringify({
    backup_at: new Date().toISOString(),
    tables: Object.keys(dump),
    counts: Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length])),
    data: dump,
  });

  // R2 PUT (S3 호환)
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
  });

  const key = `db-snapshot/${week}/wishes-${week}.json`;
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: json,
    ContentType: 'application/json',
  }));

  // audit log
  await supabase.from('admin_audit_log').insert({
    action: 'backup_r2_run',
    target_type: 'system',
    meta: { key, sizeBytes: json.length, counts: Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length])) },
  });

  return NextResponse.json({
    success: true,
    key,
    sizeBytes: json.length,
    counts: Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length])),
  });
}
