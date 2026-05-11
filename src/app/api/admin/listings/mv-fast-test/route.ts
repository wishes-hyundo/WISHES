// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/listings/mv-fast-test
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 옵션 R Phase 4A — 진단 endpoint (사장님 명령 2026-05-11).
//
// 목적:
//   기존 mv (11.17초) 대비 병렬 fetch + in-place transform 효과 측정.
//   목표: 11초 → 3-5초.
//
// Phase 4A 최적화:
//   1. fetch: 순차 7 batches → Promise.all 병렬 7 batches
//      - 예상: 6.3s → 1.5-2s
//   2. transform: Object.entries 복사 → in-place delete
//      - 예상: 2.4s → 0.8s
//
// 응답:
//   { success, source: 'mv-fast', rows, _timing: {count_ms, fetch_ms, transform_ms, total_ms}, sample }
//
// 회귀 회피:
//   - 기존 /mv route.ts 안 건드림 → v352 (11.17s) 영향 0
//   - 새 endpoint → cache key 충돌 X
//   - 등록 안 하면 prod 영향 0
//   - PostgREST 동시 7 connection — Supabase pro tier 200 안전
//
// 보안:
//   - verifyAdminAuth 필수

import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/cors';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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

    // scope 처리 (기존 mv 와 동일)
    const scopeParam = (searchParams.get('scope') || 'all').toLowerCase();
    let scope: 'all' | 'mine' = scopeParam === 'mine' ? 'mine' : 'all';
    let scopeUid: string | null = null;
    if (scope === 'mine') {
      try {
        const authHdr = request.headers.get('authorization') || '';
        let token = authHdr.replace(/^Bearer\s+/i, '').trim();
        while (token.startsWith('admin_bridge_')) token = token.slice('admin_bridge_'.length);
        if (token.startsWith('eyJ') && token.split('.').length === 3 && token.length > 40) {
          const { data } = await Promise.race([
            supabase.auth.getUser(token),
            new Promise<{ data: { user: null } }>((_, rej) =>
              setTimeout(() => rej(new Error('uid_timeout')), 2000)
            ),
          ]) as { data: { user: { id: string } | null } };
          scopeUid = data?.user?.id ?? null;
        }
      } catch { /* degrade */ }
      if (!scopeUid) scope = 'all';
    }

    // ── 1단계: count 먼저 확인 (병렬 fetch 페이지 수 계산용) ──
    const _countStart = Date.now();
    let countQ: any = supabase
      .from('listings_minimal_mv')
      .select('*', { count: 'exact', head: true });
    if (scope === 'mine' && scopeUid) countQ = countQ.eq('created_by', scopeUid);
    const { count: totalCount, error: countErr } = await countQ;
    const _countMs = Date.now() - _countStart;

    if (countErr) {
      return NextResponse.json({
        success: false,
        source: 'mv-fast-test',
        error: 'count_failed: ' + countErr.message,
        _ms: Date.now() - _t0,
      }, { status: 200 });
    }

    const total = totalCount || 0;
    const PAGE_SIZE = 10000;
    const MAX_PAGES = 10;
    const pages = Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGES);

    // ── 2단계: 병렬 fetch (Promise.all) ──
    const _fetchStart = Date.now();
    const fetchPromises: any[] = [];
    for (let i = 0; i < pages; i++) {
      const from = i * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q: any = supabase
        .from('listings_minimal_mv')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);
      if (scope === 'mine' && scopeUid) q = q.eq('created_by', scopeUid);
      fetchPromises.push(q);
    }

    const results = await Promise.all(fetchPromises);
    const _fetchMs = Date.now() - _fetchStart;

    // 에러 체크
    let allData: any[] = [];
    let pageErrors: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const { data, error } = results[i];
      if (error) {
        pageErrors.push('page_' + i + ': ' + error.message);
      } else if (data) {
        allData = allData.concat(data);
      }
    }

    if (pageErrors.length > 0) {
      return NextResponse.json({
        success: false,
        source: 'mv-fast-test',
        page_errors: pageErrors,
        partial_rows: allData.length,
        _timing: { count_ms: _countMs, fetch_ms: _fetchMs },
      }, { status: 200 });
    }

    // ── 3단계: in-place transform (객체 복사 회피) ──
    const _transformStart = Date.now();
    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];

      // thumb_url → listing_images (in-place)
      const thumbUrl = row.thumb_url;
      if (thumbUrl) {
        row.listing_images = [{ url: thumbUrl }];
      }
      delete row.thumb_url;

      // building_info 슬림 (in-place)
      if (row.building_info && typeof row.building_info === 'object') {
        const bi = row.building_info;
        const newBi: any = {};
        if (bi['도로명주소']) newBi['도로명주소'] = bi['도로명주소'];
        if (bi['지번주소']) newBi['지번주소'] = bi['지번주소'];
        row.building_info = newBi;
      }

      // in-place null/empty delete (Object.entries 회피)
      for (const k in row) {
        const v = row[k];
        if (v === null || v === undefined || v === '' || v === false) {
          delete row[k];
        } else if (Array.isArray(v) && v.length === 0) {
          delete row[k];
        } else if (typeof v === 'object' && !Array.isArray(v) && v !== null && Object.keys(v).length === 0) {
          delete row[k];
        }
      }
    }
    const _transformMs = Date.now() - _transformStart;

    const _totalMs = Date.now() - _t0;

    // sample (첫 2 + 마지막 1)
    const sample = allData.length > 0 ? {
      first_2: allData.slice(0, 2).map((r: any) => ({ id: r.id, title: r.title })),
      last_1: allData.slice(-1).map((r: any) => ({ id: r.id, title: r.title })),
      keys: allData[0] ? Object.keys(allData[0]) : [],
    } : null;

    console.log('[admin/listings/mv-fast-test] rows=' + allData.length +
      ' pages=' + pages + ' count=' + _countMs + 'ms fetch=' + _fetchMs +
      'ms transform=' + _transformMs + 'ms total=' + _totalMs + 'ms');

    return NextResponse.json({
      success: true,
      source: 'mv-fast-test',
      rows: allData.length,
      total,
      pages,
      _timing: {
        count_ms: _countMs,
        fetch_ms: _fetchMs,
        transform_ms: _transformMs,
        total_ms: _totalMs,
      },
      sample,
      // 실제 data 응답 X (진단 only — 응답 크기 절약)
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Vary': 'Authorization',
      },
    });
  } catch (e: any) {
    console.error('[admin/listings/mv-fast-test] unexpected error', e);
    return NextResponse.json(
      { success: false, source: 'mv-fast-test', error: e?.message || 'unknown', _ms: Date.now() - _t0 },
      { status: 200 }
    );
  }
}
