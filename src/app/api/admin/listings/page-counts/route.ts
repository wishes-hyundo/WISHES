// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/listings/page-counts
// 탭 배지용 count 응답 — total, by_status, by_type, by_deal
//
// Phase B - 사장님 명령 2026-05-15: 서버 페이지네이션 도입 시 탭 카운트
//
// 응답:
//   {
//     success: true,
//     total: 64859,
//     by_status: { '공개': N, '비공개': N, '계약중': N, '거래완료': N },
//     by_type: { '원룸': N, '오피스텔': N, '아파트': N, ... },
//     by_deal: { '월세': N, '전세': N, '매매': N, '전월세': N },
//     scope: 'all' | 'mine',
//     ts, _ms
//   }
//
// Cache: s-maxage=30 (탭 카운트는 자주 안 변함, 빠른 응답)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/cors';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// 한국어 status (DB 실제 값 기준)
const STATUS_KEYS = ['공개', '비공개', '계약중', '거래완료'];
const TYPE_KEYS = [
  '원룸', '오피스텔', '아파트', '사무실', '상가', '빌라', '토지',
  '투룸', '쓰리룸', '주택',
];
const DEAL_KEYS = ['월세', '전세', '매매', '전월세'];

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: adminCorsHeaders(req, 'GET, OPTIONS') });
}

export async function GET(request: NextRequest) {
  const _t0 = Date.now();
  const cors = adminCorsHeaders(request, 'GET, OPTIONS');
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401, headers: cors }
      );
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    // scope 처리 (mine vs all)
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

    // ── Total (head=true)
    //   [Critical fix 2026-05-15] default 공개+비공개만 (거래완료 제외)
    let totalQ: any = supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .in('status', ['공개', '비공개']);
    if (scope === 'mine' && scopeUid) totalQ = totalQ.eq('created_by', scopeUid);
    const totalP = totalQ.then((r: any) => r.count || 0);

    // ── By status (병렬)
    const statusPromises = STATUS_KEYS.map(s => {
      let q: any = supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', s);
      if (scope === 'mine' && scopeUid) q = q.eq('created_by', scopeUid);
      return q.then((r: any) => ({ key: s, count: r.count || 0 }));
    });

    // ── By type (병렬)
    const typePromises = TYPE_KEYS.map(t => {
      let q: any = supabase.from('listings').select('id', { count: 'exact', head: true }).eq('type', t);
      if (scope === 'mine' && scopeUid) q = q.eq('created_by', scopeUid);
      return q.then((r: any) => ({ key: t, count: r.count || 0 }));
    });

    // ── By deal (병렬)
    const dealPromises = DEAL_KEYS.map(d => {
      let q: any = supabase.from('listings').select('id', { count: 'exact', head: true }).eq('deal', d);
      if (scope === 'mine' && scopeUid) q = q.eq('created_by', scopeUid);
      return q.then((r: any) => ({ key: d, count: r.count || 0 }));
    });

    const [totalCount, statusResults, typeResults, dealResults] = await Promise.all([
      totalP,
      Promise.all(statusPromises),
      Promise.all(typePromises),
      Promise.all(dealPromises),
    ]);

    const by_status: Record<string, number> = {};
    statusResults.forEach(r => { by_status[r.key] = r.count; });

    const by_type: Record<string, number> = {};
    typeResults.forEach(r => { by_type[r.key] = r.count; });

    const by_deal: Record<string, number> = {};
    dealResults.forEach(r => { by_deal[r.key] = r.count; });

    return NextResponse.json(
      {
        success: true,
        total: totalCount,
        by_status,
        by_type,
        by_deal,
        scope,
        ts: Date.now(),
        _ms: Date.now() - _t0,
      },
      {
        headers: {
          ...cors,
          'Cache-Control': scope === 'mine'
            ? 'private, max-age=30, stale-while-revalidate=60'
            : 'public, s-maxage=30, stale-while-revalidate=60',
          'Vary': 'Authorization',
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'unknown', _ms: Date.now() - _t0 },
      { status: 500, headers: cors }
    );
  }
}
