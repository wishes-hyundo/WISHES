// src/app/api/admin/crawl-completed/route.ts
// POST /api/admin/crawl-completed
// 크롤러가 구별 100% 완료 시 호출하는 endpoint
// 생성일: 2026-05-14

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { adminCorsHeaders } from '@/lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED_SOURCES = ['공실클럽', '온하우스'];

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: adminCorsHeaders(req, 'POST, OPTIONS') });
}

export async function POST(request: NextRequest) {
  const cors = adminCorsHeaders(request, 'POST, OPTIONS');
  const _t0 = Date.now();
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401, headers: cors });
    }

    const body = await request.json().catch(() => ({}));
    const district = String(body.district || '').trim();
    const source_site = String(body.source_site || '').trim();
    const found_ids_raw = Array.isArray(body.found_ids) ? body.found_ids : [];
    const force_zero = body.force_zero === true;
    const notes = body.notes ? String(body.notes).substring(0, 500) : null;

    // ─── validation ───
    if (!district || !/^[가-힣]+\s[가-힣]+(?:구|군|시)/.test(district)) {
      return NextResponse.json(
        { success: false, error: 'district must be "시/도 + 구" format (e.g. "서울 강남구")' },
        { status: 400, headers: cors }
      );
    }
    if (!ALLOWED_SOURCES.includes(source_site)) {
      return NextResponse.json(
        { success: false, error: `source_site must be one of ${ALLOWED_SOURCES.join(', ')}` },
        { status: 400, headers: cors }
      );
    }
    if (found_ids_raw.length > 50000) {
      return NextResponse.json({ success: false, error: 'too many ids (max 50000)' }, { status: 400, headers: cors });
    }
    // dedup + parse + filter
    const validIds = [...new Set(
      found_ids_raw.map((x: any) => parseInt(x, 10)).filter((x: number) => !isNaN(x) && x > 0)
    )];

    // 0건은 명시적 force_zero 필요 (수집 실패 보호)
    if (validIds.length === 0 && !force_zero) {
      return NextResponse.json(
        { success: false, error: '0 listings found — pass force_zero=true if intentional (likely scrape failure)' },
        { status: 400, headers: cors }
      );
    }

    const supabase = createServerClient();

    // 30초 안에 동일 (district + source) 중복 호출 방어
    const { data: recent } = await supabase
      .from('district_crawl_history')
      .select('id, completed_at')
      .eq('district', district)
      .eq('source_site', source_site)
      .gte('completed_at', new Date(Date.now() - 30 * 1000).toISOString())
      .limit(1);
    if (recent && recent.length > 0) {
      return NextResponse.json(
        { success: false, error: 'duplicate completion within 30s', last_id: recent[0].id },
        { status: 409, headers: cors }
      );
    }

    // 1) history insert
    const { data: history, error: insErr } = await supabase
      .from('district_crawl_history')
      .insert({ district, source_site, total_found: validIds.length, found_ids: validIds, notes })
      .select('id, completed_at')
      .single();

    if (insErr) {
      return NextResponse.json(
        { success: false, error: 'insert failed: ' + insErr.message, _ms: Date.now() - _t0 },
        { status: 500, headers: cors }
      );
    }

    // 2) last_verified_at 갱신 (발견된 매물)
    let verifiedCount = 0;
    if (validIds.length > 0) {
      const { count } = await supabase
        .from('listings')
        .update({ last_verified_at: new Date().toISOString() }, { count: 'exact' })
        .in('id', validIds)
        .eq('source_site', source_site);
      verifiedCount = count || 0;
    }

    return NextResponse.json(
      {
        success: true,
        history_id: history?.id,
        district, source_site,
        completed_at: history?.completed_at,
        found_count: validIds.length,
        verified_listing_count: verifiedCount,
        _ms: Date.now() - _t0,
      },
      { headers: { ...cors, 'Cache-Control': 'private, no-store' } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'unknown', _ms: Date.now() - _t0 },
      { status: 500, headers: cors }
    );
  }
}
