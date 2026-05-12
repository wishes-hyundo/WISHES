// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/listings/latest-count
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 사장님 명령 2026-05-12. v361-auto-refresh 의 polling endpoint.
//
// 목적:
//   매 30초마다 client 가 호출 → DB 의 listings count 만 빠르게 받기.
//   응답 size ~50 bytes, 시간 100-300ms.
//   /stats 는 by_type / by_status 까지 GROUP BY 라 4-5초 → polling 부적합.
//
// 응답:
//   { success: true, total: 67007, scope: 'all', ts: 1234567890, _ms: 120 }
//
// 회귀 회피:
//   - 새 endpoint → 기존 stats / mv / stream 안 건드림
//   - cache 없음 (no-store) — count 매번 fresh
//   - PostgREST count: 'exact' + head: true → COUNT(*) only
//
// 보안:
//   - verifyAdminAuth 필수
//   - scope=mine 시 created_by 필터

import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/cors';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

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

    let q: any = supabase
      .from('listings')
      .select('*', { count: 'exact', head: true });
    if (scope === 'mine' && scopeUid) q = q.eq('created_by', scopeUid);

    const { count, error } = await q;
    const _ms = Date.now() - _t0;

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
        _ms,
      }, { status: 200 });
    }

    return NextResponse.json({
      success: true,
      total: count || 0,
      scope,
      ts: Date.now(),
      _ms,
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Vary': 'Authorization',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'unknown', _ms: Date.now() - _t0 },
      { status: 200 }
    );
  }
}
