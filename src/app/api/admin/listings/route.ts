// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET, POST, PUT /api/admin/listings
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';

// ━━━ 카카오 지오코딩 헬퍼 ━━━
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || !KAKAO_REST_API_KEY) return null;
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.documents && data.documents.length > 0) {
        return { lat: parseFloat(data.documents[0].y), lng: parseFloat(data.documents[0].x) };
      }
    }
    const kwRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    if (kwRes.ok) {
      const kwData = await kwRes.json();
      if (kwData.documents && kwData.documents.length > 0) {
        return { lat: parseFloat(kwData.documents[0].y), lng: parseFloat(kwData.documents[0].x) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

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
  status: z.enum(['가용', '계약중', '계약완료']).default('가용').optional(),
  images: z.array(z.string()).optional(),
});

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const password = authHeader?.replace('Bearer ', '');
  return password === 'wishes2026';
}

export async function GET(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('listings')
      .select('*, listing_images(*)')
      .order('created_at', { ascending: false });
    if (error) {
      return NextResponse.json({ success: false, error: '매물 조회에 실패했습니다', detail: error?.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    return NextResponse.json({ success: false, error: '매물 조회에 실패했습니다' }, { status: 500 });
  }
    }

export async function POST(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }
    const body = await request.json();
    const parsed = createListingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message, detail: JSON.stringify(parsed.error.errors) }, { status: 400 });
    }
    const supabase = createServerClient();
    const { images, ...listingData } = parsed.data;

    // ★ 자동 지오코딩: lat/lng가 없으면 주소로 좌표 자동 변환
    let finalLat = listingData.lat || null;
    let finalLng = listingData.lng || null;
    if ((!finalLat || !finalLng) && listingData.address) {
      const coords = await geocodeAddress(listingData.address);
      if (coords) {
        finalLat = coords.lat;
        finalLng = coords.lng;
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
        floor_current: listingData.floor_current || null,
        floor_total: listingData.floor_total || null,
        rooms: listingData.rooms || null,
        bathrooms: listingData.bathrooms || null,
        direction: listingData.direction || null,
        heating_type: listingData.heating_type || null,
        address: listingData.address,
        address_detail: listingData.address_detail || null,
        dong: listingData.dong,
        lat: finalLat,
        lng: finalLng,
        description: listingData.description || null,
        available_date: listingData.available_date || null,
        built_year: listingData.built_year || null,
        parking: listingData.parking || false,
        elevator: listingData.elevator || false,
        pet: listingData.pet || false,
        balcony: listingData.balcony || false,
        full_option: listingData.full_option || false,
        loan_available: listingData.loan_available ?? true,
        status: listingData.status || '가용',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: '매물 생성에 실패했습니다', detail: error?.message }, { status: 500 });
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
      if (!imgError) imageResults = imgData || [];
    }

    revalidatePath('/', 'layout');
    revalidatePath('/listings', 'page');
    revalidatePath('/map', 'page');

    return NextResponse.json({
      success: true,
      data: { ...data, listing_images: imageResults },
      geocoded: (!listingData.lat || !listingData.lng) && finalLat !== null,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: '매물 생성에 실패했습니다', detail: error?.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }
    const body = await request.json();
    const { id, images, ...updateData } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: '매물 ID가 필요합니다' }, { status: 400 });
    }
    const parsed = createListingSchema.partial().safeParse(updateData);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }
    const supabase = createServerClient();
    const updateValues: Record<string, any> = {};
    Object.entries(parsed.data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'images') {
        updateValues[key] = value;
      }
    });

    // ★ 자동 지오코딩: 주소가 변경되었는데 lat/lng가 없으면 자동 변환
    if (updateValues.address && !updateValues.lat && !updateValues.lng) {
      const coords = await geocodeAddress(updateValues.address);
      if (coords) {
        updateValues.lat = coords.lat;
        updateValues.lng = coords.lng;
      }
    }

    if (Object.keys(updateValues).length === 0 && !images) {
      return NextResponse.json({ success: false, error: '수정할 필드가 없습니다' }, { status: 400 });
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
        return NextResponse.json({ success: false, error: '매물 수정에 실패했습니다', detail: error?.message }, { status: 500 });
      }
      data = updatedData;
    }
    if (images && Array.isArray(images)) {
      await supabase.from('listing_images').delete().eq('listing_id', id);
      if (images.length > 0) {
        const imageInserts = images.map((url: string, index: number) => ({
          listing_id: id,
          url: url,
          alt: `매물 이미지 ${index + 1}`,
          sort_order: index,
          is_thumbnail: index === 0,
        }));
        await supabase.from('listing_images').insert(imageInserts);
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
      return NextResponse.json({ success: false, error: '매물을 찾을 수 없습니다' }, { status: 404 });
    }
    revalidatePath('/', 'layout');
    revalidatePath('/listings', 'page');
    revalidatePath('/map', 'page');
    revalidatePath(`/listings/${id}`, 'page');

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: '매물 수정에 실패했습니다', detail: error?.message }, { status: 500 });
  }
}
