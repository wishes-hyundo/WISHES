// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings - 매물 목록 조회 (캐시 최적화)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServerClient } from '@/lib/supabase';
import { cached, invalidateCache } from '@/lib/cache';
import { applyImagePolicy } from '@/lib/image-policy';
import { stripInternalFieldsArray } from '@/lib/listing-public';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

/**
 * 매물 목록 조회
 * @query ids        - 매물 ID 목록 (콤마 구분, 비교 페이지용)
 * @query id         - 단일 매물 ID (모바일 사진등록 / 딥링크용)
 * @query search     - 자유 텍스트 검색 (제목/주소/건물명/동). 숫자만 입력 시 id 로 자동 전환
 * @query sort       - 'latest' | 'price' | 'area' (기본 latest)
 * @query deal       - 거래 유형 (전세/월세/매매)
 * @query type       - 매물 유형
 * @query dong       - 동 이름
 * @query minDeposit - 최소 보증금 (만원)
 * @query maxDeposit - 최대 보증금 (만원)
 * @query limit      - 페이지당 결과 수 (기본값: 20, 최대 1000)
 * @query offset     - 오프셋 (기본값: 0)
 */
export async function GET(request: NextRequest) {
  try {
    // L-sec83 (2026-04-22): 메인 매물 목록. cached() 있으나
    //   ids/id/search 조합 unique 로 cache miss 가능.
    //   5분 300회/IP cap.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `listings:ip:${_ip}`, limit: 300, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const { searchParams } = new URL(request.url);

    // ━━━ IDs 기반 조회 (비교 페이지용) — 캐시 없이 직접 조회 ━━━
    // L-sec27 (2026-04-22): 공개 GET. ids 파라미터 cap.
    //   비교 페이지 UX 는 실제로는 4개 내외지만 관대히 100개까지 허용.
    const ids = searchParams.get('ids');
    if (ids) {
      const idList = ids
        .split(',')
        .map((id) => parseInt(id.trim()))
        .filter((id) => Number.isFinite(id) && id >= 0 && id <= 2_000_000_000)
        .slice(0, 100);
      if (idList.length === 0) {
        return NextResponse.json({ success: true, data: [], listings: [] });
      }

      const supabase = createServerClient();
      // L-sec92 (2026-04-22): IDOR 차단 — ids 벌크 조회도
      //   status='공개' 필터 없으면 ID 열거로 임시/비공개/삭제 매물 폭로.
      const { data, error } = await supabase
        .from('listings')
        .select('*, listing_images(*), listing_videos(id, url, poster_url, mime_type, sort_order)')
        .in('id', idList)
        .eq('status', '공개');

      if (error) {
        console.error('Supabase 쿼리 오류:', error);
        return NextResponse.json(
          { success: false, error: '매물 조회에 실패했습니다' },
          { status: 500 }
        );
      }

      // ※ 저작권 보호 + 자체 업로드 통과
      //   - 크롤링 매물의 외부 원본 이미지는 차단
      //   - 중개사가 직접 올린 자체 업로드 이미지(wishes.co.kr, supabase, R2)는 통과
      // L-sec64: embedding/dedup_* 제거
      const sanitized = stripInternalFieldsArray((data || []).map((r: any) => applyImagePolicy(r)));

      return NextResponse.json({
        success: true,
        data: sanitized,
        listings: sanitized,
      });
    }

    // ━━━ 단일 id 조회 (모바일 사진등록 / 딥링크) ━━━
    const singleId = searchParams.get('id');
    if (singleId) {
      const n = parseInt(singleId, 10);
      if (isNaN(n)) {
        return NextResponse.json({ success: true, data: [], listings: [], total: 0 });
      }
      const supabase = createServerClient();
      // L-sec92 (2026-04-22): IDOR 차단 — id=X 딥링크 분기도 공개 매물만.
      const { data, error } = await supabase
        .from('listings')
        .select('*, listing_images(url, sort_order, is_thumbnail), listing_videos(id, url, poster_url, mime_type, sort_order)')
        .eq('id', n)
        .eq('status', '공개')
        .limit(1);
      if (error) {
        console.error('Supabase 단일ID 조회 오류:', error);
        return NextResponse.json({ success: false, error: '매물 조회에 실패했습니다' }, { status: 500 });
      }
      // L-sec64: embedding/dedup_* 제거
      const sanitized = stripInternalFieldsArray((data || []).map((r: any) => applyImagePolicy(r)));
      return NextResponse.json({
        success: true,
        data: sanitized,
        listings: sanitized,
        total: sanitized.length,
      });
    }

    // ━━━ 자유 텍스트 검색 (title/address/building_name ilike) ━━━
    // L-sec27: q 길이 500자 cap. ILIKE pattern 폭증 방지.
    const rawSearch = searchParams.get('search') || searchParams.get('q');
    if (rawSearch) {
      const q = rawSearch.trim().slice(0, 500);
      if (!q) {
        return NextResponse.json({ success: true, data: [], listings: [], total: 0 });
      }
      // 숫자만 입력되면 id 조회로 자동 전환 (모바일 UX 대응)
      const onlyDigits = /^\d+$/.test(q);
      const supabase = createServerClient();

      const sLimit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
      const selectCols =
        // building_name + AI 제목/설명 + 세일즈 훅 필드 전량 (displayTitle / displayDescription 재가공용)
        'id, title, ai_title, ai_description, building_name, type, deal, deposit, monthly, price, address, address_detail, dong, area_m2, area_pyeong, rooms, bathrooms, floor_current, floor_total, status, source_site, created_at, updated_at, parking, elevator, full_option, pet, balcony, built_year, direction, description, station_name, station_distance, features, listing_images(url, sort_order, is_thumbnail), listing_videos(id, url, poster_url, mime_type, sort_order)';

      if (onlyDigits) {
        const n = parseInt(q, 10);
        // L-sec92 (2026-04-22): IDOR 차단 — 숫자만 입력 시 id 삼기 로직에도 status 필터.
        const { data, error } = await supabase
          .from('listings')
          .select(selectCols)
          .eq('id', n)
          .eq('status', '공개')
          .limit(1);
        if (error) {
          // L-sec70 (2026-04-22): Supabase error 메시지 prod 노출 차단
          const isDev = process.env.NODE_ENV !== 'production';
          return NextResponse.json(
            { success: false, error: isDev ? error.message : '매물 조회 실패' },
            { status: 500 },
          );
        }
        const sanitized = (data || []).map((r: any) => applyImagePolicy(r));
        return NextResponse.json({ success: true, data: sanitized, listings: sanitized, total: sanitized.length });
      }

      const pattern = '%' + q.replace(/%/g, '\\%') + '%';
      const { data, error } = await supabase
        .from('listings')
        .select(selectCols)
        .or(
          [
            `title.ilike.${pattern}`,
            `address.ilike.${pattern}`,
            `address_detail.ilike.${pattern}`,
            `building_name.ilike.${pattern}`,
            `dong.ilike.${pattern}`,
          ].join(',')
        )
        .order('created_at', { ascending: false })
        .limit(sLimit);

      if (error) {
        console.error('Supabase 검색 오류:', error);
        // L-sec70 (2026-04-22): Supabase error 메시지 prod 노출 차단
        const isDev = process.env.NODE_ENV !== 'production';
        return NextResponse.json(
          { success: false, error: isDev ? error.message : '매물 검색 실패' },
          { status: 500 },
        );
      }
      const sanitized = (data || []).map((r: any) => applyImagePolicy(r));
      return NextResponse.json({
        success: true,
        data: sanitized,
        listings: sanitized,
        total: sanitized.length,
      });
    }

    // ━━━ 일반 필터 조회 (인메모리 캐시 적용) ━━━
    // L-sec27: deal/type/dong 길이 cap — cacheKey 폭증 방지.
    const deal = (searchParams.get('deal') || '').slice(0, 20);
    const type = (searchParams.get('type') || '').slice(0, 40);
    const dong = (searchParams.get('dong') || '').slice(0, 60);
    const minDeposit = (searchParams.get('minDeposit') || '').slice(0, 20);
    const maxDeposit = (searchParams.get('maxDeposit') || '').slice(0, 20);
    const sort = searchParams.get('sort') || 'latest';
    // L-v7-p2 (2026-04-22): v7 §4 scope — 'mine' 이면 현재 로그인 사용자 소유만.
    //   auth 확인 실패 시 all 로 폴백 (보안상 타 사용자 매물 노출 방지). 캐시 키에 포함.
    const scopeParam = (searchParams.get('scope') || 'all').toLowerCase();
    const scope: 'all' | 'mine' = scopeParam === 'mine' ? 'mine' : 'all';
    // limit: 기본 20, 최대 1000 (Supabase 단일 쿼리 한도)
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 20 : rawLimit, 1), 1000);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    // 정렬 컬럼: latest(=created_at) 기본, price=deposit, area=area_m2
    const sortColumn = sort === 'price' ? 'deposit' : sort === 'area' ? 'area_m2' : 'created_at';

    // L-v7-p2: scope=mine 이면 auth 헤더에서 사용자 UID 추출 → 캐시 키에 포함
    //   verifyAdminAuth 는 /api/admin/* 전용이라 여기선 supabase auth 직접 사용.
    let scopeUid: string | null = null;
    if (scope === 'mine') {
      try {
        const authHdr = request.headers.get('authorization') || '';
        const token = authHdr.startsWith('Bearer ') ? authHdr.slice(7) : '';
        if (token) {
          const sb = createClient();
          const { data: { user } } = await sb.auth.getUser(token);
          scopeUid = user?.id || null;
        }
      } catch { /* scope=mine 실패 시 조용히 all 로 폴백 */ }
    }

    // 캐시 키: 필터+정렬+페이징+scope(uid) 조합별로 고유 키 생성
    const cacheKey = `listings:${deal}:${type}:${dong}:${minDeposit}:${maxDeposit}:${sortColumn}:${limit}:${offset}:${scopeUid || 'all'}`;

    const result = await cached(
      cacheKey,
      async () => {
        const supabase = createServerClient();

        let query = supabase
          .from('listings')
          .select(
            // [fix 2026-04-14] 상가 전용 필드 누락 이슈 해결 — 목록에서도 상세 필드 전량 반환
            // [fix 2026-04-20] listing_videos 조인 추가 — 동영상 첫 슬라이드/배지 노출용
            '*, listing_images(url, sort_order), listing_videos(id, url, poster_url, mime_type, sort_order)',
            { count: 'exact' }
          )
          .eq('status', '공개')
          .order(sortColumn, { ascending: false });

        if (deal) query = query.eq('deal', deal);
        if (type) query = query.eq('type', type);
        if (dong) query = query.eq('dong', dong);
        if (minDeposit) query = query.gte('deposit', parseInt(minDeposit));
        if (maxDeposit) query = query.lte('deposit', parseInt(maxDeposit));
        // L-v7-p2 (2026-04-22): scope=mine 이고 인증 성공한 경우만 사용자 소유로 제한.
        //   created_by 컬럼이 없는 row 는 자동 제외 (NULL eq 매칭 X).
        if (scope === 'mine' && scopeUid) {
          query = query.eq('created_by', scopeUid);
        }

        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        // ※ 저작권 보호 + 자체 업로드 통과
        //   - 크롤링 매물의 외부 원본 이미지는 차단
        //   - 중개사가 직접 올린 자체 업로드 이미지는 통과 (광고 노출)
        // L-sec64: embedding/dedup_* 제거
        const sanitized = stripInternalFieldsArray((data || []).map((r: any) => applyImagePolicy(r)));

        return { data: sanitized, total: count || 0 };
      },
      30_000,    // 30초 fresh
      300_000,   // 5분 stale 허용
      5_000,     // 5초 타임아웃
    );

    if (!result) {
      // 캐시도 없고 DB도 실패 → 빈 결과 반환 (사이트는 즉시 로드)
      return NextResponse.json(
        { success: true, data: [], total: 0 },
        { headers: { 'Cache-Control': 'no-cache' } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        total: result.total,
      },
      {
        headers: {
          // M2 (2026-04-21): s-maxage 30→300, SWR 60→3600
          //   비개인화 공용 목록. Supabase 재조회 부담 감소, 관리자 매물 수정 시
          //   revalidatePath('/api/listings') 로 즉시 무효화 가능.
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        },
      }
    );
  } catch (error) {
    console.error('매물 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}
