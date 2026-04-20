// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET, POST, PUT /api/admin/listings
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';

// CORS 헤더 (크롤러가 외부 도메인에서 POST 가능하도록)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}
import { revalidatePath, unstable_cache, revalidateTag } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { createHash } from 'crypto';
import { cached, invalidateCache } from '@/lib/cache';

// 요청 검증 스키마
const createListingSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  type: z.enum([
    '원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '빌라',
    '주택', '상가', '사무실', '지식산업센터', '토지',
    '사무실/상가', // 크롤러 레거시 호환
  ]),
  deal: z.enum(['전세', '월세', '매매']),
  deposit: z.number().int().nonnegative().default(0),
  monthly: z.number().int().nonnegative().optional().nullable(),
  price: z.number().int().nonnegative().optional().nullable(),
  maintenance_fee: z.number().int().nonnegative().default(0).optional(),
  maintenance_includes: z.array(z.string()).optional().nullable(),
  area_m2: z.number().nonnegative(),
  area_supply_m2: z.number().positive().optional().nullable(),
  area_land_m2: z.number().positive().optional().nullable(),
  floor_current: z.string().optional().nullable(),
  floor_total: z.string().optional().nullable(),
  rooms: z.number().int().positive().optional().nullable(),
  bathrooms: z.number().int().positive().optional().nullable(),
  direction: z.string().optional().nullable(),
  heating_type: z.string().optional().nullable(),
  address: z.string().min(1),
  address_detail: z.string().optional().nullable(),
  dong: z.string().min(1),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  description: z.string().optional().nullable(),
  available_date: z.string().optional().nullable(),
  built_year: z.string().optional().nullable(),
  parking: z.boolean().default(false).optional(),
  elevator: z.boolean().default(false).optional(),
  pet: z.boolean().default(false).optional(),
  balcony: z.boolean().default(false).optional(),
  full_option: z.boolean().default(false).optional(),
  loan_available: z.boolean().default(true).optional(),
  business_type: z.string().optional().nullable(),
  goodwill_fee: z.number().int().nonnegative().optional().nullable(),
  vat_included: z.boolean().optional().nullable(),
  station_name: z.string().optional().nullable(),
  station_distance: z.number().int().nonnegative().optional().nullable(),
  usage_approved: z.string().optional().nullable(),
  electric_capacity: z.string().optional().nullable(),
  signage_available: z.boolean().optional().nullable(),
  meeting_room: z.number().int().nonnegative().optional().nullable(),
  // 상업용 업종 정보
  previous_business: z.string().optional().nullable(),
  recommended_business: z.string().optional().nullable(),
  restricted_business: z.string().optional().nullable(),
  parking_spaces: z.number().int().nonnegative().optional().nullable(),
  // 크롤링 출처 정보
  source_site: z.string().optional().nullable(),
  source_id: z.string().optional().nullable(),
  source_url: z.string().optional().nullable(),
  building_name: z.string().optional().nullable(),
  contact: z.string().optional().nullable(),
  lease_period: z.string().optional().nullable(),
  rights_fee: z.number().int().nonnegative().optional().nullable(),
  status: z.enum(['공개', '비공개', '계약중', '계약완료']).default('공개').optional(),
  images: z.array(z.string()).optional(),
  // 신규 필드 (2026-04-12 추가)
  gu: z.string().optional().nullable(),
  entrance_type: z.string().optional().nullable(),
  features: z.array(z.string()).optional().nullable(),
  parking_fee: z.number().int().nonnegative().optional().nullable(),
  building_purpose: z.string().optional().nullable(),
  previous_brand: z.string().optional().nullable(),
  commission_fee: z.number().int().nonnegative().optional().nullable(),
  special_notes: z.string().optional().nullable(),
  contact_role: z.string().optional().nullable(),
  h: z.string().optional().nullable(),
    // 크롤러 v14 신규 필드 (2026-04-13 추가)
    base_price: z.number().int().optional().nullable(),
    registered_date: z.string().optional().nullable(),
    last_confirmed: z.string().optional().nullable(),
    photo_count: z.number().int().optional().nullable(),
    grade: z.string().optional().nullable(),
    building_listings: z.string().optional().nullable(),
    listing_images: z.array(z.string()).optional().nullable(),
    area_pyeong: z.number().optional().nullable(),
    floor_info: z.string().optional().nullable(),
    // T2-5: VR/360° 투어 임베드 URL
    vr_url: z.string().optional().nullable(),
});

