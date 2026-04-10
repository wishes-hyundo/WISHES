// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET, POST, PUT /api/admin/listings
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';

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
  status: z.enum(['가용', '계약중', '계약완료']).default('가용').optional(),
  images: z.array(z.string()).optional(),
});

/**
 * 인증 검증 헬퍼 함수
 */
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const password = authHeader?.replace('Bearer ', '');
  return password === 'wishes2026';
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
      const selectFields = [
        'id', 'title', 'type', 'deal', 'status',
        'deposit', 'monthly', 'price',
        'maintenance_fee', 'maintenance_includes',
        'area_m2', 'area_supply_m2',
        'floor_current', 'floor_total',
        'rooms', 'bathrooms', 'direction',
        'address', 'address_detail', 'dong',
        'lat', 'lng',
        'description', 'available_date', 'built_year',
        'parking', 'elevator', 'pet', 'balcony', 'full_option', 'loan_available',
        'business_type', 'goodwill_fee',
        'station_name', 'station_distance',
        'created_at', 'updated_at',
        'listing_images(id,url,is_thumbnail,sort_order)'
      ].join(',');

      let allData: any[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('listings')
          .select(selectFields)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          console.error('매물 조회 오류 (minimal, offset=' + from + '):', error);
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
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = createListingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message, detail: JSON.stringify(parsed.error.errors) },
        { status: 400 }
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
        floor_current: listingData.floor_current || null,
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
      })
      .select()
      .single();

    if (error) {
      console.error('매물 생성 오류:', error);
      return NextResponse.json(
        { success: false, error: '매물 생성에 실패했습니다', detail: error?.message || String(error) },
        { status: 500 }
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

    return NextResponse.json(
      {
        success: true,
        data: {
          ...data,
          listing_images: imageResults,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('매물 생성 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 생성에 실패했습니다', detail: error?.message || String(error) },
      { status: 500 }
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
