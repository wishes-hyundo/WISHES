// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/listings/latest-count
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 사장님 명령 2026-05-12. v361-auto-refresh 의 polling endpoint.
//
// v2 (504 fix): COUNT(exact) 가 60K+ row 에서 10초+ timeout. 
//   → MAX(created_at) + 가장 최근 매물 id 만 받기 (인덱스 hit, 50-100ms).
//   client 는 latest_id 를 메모리와 비교해 새 매물 감지.
//
// 응답:
//   { success: true, latest_id: 'xxx', latest_at: '2026-05-12T...', scope: 'all', ts: 123, _ms: 80 }
//
// 회귀 회피:
//   - 새 endpoint → 기존 stats / mv / stream 안 건드림
//   - cache 없음 (no-store) — fresh
//   - COUNT 안 함 → fast
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
      .select('id, created_at')
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1);
    if (scope === 'mine' && scopeUid) q = q.eq('created_by', scopeUid);

    const { data, error } = await q;
    const _ms = Date.now() - _t0;

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
        _ms,
      }, { status: 200 });
    }

    const latest = (data && data[0]) ? data[0] : null;

    return NextResponse.json({
      success: true,
      latest_id: latest ? String(latest.id) : null,
      latest_at: latest ? latest.created_at : null,
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
