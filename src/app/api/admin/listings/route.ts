// ────────────────────────────────────────
// Admin API: GET, POST, PUT /api/admin/listings
// ────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';

// 요청 검증 스키마
const createListingSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  type: z.enum(['원룸', '투룸', '쓰리룸+', '오피스텔', '아파트', '상가', '사무실']),
  deal: z.enum(['전세', '월세', '매매']),
  deposit: z.number().int().nonnegative().default(0),
  monthly: z.number().int().nonnegative().optional().nullable(),
  price: z.number().int().nonnegative().optional().nullable(),
  maintenance_fee: z.number().int().nonnegative().default(0).optional(),
  maintenance_includes: z.array(z.string()).optional().nullable(),
  area_m2: z.number().nonnegative().default(0),
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
  dong: z.string().optional().nullable(),
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
});

/**
 * 인증 검증 헬퍼 함수
 */
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const password = authHeader?.replace('Bearer ', '');
  // 쿠키 기반 인증도 허용 (admin 세션)
  const adminCookie = request.cookies.get('admin_session')?.value;
  return password === 'wishes2026' || adminCookie === 'wishes2026';
}

/**
 * FormData에서 숫자 파싱 (빈 문자열은 null 반환)
 */
function parseNumber(value: string | null): number | null {
  if (!value || value === '' || value === '0') return value === '0' ? 0 : null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

/**
 * FormData에서 boolean 파싱
 */
function parseBool(value: string | null): boolean {
  return value === 'true';
}

/**
 * GET /api/admin/listings - 모든 매물 조회 (관리자용)
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

    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('매물 조회 오류:', error);
      return NextResponse.json(
        { success: false, error: '매물 조회에 실패했습니다' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
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
 * POST /api/admin/listings - 매물 생성 (JSON + FormData 모두 지원)
 */
export async function POST(request: NextRequest) {
  try {
    // Content-Type 확인
    const contentType = request.headers.get('content-type') || '';
    let listingData: Record<string, any>;
    let imageFiles: File[] = [];

    if (contentType.includes('multipart/form-data')) {
      // FormData 처리 (매물등록 폼에서 전송)
      const formData = await request.formData();

      // 이미지 파일 추출
      const images = formData.getAll('images');
      imageFiles = images.filter(img => img instanceof File) as File[];

      // features, maintenance_includes JSON 파싱
      let maintenanceIncludes: string[] = [];
      let features: string[] = [];
      try {
        maintenanceIncludes = JSON.parse(formData.get('maintenance_includes') as string || '[]');
      } catch { maintenanceIncludes = []; }
      try {
        features = JSON.parse(formData.get('features') as string || '[]');
      } catch { features = []; }

      listingData = {
        title: formData.get('title') as string || '',
        type: formData.get('type') as string || '',
        deal: formData.get('deal') as string || '',
        deposit: parseNumber(formData.get('deposit') as string) ?? 0,
        monthly: parseNumber(formData.get('monthly') as string),
        price: parseNumber(formData.get('price') as string),
        maintenance_fee: parseNumber(formData.get('maintenance_fee') as string) ?? 0,
        maintenance_includes: maintenanceIncludes.length > 0 ? maintenanceIncludes : null,
        area_m2: parseNumber(formData.get('area_m2') as string) ?? 0,
        area_supply_m2: parseNumber(formData.get('area_supply_m2') as string),
        rooms: parseNumber(formData.get('rooms') as string),
        bathrooms: parseNumber(formData.get('bathrooms') as string),
        floor_current: formData.get('floor_current') as string || '',
        floor_total: formData.get('floor_total') as string || null,
        direction: formData.get('direction') as string || null,
        heating_type: formData.get('heating_type') as string || null,
        address: formData.get('address') as string || '',
        address_detail: formData.get('address_detail') as string || null,
        dong: formData.get('dong') as string || '',
        description: formData.get('description') as string || null,
        available_date: formData.get('available_date') as string || null,
        built_year: formData.get('built_year') as string || null,
        parking: parseBool(formData.get('parking') as string),
        elevator: parseBool(formData.get('elevator') as string),
        pet: parseBool(formData.get('pet') as string),
        balcony: parseBool(formData.get('balcony') as string),
        full_option: parseBool(formData.get('full_option') as string),
        loan_available: parseBool(formData.get('loan_available') as string),
      };
    } else {
      // JSON 처리 (기존 API 호환)
      const rawData = await request.json();
      // Map frontend field names to API field names
      listingData = {
        title: rawData.title || '',
        type: rawData.type || rawData.propertyType || '',
        deal: rawData.deal || rawData.transactionType || '',
        deposit: Number(rawData.deposit) || 0,
        monthly: rawData.monthly || rawData.monthlyRent || null,
        price: rawData.price || null,
        maintenance_fee: Number(rawData.maintenance_fee) || 0,
        maintenance_includes: rawData.maintenance_includes || rawData.features || null,
        area_m2: Number(rawData.area_m2 || rawData.area) || 0,
        floor_current: rawData.floor_current || rawData.floor || null,
        floor_total: rawData.floor_total || rawData.totalFloors || null,
        rooms: rawData.rooms ? Number(rawData.rooms) : null,
        bathrooms: rawData.bathrooms ? Number(rawData.bathrooms) : null,
        direction: rawData.direction || null,
        address: rawData.address || '',
        address_detail: rawData.address_detail || rawData.addressDetail || null,
        dong: rawData.dong || null,
        description: rawData.description || null,
        available_date: rawData.available_date || rawData.moveInDate || null,
        built_year: rawData.built_year || rawData.approvalDate || null,
        parking: rawData.parking || false,
        elevator: rawData.elevator || false,
        pet: rawData.pet || false,
        balcony: rawData.balcony || false,
        full_option: rawData.full_option || false,
        loan_available: rawData.loan_available !== undefined ? rawData.loan_available : true,
        status: rawData.status || '\uAC00\uC6A9',
        heating_type: rawData.heating_type || null,
        lat: rawData.lat || null,
        lng: rawData.lng || null,
        area_supply_m2: rawData.area_supply_m2 ? Number(rawData.area_supply_m2) : null,
        area_land_m2: rawData.area_land_m2 ? Number(rawData.area_land_m2) : null,
      };
    }

    const parsed = createListingSchema.safeParse(listingData);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors.map(function(e) { return (e.path.join('.') || '알수없음') + ': ' + e.message; }).join(', '), message: parsed.error.errors.map(function(e) { return (e.path.join('.') || '알수없음') + ': ' + e.message; }).join(', ') },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('listings')
      .insert({
        title: parsed.data.title,
        type: parsed.data.type,
        deal: parsed.data.deal,
        deposit: parsed.data.deposit,
        monthly: parsed.data.monthly || null,
        price: parsed.data.price || null,
        maintenance_fee: parsed.data.maintenance_fee || 0,
        maintenance_includes: parsed.data.maintenance_includes || null,
        area_m2: parsed.data.area_m2,
        area_supply_m2: parsed.data.area_supply_m2 || null,
        area_land_m2: parsed.data.area_land_m2 || null,
        floor_current: parsed.data.floor_current,
        floor_total: parsed.data.floor_total || null,
        rooms: parsed.data.rooms || null,
        bathrooms: parsed.data.bathrooms || null,
        direction: parsed.data.direction || null,
        heating_type: parsed.data.heating_type || null,
        address: parsed.data.address,
        address_detail: parsed.data.address_detail || null,
        dong: parsed.data.dong,
        lat: parsed.data.lat || null,
        lng: parsed.data.lng || null,
        description: parsed.data.description || null,
        available_date: parsed.data.available_date || null,
        built_year: parsed.data.built_year || null,
        parking: parsed.data.parking || false,
        elevator: parsed.data.elevator || false,
        pet: parsed.data.pet || false,
        balcony: parsed.data.balcony || false,
        full_option: parsed.data.full_option || false,
        loan_available: parsed.data.loan_available ?? true,
        status: parsed.data.status || '가용',
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

    // 이미지 파일이 있으면 Supabase Storage에 업로드
    if (imageFiles.length > 0 && data?.id) {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const ext = file.name.split('.').pop() || 'jpg';
        const filePath = `listings/${data.id}/${i + 1}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('listing-images')
          .upload(filePath, file, { upsert: true });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('listing-images')
            .getPublicUrl(filePath);
          uploadedUrls.push(urlData.publicUrl);
        }
      }

      // 이미지 URL을 listings 테이블에 업데이트
      if (uploadedUrls.length > 0) {
        await supabase
          .from('listings')
          .update({ images: uploadedUrls })
          .eq('id', data.id);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('매물 생성 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 생성에 실패했습니다' },
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
    const { id, ...updateData } = body;

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
      if (value !== undefined) {
        updateValues[key] = value;
      }
    });

    if (Object.keys(updateValues).length === 0) {
      return NextResponse.json(
        { success: false, error: '수정할 필드가 없습니다' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('listings')
      .update(updateValues)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('매물 수정 오류:', error);
      return NextResponse.json(
        { success: false, error: '매물 수정에 실패했습니다' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: '매물을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('매물 수정 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 수정에 실패했습니다' },
      { status: 500 }
    );
  }
}
