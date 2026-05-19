import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * R61 (2026-05-19) — admin: checklist 제출 raw payload 조회
 * 사장님이 모든 제출의 원본 데이터를 확인 (silent fail 시 복구 용도).
 *
 * GET /api/admin/checklist-submissions?phone=010-1234-5678&limit=20
 *
 * 인증: Authorization Bearer + ws_session 쿠키 (adminAuth 통과 필수)
 */

import { verifyAdminAuthWithContext } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    const _auth = await verifyAdminAuthWithContext(request);
    if (!_auth.ok) {
      return NextResponse.json({ success: false, message: 'Unauthorized — 사장님 로그인 후 다시 시도하세요' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);

    const sb = createServerClient();
    let query = sb.from('checklist_submissions')
      .select('id, created_at, c_name, c_phone, deal, prop, sections_count, forwarded_status, forwarded_at, forwarded_http_code, post_id, raw_payload')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (phone) {
      // 부분 매칭 (010-1234 / 1234-5678 / 끝 4자리 등 모두 잡힘)
      query = query.ilike('c_phone', `%${phone}%`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [], count: (data || []).length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
