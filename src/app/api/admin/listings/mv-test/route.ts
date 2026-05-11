// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/listings/mv-test
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 옵션 R Phase 1 — 안전 진단 endpoint (사장님 명령 2026-05-11).
//
// 목적:
//   listings_minimal_mv 가 PostgREST 통해 실제 expose 되는지 + timing 측정.
//   Fix 34 회귀 원인 정확히 진단. 등록 X 시 prod 영향 0.
//
// 시도:
//   1. supabase.from('listings_minimal_mv').select() 직접 (Fix 34 패턴)
//   2. range pagination 으로 60K 받기 시도
//   3. 응답 시간 + row 수 + 첫/마지막 row 검증
//
// 응답:
//   { success, source, rows, total, _timing: {fetch_ms, transform_ms, total_ms}, sample }
//   - source: 'mv-direct' or 'error'
//   - sample: 첫 3개 row 의 id/title (검증용)
//
// 회귀 회피:
//   - 기존 route.ts 안 건드림
//   - 등록 안 하면 prod 영향 0
//   - mv 직접 시도 fail 시 error 응답 (다른 endpoint 영향 X)
//
// 보안:
//   - verifyAdminAuth 필수

import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/cors';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: adminCorsHeaders(req, 'GET, OPTIONS') });
}

export async function GET(request: NextRequest) {
  const _t0 = Date.now();
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam && /^\d+$/.test(limitParam)
      ? Math.min(parseInt(limitParam, 10), 100000)
      : 100000;

    // ── mv 직접 SELECT 시도 (Fix 34 패턴 재현 + chunked range) ──
    const PAGE_SIZE = 10000;  // 10K 씩 받기 (PostgREST default 1000 우회 위해)
    const _fetchStart = Date.now();

    let allData: any[] = [];
    let from = 0;
    let stopReason = '';
    let pageCount = 0;

    while (from < limit) {
      const pageEnd = Math.min(from + PAGE_SIZE - 1, limit - 1);
      const { data, error, count, status } = await supabase
        .from('listings_minimal_mv')
        .select('*', { count: pageCount === 0 ? 'exact' : undefined })
        .order('created_at', { ascending: false })
        .range(from, pageEnd);

      pageCount++;

      if (error) {
        return NextResponse.json({
          success: false,
          source: 'mv-direct',
          error: error.message,
          error_details: error,
          fix34_reproduction: 'mv expose 안 됨 — Fix 34 회귀 패턴',
          page: pageCount,
          from,
          _ms: Date.now() - _t0,
        }, { status: 200 });  // 200 으로 응답 (진단 결과)
      }

      if (!data || data.length === 0) {
        stopReason = pageCount === 1 ? 'empty_first_page_fix34_reproduced' : 'no_more_data';
        break;
      }

      allData = allData.concat(data);

      if (data.length < PAGE_SIZE) {
        stopReason = 'last_page';
        break;
      }

      from += PAGE_SIZE;
    }

    const _fetchMs = Date.now() - _fetchStart;

    // 응답 sample (첫 3개 + 마지막 1개)
    const sample = allData.length > 0 ? {
      first_3: allData.slice(0, 3).map((r: any) => ({ id: r.id, title: r.title, has_thumb: !!r.thumb_url })),
      last_1: allData.slice(-1).map((r: any) => ({ id: r.id, title: r.title })),
      sample_keys: allData[0] ? Object.keys(allData[0]) : [],
    } : null;

    const _totalMs = Date.now() - _t0;

    console.log('[admin/listings/mv-test] rows=' + allData.length +
      ' fetch=' + _fetchMs + 'ms total=' + _totalMs + 'ms pages=' + pageCount + ' stop=' + stopReason);

    return NextResponse.json({
      success: true,
      source: 'mv-direct',
      rows: allData.length,
      total: allData.length,
      pages: pageCount,
      stop_reason: stopReason,
      _timing: {
        fetch_ms: _fetchMs,
        total_ms: _totalMs,
      },
      sample,
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Vary': 'Authorization',
      },
    });
  } catch (e: any) {
    console.error('[admin/listings/mv-test] unexpected error', e);
    return NextResponse.json(
      { success: false, source: 'error', error: e?.message || 'unknown', _ms: Date.now() - _t0 },
      { status: 200 }
    );
  }
}
