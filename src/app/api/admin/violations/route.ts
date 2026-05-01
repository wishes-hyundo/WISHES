/**
 * GET /api/admin/violations — PR-R-1-Admin
 *
 * data.go.kr 자동 감지된 위반건축물 매물 조회.
 * 사장님 검토 페이지용 (자동 감지 → 사장님 한 번에 검토).
 *
 * 헌법 §"사장님 손 0번":
 *   - 자동 감지 (cron 이 처리)
 *   - 검토만 (편집 X — 매물 수정은 별도 /admin/listings 사용)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ViolationListing {
  id: number;
  address: string | null;
  building_name: string | null;
  building_purpose: string | null;
  type_normalized: string | null;
  status: string | null;
  approval_date: string | null;
  area_m2: number | null;
  violation_reason: string | null;
  building_register_fetched_at: string | null;
  building_register_source: string | null;
}

export async function GET(request: NextRequest) {
  // admin 인증
  const ok = await verifyAdminAuth(request);
  if (!ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(searchParams.get('limit') || '100', 10), 1), 500);

  // 위반건축물 매물 조회 — 최신 fetched_at 순
  const { data, error } = await supabase
    .from('listings')
    .select('id, address, building_name, building_purpose, type_normalized, status, approval_date, area_m2, violation_reason, building_register_fetched_at, building_register_source')
    .eq('is_violation_building', true)
    .order('building_register_fetched_at', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<ViolationListing[]>();

  if (error) {
    console.error('[admin/violations] query error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 통계
  const { count: totalChecked } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .not('building_register_fetched_at', 'is', null);

  const { count: totalViolations } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('is_violation_building', true);

  const { count: pendingFetch } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', '공개')
    .is('building_register_fetched_at', null);

  return NextResponse.json({
    success: true,
    listings: data || [],
    stats: {
      total_checked: totalChecked ?? 0,
      total_violations: totalViolations ?? 0,
      pending_fetch: pendingFetch ?? 0,
      violation_ratio: totalChecked && totalChecked > 0
        ? Math.round(((totalViolations ?? 0) / totalChecked) * 1000) / 10
        : 0, // %
    },
  });
}
