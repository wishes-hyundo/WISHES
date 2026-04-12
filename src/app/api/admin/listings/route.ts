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

// 요청 검증 스키마
const createListingSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  type: z.enum(['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실']),
  deal: z.enum(['전세', '월세', '매매']),
  deposit: z.number().int().nonnegative().default(0),
  monthly: z.number().int().nonnegative().optional().nullable(),
  price: z.number().int().nonnegative().optional().nullable(),
  maintenance_fee: z.number().int().nonnegative().default(0).optional(),
  maintenance_includes: z.array(z.string()).optional().nullable(),
  area_m2: z.number().positive(),
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
  status: z.enum(['가용', '계약중', '계약완료']).default('가용').optional(),
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
});

/**
 * 인증 검증 헬퍼 함수
 */
function verifyAuth(request: NextRequest): boolean {
  // 헤더 인증 (기존)
  const authHeader = request.headers.get('authorization');
  const password = authHeader?.replace('Bearer ', '');
  if (password === 'wishes2026') return true;
  // 쿼리파라미터 인증 (크롤러 no-cors 모드용 — preflight 없이 호출 가능)
  const { searchParams } = new URL(request.url);
  return searchParams.get('token') === 'wishes2026';
}

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

    if (fields === 'minimal') {
      // ⚡⚡⚡ 초경량 모드 (v3) — 전방위 최적화
      //  1) listing_images 는 url 만 → 이미지 페이로드 75% 감소
      //  2) null/빈 필드 제거 → 전체 20~30% 추가 감소
      //  3) unstable_cache 로 Node 레벨 메모이제이션 (60s)
      //  4) CDN: s-maxage=300, stale-while-revalidate=86400
      //  5) ETag + 304 Not Modified (재방문 0-byte 응답)
      const selectFields = [
        'id', 'title', 'type', 'deal', 'status',
        'deposit', 'monthly', 'price',
        'maintenance_fee', 'maintenance_includes',
        'area_m2', 'area_supply_m2',
        'floor_current', 'floor_total',
        'rooms', 'bathrooms', 'direction',
        'address', 'address_detail', 'dong',
        'lat', 'lng',
        'available_date', 'built_year',
        'parking', 'elevator', 'pet', 'balcony', 'full_option', 'loan_available',
        'business_type', 'goodwill_fee',
        'station_name', 'station_distance',
        'listing_images(url)' // ⚡ id/is_thumbnail/sort_order 제거 — 이미지 페이로드 -75%
      ].join(',');

      // Node 레벨 60초 캐시: 여러 edge 호출 간에도 Supabase 쿼리 재사용
      const getCached = unstable_cache(
        async () => {
          const PAGE_SIZE = 1000;

          // 1차 페이지
          const { data: firstPage, error: firstError } = await supabase
            .from('listings')
            .select(selectFields)
            .order('created_at', { ascending: false })
            .range(0, PAGE_SIZE - 1);

          if (firstError || !firstPage) return [];

          let allData: any[] = [...firstPage];

          // 나머지 페이지 병렬 fetch
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
                allData = allData.concat(data);
              } else {
                break;
              }
            }
          }

          // 🧹 null / 빈 배열 / 빈 문자열 / false 불리언 제거로 페이로드 20~30% 감소
          // (클라이언트는 접근 시 기본값 fallback 으로 처리)
          const slim = allData.map((row: any) => {
            const out: any = {};
            for (const k in row) {
              const v = row[k];
              if (v === null || v === undefined || v === '' || v === false) continue;
              if (Array.isArray(v) && v.length === 0) continue;
              out[k] = v;
            }
            return out;
          });

          return slim;
        },
        ['listings-minimal-v3'],
        { revalidate: 60, tags: ['listings'] }
      );

      const allData = await getCached();

      // ETag 기반 304 응답
      const bodyStr = JSON.stringify({ success: true, data: allData, total: allData.length });
      const etag = '"' + createHash('sha1').update(bodyStr).digest('hex').substring(0, 16) + '"';
      const ifNoneMatch = request.headers.get('if-none-match');
      if (ifNoneMatch === etag) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            'ETag': etag,
            'Cache-Control': 's-maxage=300, stale-while-revalidate=86400',
            'CDN-Cache-Control': 'max-age=300',
          },
        });
      }

      const response = new NextResponse(bodyStr, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'ETag': etag,
          // 🔥 공격적 캐싱: 5분 CDN 캐시 + 하루 내내 stale-while-revalidate
          'Cache-Control': 's-maxage=300, stale-while-revalidate=86400',
          'CDN-Cache-Control': 'max-age=300',
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
    // dong 자동 추출 (address에서 "동" 추출)
    if (!body.dong && body.address) {
      const dongMatch = body.address.match(/([가-힣]+동)/);
      body.dong = dongMatch ? dongMatch[1] : (body.address.split(' ')[1] || body.address.split(' ')[0] || '미입력');
    }
    if (!body.dong) body.dong = '미입력';
    // gu 자동 추출 (address에서 "구" 추출)
    if (!body.gu && body.address) {
      const guMatch = body.address.match(/([가-힣]+구)/);
      if (guMatch) body.gu = guMatch[1];
    }
    // contact_number → contact 호환
    if (body.contact_number && !body.contact) body.contact = body.contact_number;
    // type 자동 매핑 (크롤러에서 사용하는 type → API enum)
    const typeMap: Record<string, string> = {
      '빌라': '원룸', '공장/창고': '상가', '지식산업센터': '사무실',
      '쓰리룸': '쓰리룸', '단독/다가구': '원룸',
    };
    if (body.type && typeMap[body.type]) body.type = typeMap[body.type];
    // area_m2가 0이면 0.1로 (양수 required)
    if (!body.area_m2 || body.area_m2 <= 0) body.area_m2 = 0.1;

    const parsed = createListingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message, detail: JSON.stringify(parsed.error.errors) },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createServerClient();

    const { images, ...listingData } = parsed.data;

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
        status: listingData.status || '가용',
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

        await supabase
          .from('listing_images')
          .insert(imageInserts);
      }
    }

    if (!data) {
      const { data: fetchedData } = await supabase
        .from('listings')
        .select('*, listing_images(*)')
        .eq('id', id)
        .single();

      data = fetchedData;
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: '매물을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    revalidatePath('/', 'layout');
    revalidatePath('/listings', 'page');
    revalidatePath('/map', 'page');
    revalidatePath(`/listings/${id}`, 'page');
    revalidateTag('listings');

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('매물 수정 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 수정에 실패했습니다', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
