/**
 * POST /api/admin/dedup-migrate
 *
 * 중복정리 전용 컬럼을 라이브 Supabase 에 한 번에 추가.
 *   - dedup_requested_at TIMESTAMPTZ
 *   - dedup_reason       TEXT
 *   - dedup_group_id     TEXT
 *   - dedup_kept_id      BIGINT
 *   - 인덱스 2개
 *
 * Authorization: Bearer <WISHES_ADMIN_MASTER_PASSWORD env> (또는 Supabase JWT)
 *
 * 배포 후 한 번만 호출하면 된다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MIGRATION_SQL = `
ALTER TABLE listings ADD COLUMN IF NOT EXISTS dedup_requested_at TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS dedup_reason TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS dedup_group_id TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS dedup_kept_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_listings_dedup_requested_at ON listings(dedup_requested_at) WHERE dedup_requested_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_dedup_group ON listings(dedup_group_id) WHERE dedup_group_id IS NOT NULL;
`;

export async function POST(request: NextRequest) {
  if (!(await verifyAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'Supabase env vars missing' }, { status: 500 });
  }

  try {
    // Supabase Management API 로 raw SQL 실행 (가장 안정)
    const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
    const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

    const resp = await fetch(mgmtUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    });

    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      return NextResponse.json({
        success: true,
        method: 'management_api',
        applied: [
          'dedup_requested_at',
          'dedup_reason',
          'dedup_group_id',
          'dedup_kept_id',
          'idx_listings_dedup_requested_at',
          'idx_listings_dedup_group',
        ],
        result: data,
      });
    }

    const bodyTxt = await resp.text().catch(() => '');
    return NextResponse.json(
      {
        success: false,
        method: 'management_api',
        status: resp.status,
        body: bodyTxt.slice(0, 1000),
        hint: '콘솔에서 직접 SQL 실행 필요: supabase/migrations/20260420_add_dedup_columns.sql',
      },
      { status: 500 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!(await verifyAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    message: 'POST here to apply dedup columns migration (idempotent, IF NOT EXISTS).',
    sql: MIGRATION_SQL.trim(),
  });
}

export const dynamic = 'force-dynamic';
