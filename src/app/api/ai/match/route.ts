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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMIT = 12;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const query: string = (body?.query || '').toString().trim();

    if (!query) {
      return NextResponse.json(
        { success: false, error: '검색어가 필요합니다' },
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
    if (filters.type) q = q.eq('type', filters.type);
    if (filters.dong) q = q.ilike('dong', `%${filters.dong}%`);
    if (filters.maxDeposit) q = q.lte('deposit', filters.maxDeposit);
    if (filters.minDeposit) q = q.gte('deposit', filters.minDeposit);
    if (filters.maxMonthly) q = q.lte('monthly', filters.maxMonthly);
    if (filters.minArea) q = q.gte('area_m2', filters.minArea);
    if (filters.maxArea) q = q.lte('area_m2', filters.maxArea);
    if (filters.rooms) q = q.gte('rooms', filters.rooms);
    if (filters.parking) q = q.eq('parking', true);
    if (filters.elevator) q = q.eq('elevator', true);
    if (filters.pet) q = q.eq('pet', true);
    if (filters.businessType) q = q.ilike('business_type', `%${filters.businessType}%`);

    // 최신순 정렬
    q = q.order('created_at', { ascending: false });

    const { data, error } = await q;

    if (error) {
      console.error('AI 매칭 쿼리 오류:', error);
      return NextResponse.json(
        { success: false, error: '매물 조회 실패', detail: error.message },
        { status: 500 }
      );
    }

    // ※ 저작권 보호 + 자체 업로드 통과
    //   - 크롤링 매물의 외부 원본 이미지는 차단
    //   - 중개사가 직접 올린 자체 업로드 이미지는 통과
    const sanitized = (data || []).map((r: any) => applyImagePolicy(r));

    // 인식된 필터를 URL 쿼리스트링으로도 제공 (사용자가 /listings 로 이동할 때 재사용)
    const urlParams = new URLSearchParams();
    if (filters.deal) urlParams.set('deal', filters.deal);
    if (filters.type) urlParams.set('type', filters.type);
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
    return NextResponse.json(
      { success: false, error: '서버 오류', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
