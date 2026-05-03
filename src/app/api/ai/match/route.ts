// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/ai/match
//   자연어 질의 → 파싱된 필터 + 매칭 매물 (최대 12건)
//   - 결정적 파서 기반, 외부 API 호출 0
//   - 크롤링 매물은 사진만 차단, 정보는 포함 (기존 정책 고수)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { parseMatchQuery } from '@/lib/ai-match-parser';
import { applyImagePolicy } from '@/lib/image-policy';
import { stripInternalFieldsArray, sanitizePublicListing } from '@/lib/listing-public';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMIT = 12;

// L-sec126 (2026-04-22): PostgREST .ilike() 와일드카드 escape.
//   %, _, \ 는 SQL LIKE 메타문자이므로 사용자/AI 파서 값에 섞이면 predicate
//   의미가 바뀐다. filters.dong / businessType 은 parseMatchQuery 가 자연어에서
//   뽑은 문자열이라 간접 injection 가능 (프롬프트 주입 등). 전부 escape.
//   cf. L-sec106 에서 .or() 쪽은 방어했으나 .ilike() 경로는 누락됐던 것 재적용.
function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

export async function POST(request: NextRequest) {
  try {
    // L-sec67 (2026-04-22): 공개 AI 검색 스팸 방지
    //   15분 60회/IP cap. ilike 다중 필터 쿼리 비용 보호.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `ai:match:ip:${_ip}`, limit: 60, windowMs: 15 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: '검색이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const query: string = (body?.query || '').toString().trim();

    if (!query) {
      return NextResponse.json(
        { success: false, error: '검색어가 필요합니다' },
        { status: 400 }
      );
    }

    // L-sec22 (2026-04-22): 공개 POST. query 가 parseMatchQuery + ilike('dong', %..%)
    //   로 흘러들어가므로 장문 페이로드로 DB 할당량을 고갈시키는 것을 막기 위해
    //   500자 cap. 실사용 자연어 질의는 100자 이내.
    if (query.length > 500) {
      return NextResponse.json(
        { success: false, error: '검색어가 너무 깁니다 (500자 이내)' },
        { status: 400 }
      );
    }

    const filters = parseMatchQuery(query);
    const supabase = createServerClient();

    // Supabase 쿼리 구성
    let q = supabase
      .from('listings')
      .select('*, listing_images(url, sort_order)')
      .eq('status', '공개')
      .limit(LIMIT);

    if (filters.deal) q = q.eq('deal', filters.deal);
    if (filters.type) q = q.eq('type_normalized', filters.type);
    // G-68 (2026-05-03): 구는 gu 컬럼, 동은 dong 컬럼에 분리 매칭.
    if (filters.gu) q = q.ilike('gu', `%${escapeIlike(filters.gu)}%`);
    if (filters.dong) q = q.ilike('dong', `%${escapeIlike(filters.dong)}%`);
    if (filters.maxDeposit) q = q.lte('deposit', filters.maxDeposit);
    if (filters.minDeposit) q = q.gte('deposit', filters.minDeposit);
    if (filters.maxMonthly) q = q.lte('monthly', filters.maxMonthly);
    if (filters.minArea) q = q.gte('area_m2', filters.minArea);
    if (filters.maxArea) q = q.lte('area_m2', filters.maxArea);
    if (filters.rooms) q = q.gte('rooms', filters.rooms);
    if (filters.parking) q = q.eq('parking', true);
    if (filters.elevator) q = q.eq('elevator', true);
    if (filters.pet) q = q.eq('pet', true);
    if (filters.businessType) q = q.ilike('business_type', `%${escapeIlike(filters.businessType)}%`);

    // 최신순 정렬
    q = q.order('created_at', { ascending: false });

    const { data, error } = await q;

    if (error) {
      console.error('AI 매칭 쿼리 오류:', error);
      // L-sec70 (2026-04-22): Supabase error 의 column/constraint 메시지 prod 노출 차단
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        { success: false, error: '매물 조회 실패', ...(isDev && { detail: error.message }) },
        { status: 500 }
      );
    }

    // ※ 저작권 보호 + 자체 업로드 통과
    //   - 크롤링 매물의 외부 원본 이미지는 차단
    //   - 중개사가 직접 올린 자체 업로드 이미지는 통과
    // L-sec67 (2026-04-22): embedding + dedup_* 등 내부 필드 strip
    // G-84 (2026-05-04): sanitizePublicListing 추가 — FORBIDDEN_PUBLIC_KEYS 제거.
    const sanitized = stripInternalFieldsArray(
      (data || []).map((r: any) => sanitizePublicListing(applyImagePolicy(r))),
    );

    // 인식된 필터를 URL 쿼리스트링으로도 제공 (사용자가 /listings 로 이동할 때 재사용)
    const urlParams = new URLSearchParams();
    if (filters.deal) urlParams.set('deal', filters.deal);
    if (filters.type) urlParams.set('type', filters.type);
    if (filters.gu) urlParams.set('gu', filters.gu);
    if (filters.dong) urlParams.set('dong', filters.dong);
    if (filters.maxDeposit) urlParams.set('maxDeposit', String(filters.maxDeposit));
    if (filters.minArea) urlParams.set('minArea', String(filters.minArea));

    return NextResponse.json({
      success: true,
      query,
      filters,
      listings: sanitized,
      count: sanitized.length,
      goToListings: `/listings?${urlParams.toString()}`,
    });
  } catch (error: any) {
    console.error('AI 매칭 오류:', error);
    // L-sec111 (2026-04-22): catch-all 에서도 L-sec70/L-sec104 정책 일치.
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { success: false, error: '서버 오류', ...(isDev && { detail: error?.message || String(error) }) },
      { status: 500 }
    );
  }
}
