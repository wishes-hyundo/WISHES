// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/listings/stats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 옵션 Z Step 3A — Instant stats endpoint (사장님 명령 2026-05-11).
//
// 목적:
//   페이지 진입 즉시 사장님 시야에 정확한 카운트 표시 (점진 점프 제거).
//   - 전체 매물 수
//   - status 별 (공개/비공개/계약중/완료)
//   - type 별 (원룸/오피스텔/아파트/사무실/상가/빌라/토지)
//
// 응답 형식:
//   { total: 62418, by_status: {...}, by_type: {...}, ts, _ms }
//
// 성능:
//   - Postgres COUNT(*) FILTER (WHERE ...) — single seq/index scan
//   - PostgREST head=true count='exact' 활용
//   - 예상 응답: 0.1-0.5초
//   - Vercel CDN cache 60초 (s-maxage)
//
// 회귀 회피:
//   - 새 endpoint → 기존 안 건드림
//   - 등록 안 하면 prod 영향 0
//   - verifyAdminAuth 필수

import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/cors';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

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

    // scope 처리 (간단)
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

    // ── Total count (head=true → COUNT only, no rows) ──
    let totalQ: any = supabase.from('listings').select('id', { count: 'exact', head: true });
    if (scope === 'mine' && scopeUid) totalQ = totalQ.eq('created_by', scopeUid);
    const { count: totalCount, error: totalErr } = await totalQ;
    if (totalErr) {
      return NextResponse.json({ success: false, error: 'total_count_failed: ' + totalErr.message }, { status: 500 });
    }

    // ── By status (PostgREST 단일 query 로 GROUP BY 어려움 → 병렬 count)
    // status: open(공개) / private(비공개) / contracted(계약중) / completed(완료)
    const statusKeys = ['open', 'private', 'contracted', 'completed'];
    const statusPromises = statusKeys.map(s => {
      let q: any = supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', s);
      if (scope === 'mine' && scopeUid) q = q.eq('created_by', scopeUid);
      return q.then((r: any) => ({ status: s, count: r.count || 0, err: r.error?.message }));
    });

    // ── By type (병렬)
    const typeKeys = ['oneroom', 'officetel', 'apt', 'office', 'store', 'villa', 'land'];
    const typePromises = typeKeys.map(t => {
      let q: any = supabase.from('listings').select('id', { count: 'exact', head: true }).eq('type', t);
      if (scope === 'mine' && scopeUid) q = q.eq('created_by', scopeUid);
      return q.then((r: any) => ({ type: t, count: r.count || 0, err: r.error?.message }));
    });

    const [statusResults, typeResults] = await Promise.all([
      Promise.all(statusPromises),
      Promise.all(typePromises),
    ]);

    const by_status: Record<string, number> = {};
    statusResults.forEach(r => { by_status[r.status] = r.count; });

    const by_type: Record<string, number> = {};
    typeResults.forEach(r => { by_type[r.type] = r.count; });

    const _totalMs = Date.now() - _t0;
    console.log('[admin/listings/stats] total=' + totalCount + ' scope=' + scope + ' ms=' + _totalMs);

    return NextResponse.json({
      success: true,
      total: totalCount || 0,
      by_status,
      by_type,
      scope,
      ts: Date.now(),
      _ms: _totalMs,
    }, {
      headers: {
        'Cache-Control': scope === 'mine'
          ? 'private, max-age=30, stale-while-revalidate=60'
          : 'public, s-maxage=60, stale-while-revalidate=300',
        'Vary': 'Authorization',
      },
    });
  } catch (e: any) {
    console.error('[admin/listings/stats] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'unknown', _ms: Date.now() - _t0 }, { status: 500 });
  }
}