/**
 * 인증 검증 헬퍼 함수
 * 허용 토큰:
 *   1) 'wishes2026' 고정 관리자 토큰 (크롤러/프리페치/컨텐츠JS)
 *   2) 'admin_bridge_' 로 시작하는 브리지 토큰 (관리자 자동로그인)
 *   3) Supabase access_token (JWT 형식) — 형식 검증만 (서명검증 생략: 매물 목록은 /search 브리더 포털용이므로)
 */
/**
 * null/undefined/빈값 제거 — Egress 페이로드 축소용
 */
function compactRow(row: any): any {
  const out: any = {};
  for (const k in row) {
    const v = row[k];
    if (v === null || v === undefined || v === '' || v === false) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

/**
 * listing_images 배열에서 썸네일 1장만 유지 (is_thumbnail=true 우선, 없으면 sort_order=0)
 * 카드 리스트에서는 썸네일 1장만 필요. 상세모달은 /api/listings/[id] 로 lazy-load.
 * Egress 절감: 매물당 평균 3~5장 → 1장 (~70% 이미지 URL 제거)
 */
function keepThumbnailOnly(row: any): any {
  if (!Array.isArray(row.listing_images) || row.listing_images.length === 0) return row;
  const imgs = row.listing_images;
  const thumb = imgs.find((i: any) => i && i.is_thumbnail)
    || imgs.slice().sort((a: any, b: any) => (a.sort_order ?? 99) - (b.sort_order ?? 99))[0];
  row.listing_images = thumb ? [{ url: thumb.url }] : [];
  return row;
}

import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';
import { geocodeAddress } from '@/lib/geocode';

/**
 * GET /api/admin/listings - 모든 매물 조회 (관리자용)
 *
 * Query params:
 *   ?fields=minimal  → 목록용 경량 응답 (이미지 1개만, 불필요 필드 제외)
 *   (기본)           → 전체 필드 + 전체 이미지
 *
 * ⚠️ Supabase 기본 1000행 제한 → .range()로 전체 조회
 */
export async function GET(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const fields = searchParams.get('fields');

    // ⚡ ids_only 모드: delta 감지용 초경량 (id + status + created_at 만)
    //   — 제거된 매물 탐지 및 전체 ID 집합 비교용
    //   — 평균 응답 크기: 15,000건 × 50bytes ≈ 750 KB (full minimal 대비 1/25)
    const idsOnly = searchParams.get('ids_only');
    if (idsOnly === '1' || idsOnly === 'true') {
      const PAGE_SIZE = 1000;
      const { data: firstPage } = await supabase
        .from('listings')
        .select('id,status,created_at')
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1);

      let all: any[] = firstPage ? [...firstPage] : [];
      if (firstPage && firstPage.length === PAGE_SIZE) {
        const parallelPages = [];
        for (let from = PAGE_SIZE; from < 20000; from += PAGE_SIZE) {
          parallelPages.push(
            supabase.from('listings').select('id,status,created_at')
              .order('created_at', { ascending: false })
              .range(from, from + PAGE_SIZE - 1)
          );
        }
        const results = await Promise.all(parallelPages);
        for (const { data } of results) {
          if (data && data.length > 0) all = all.concat(data); else break;
        }
      }
      return NextResponse.json({ success: true, data: all, total: all.length });
    }

    if (fields === 'minimal') {
      // ⚡⚡⚡ 초경량 모드 (v8 - 2026-04-14) — "전체 컬럼 반환" 정책 전환
      //   [v8] selectFields 화이트리스트를 전부 제거하고 '*' 로 변경.
      //   이유: 크롤러가 새 필드를 DB에 추가할 때마다 selectFields 에 수동 등록해야 하는
      //        유지보수 부담이 계속 버그를 유발하므로(상가 필드 누락 이슈 반복),
      //        "스키마에 있는 모든 컬럼은 자동으로 프론트까지 도달" 정책으로 전환.
      //
      //   Egress 부담은 compactRow() 로 null/빈값 제거 + keepThumbnailOnly() 로 이미지 1장만
      //   유지하여 완화. 실측상 raw_fields(jsonb) 포함해도 카드 하나당 평균 2~4 KB.
      //
      //   향후 신규 필드: 크롤러 → DB 컬럼 추가(또는 raw_fields 에 넣기) → UI 자동 표시.
      //   API/프론트 코드 변경 불필요.
      //
      // ?since=<ISO> 파라미터 — 해당 시각 이후 생성된 매물만 반환 (delta 동기화용)
      const since = searchParams.get('since'); // ISO timestamp string
      const selectFields = '*, listing_images(url,sort_order,is_thumbnail)';

      // since 파라미터가 있으면 delta 쿼리 (캐시 우회 + 작은 응답)
      if (since) {
        const { data: deltaData } = await supabase
          .from('listings')
          .select(selectFields)
          .gt('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1000);
        const cleaned = (deltaData || []).map(compactRow).map(keepThumbnailOnly);
        return NextResponse.json({ success: true, data: cleaned, total: cleaned.length, since });
      }

      // 🔥 인메모리 캐시: 30초 fresh, 3분 stale 허용, 30초 타임아웃
      // v9 (2026-04-14): 전체 삭제 후 재시작 — 캐시 무효화 + TTL 단축 (신규 크롤링 빠른 반영)
      //                   fresh 60s→30s / stale 10min→3min
      // v8: select('*') 전환
      // v7: 상가 필드 포함
      // v6: 빈 응답 캐싱 방지 (poison cache fix)
      const allData = await cached(
        'admin-listings-minimal-v9',
        async () => {
          const PAGE_SIZE = 1000;
          const { data: firstPage, error: firstError } = await supabase
            .from('listings')
            .select(selectFields)
            .order('created_at', { ascending: false })
            .range(0, PAGE_SIZE - 1);

          if (firstError) throw new Error('supabase-err: ' + firstError.message);
          if (!firstPage || firstPage.length === 0) throw new Error('empty-first-page');

          let all: any[] = [...firstPage];

          if (firstPage.length === PAGE_SIZE) {
            const parallelPages = [];
            for (let from = PAGE_SIZE; from < 20000; from += PAGE_SIZE) {
              parallelPages.push(
                supabase
                  .from('listings')
                  .select(selectFields)
                  .order('created_at', { ascending: false })
                  .range(from, from + PAGE_SIZE - 1)
              );
            }
            const results = await Promise.all(parallelPages);
            for (const { data } of results) {
              if (data && data.length > 0) {
                all = all.concat(data);
              } else {
                break;
              }
            }
          }

          // null/빈 값 제거 + 썸네일만 유지
          return all.map(compactRow).map(keepThumbnailOnly);
        },
        30_000,     // 30초 fresh (크롤링 신규매물 빠른 반영)
        180_000,    // 3분 stale 허용
        30_000,     // 30초 타임아웃 (15K 행 pagination 여유)
      ) || [];

      // ETag 기반 304 응답
      const bodyStr = JSON.stringify({ success: true, data: allData, total: allData.length });
      const etag = '"' + createHash('sha1').update(bodyStr).digest('hex').substring(0, 16) + '"';
      // 빈 응답은 CDN 캐시 금지 (Supabase 일시 오류 시 poison cache 방지)
      const cacheCtrl = allData.length === 0
        ? 'no-cache, no-store, must-revalidate'
        : 's-maxage=30, stale-while-revalidate=180';
      const ifNoneMatch = request.headers.get('if-none-match');
      if (ifNoneMatch === etag && allData.length > 0) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            'ETag': etag,
            'Cache-Control': cacheCtrl,
            'CDN-Cache-Control': allData.length === 0 ? 'no-store' : 'max-age=30',
          },
        });
      }

      const response = new NextResponse(bodyStr, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'ETag': etag,
          'Cache-Control': cacheCtrl,
          'CDN-Cache-Control': allData.length === 0 ? 'no-store' : 'max-age=30',
          'Vary': 'Accept-Encoding',
        },
      });
      return response;
    }

    let allData: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('listings')
        .select('*, listing_images(*)')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error('매물 조회 오류 (offset=' + from + '):', error);
        break;
      }

      if (data && data.length > 0) {
        allData = allData.concat(data);
        from += PAGE_SIZE;
        hasMore = data.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    return NextResponse.json({
      success: true,
      data: allData,
      total: allData.length,
    });
  } catch (error) {
    console.error('매물 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/listings - 매물 생성
 * 이미지 URL 배열이 포함된 경우, 매물 생성 후 listing_images 테이블에 연결
 */
export async function POST(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // text/plain으로 전송된 JSON도 파싱 (no-cors 크롤러 호환)
    let body: any;
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await request.json();
    } else {
      const text = await request.text();
      try { body = JSON.parse(text); } catch { body = {}; }
    }

    // 크롤러 호환: 구 필드명 → 현재 필드명 자동 변환
    if (body.transaction_type && !body.deal) body.deal = body.transaction_type;
    if (body.monthly_rent !== undefined && body.monthly === undefined) body.monthly = body.monthly_rent;
    if (body.sale_price !== undefined && body.price === undefined) body.price = body.sale_price;
    if (body.floor !== undefined && body.floor_current === undefined) body.floor_current = body.floor ? String(body.floor) : null;
    if (body.year_built !== undefined && body.built_year === undefined) body.built_year = body.year_built ? String(body.year_built) : null;
    // dong 자동 추출 (address에서 "동" 추출 - 개선된 regex)
    if (!body.dong && body.address) {
      // "OO동" 패턴 추출 (구 뒤의 동, 또는 시/군 뒤의 동)
      const dongPatterns = [
        /(?:구|시|군)\s+([가-힣]+동)\b/,   // "강남구 청담동" → 청담동
        /([가-힣]{2,}동)\s*\d/,            // "신림동 123" → 신림동
        /([가-힣]{2,}동)\b/,               // 일반적인 "OO동" 패턴
      ];
      let dongFound = '';
      for (const pat of dongPatterns) {
        const m = body.address.match(pat);
        if (m) { dongFound = m[1]; break; }
      }
      body.dong = dongFound || (body.address.split(' ')[1] || body.address.split(' ')[0] || '미입력');
    }
    if (!body.dong) body.dong = '미입력';
    // gu 자동 추출 (address에서 "구" 추출)
    if (!body.gu && body.address) {
      const guMatch = body.address.match(/([가-힣]+구)/);
      if (guMatch) body.gu = guMatch[1];
    }
    // contact_number → contact 호환
    if (body.contact_number && !body.contact) body.contact = body.contact_number;
    // type 자동 매핑 (크롤러 → API 표준 라벨)
    //   2026-04-20: 이전 버전은 '빌라' → '원룸' 등 파괴적 매핑이 있었음 → 제거.
    //   이제 schema 가 빌라/주택/지식산업센터/토지 도 허용하므로 그대로 저장.
    //   '단독/다가구' 같은 비표준 값만 최소 매핑.
    const typeMap: Record<string, string> = {
      '공장/창고': '상가',
      '단독/다가구': '주택',
    };
    if (body.type && typeMap[body.type]) body.type = typeMap[body.type];
    // area_m2가 없으면 0으로 설정
    if (!body.area_m2 || body.area_m2 < 0) body.area_m2 = 0;

    const parsed = createListingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message, detail: JSON.stringify(parsed.error.errors) },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createServerClient();

    const { images, ...listingData } = parsed.data;

    // ── 자동 지오코딩 (lat/lng 미수신 시) ──
    //   크롤러/외부 POST 에서 좌표를 함께 보내지 않는 경우, 주소로 Kakao Local API를
    //   즉시 호출해서 lat/lng 을 채운다. 실패해도 insert 자체는 진행 (null 상태로 저장).
    //   2026-04-20: /map 신규 매물 미노출 회귀 방어.
    if ((listingData.lat == null || listingData.lng == null) && listingData.address) {
      try {
        const coords = await geocodeAddress(listingData.address);
        if (coords) {
          listingData.lat = coords.lat;
          listingData.lng = coords.lng;
        }
      } catch (e) {
        console.warn('자동 지오코딩 실패(무시하고 insert 진행):', e);
      }
    }

    const { data, error } = await supabase
      .from('listings')
      .insert({
        title: listingData.title,
        type: listingData.type,
        deal: listingData.deal,
        deposit: listingData.deposit,
        monthly: listingData.monthly || null,
        price: listingData.price || null,
        maintenance_fee: listingData.maintenance_fee || 0,
        maintenance_includes: listingData.maintenance_includes || null,
        area_m2: listingData.area_m2,
        area_supply_m2: listingData.area_supply_m2 || null,
        area_land_m2: listingData.area_land_m2 || null,
        floor_current: listingData.floor_current || '미상',
        floor_total: listingData.floor_total || null,
        rooms: listingData.rooms || null,
        bathrooms: listingData.bathrooms || null,
        direction: listingData.direction || null,
        heating_type: listingData.heating_type || null,
        address: listingData.address,
        address_detail: listingData.address_detail || null,
        dong: listingData.dong,
        lat: listingData.lat || null,
        lng: listingData.lng || null,
        description: listingData.description || null,
        available_date: listingData.available_date || null,
        built_year: listingData.built_year || null,
        parking: listingData.parking || false,
        elevator: listingData.elevator || false,
        pet: listingData.pet || false,
        balcony: listingData.balcony || false,
        full_option: listingData.full_option || false,
        loan_available: listingData.loan_available ?? true,
        business_type: listingData.business_type || null,
        goodwill_fee: listingData.goodwill_fee || null,
        vat_included: listingData.vat_included || null,
        station_name: listingData.station_name || null,
        station_distance: listingData.station_distance || null,
        usage_approved: listingData.usage_approved || null,
        electric_capacity: listingData.electric_capacity || null,
        signage_available: listingData.signage_available || null,
        meeting_room: listingData.meeting_room || null,
        status: listingData.status || '공개',
        previous_business: listingData.previous_business || null,
        recommended_business: listingData.recommended_business || null,
        restricted_business: listingData.restricted_business || null,
        parking_spaces: listingData.parking_spaces || null,
        source_site: listingData.source_site || null,
        source_id: listingData.source_id || null,
        source_url: listingData.source_url || null,
        building_name: listingData.building_name || null,
        contact: listingData.contact || null,
        lease_period: listingData.lease_period || null,
        rights_fee: listingData.rights_fee || null,
        gu: listingData.gu || null,
        entrance_type: listingData.entrance_type || null,
        features: listingData.features || null,
        parking_fee: listingData.parking_fee || null,
        building_purpose: listingData.building_purpose || null,
        previous_brand: listingData.previous_brand || null,
        commission_fee: listingData.commission_fee || null,
        special_notes: listingData.special_notes || null,
        contact_role: listingData.contact_role || null,
        commission_note: listingData.commission_note || null,
      })
      .select()
      .single();

    if (error) {
      console.error('매물 생성 오류:', error);
      return NextResponse.json(
        { success: false, error: '매물 생성에 실패했습니다', detail: error?.message || String(error) },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    let imageResults: any[] = [];
    if (images && images.length > 0 && data?.id) {
      const imageInserts = images.map((url: string, index: number) => ({
        listing_id: data.id,
        url: url,
        alt: `${listingData.title} 이미지 ${index + 1}`,
        sort_order: index,
        is_thumbnail: index === 0,
      }));

      const { data: imgData, error: imgError } = await supabase
        .from('listing_images')
        .insert(imageInserts)
        .select();

      if (imgError) {
        console.error('이미지 연결 오류:', imgError);
      } else {
        imageResults = imgData || [];
      }
    }

    // 캐시 무효화 (인메모리 + Next.js)
    invalidateCache('listings');
    revalidatePath('/', 'layout');
    revalidatePath('/listings', 'page');
    revalidatePath('/map', 'page');
    revalidateTag('listings');

    return NextResponse.json(
      {
        success: true,
        data: {
          ...data,
          listing_images: imageResults,
        },
      },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error('매물 생성 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 생성에 실패했습니다', detail: error?.message || String(error) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

/**
 * PUT /api/admin/listings - 매물 수정
 */
export async function PUT(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const body = await request.json();
    // status 검증
    const { id, images, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: '매물 ID가 필요합니다' },
        { status: 400 }
      );
    }

    const parsed = createListingSchema.partial().safeParse(updateData);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const updateValues: Record<string, any> = {};
    Object.entries(parsed.data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'images') {
        updateValues[key] = value;
      }
    });

    // ── 자동 재지오코딩 (주소는 있는데 lat/lng 이 null 로 업데이트되려는 경우) ──
    //   2026-04-20: 신규/수정 매물이 좌표 없이 들어와 /map 에 안 뜨는 이슈 방어.
    const wantsAddr = typeof updateValues.address === 'string' && updateValues.address.length > 0;
    const latMissing = updateValues.lat == null;
    const lngMissing = updateValues.lng == null;
    if (wantsAddr && (latMissing || lngMissing)) {
      try {
        const coords = await geocodeAddress(updateValues.address);
        if (coords) {
          updateValues.lat = coords.lat;
          updateValues.lng = coords.lng;
        }
      } catch (e) {
        console.warn('자동 지오코딩 실패(무시하고 update 진행):', e);
      }
    }

    if (Object.keys(updateValues).length === 0 && !images) {
      return NextResponse.json(
        { success: false, error: '수정할 필드가 없습니다' },
        { status: 400 }
      );
    }

    let data = null;

    if (Object.keys(updateValues).length > 0) {
      const { data: updatedData, error } = await supabase
        .from('listings')
        .update(updateValues)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('매물 수정 오류:', error);
        return NextResponse.json(
          { success: false, error: '매물 수정에 실패했습니다', detail: error?.message || String(error) },
          { status: 500 }
        );
      }

      data = updatedData;
    }

    if (images && Array.isArray(images)) {
      await supabase
        .from('listing_images')
        .delete()
        .eq('listing_id', id);

      if (images.length > 0) {
        const imageInserts = images.map((url: string, index: number) => ({
          listing_id: id,
          url: url,
          alt: `매물 이미지 ${index + 1}`,
          sort_order: index,
          is_thumbnail: index === 0,
        }));

        const { error: imgError } = await supabase
          .from('listing_images')
          .insert(imageInserts);

        if (imgError) {
          console.error('이미지 연결 오류:', imgError);
        }
      }
    }

    // 캐시 무효화
    invalidateCache('listings');
    revalidatePath('/', 'layout');
    revalidatePath('/listings', 'page');
    revalidatePath('/map', 'page');
    revalidateTag('listings');

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('매물 수정 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 수정에 실패했습니다', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}