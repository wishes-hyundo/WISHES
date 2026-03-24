// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET, POST, PUT /api/admin/listings
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
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
  floor_current: z.string().min(1),
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
 * POST /api/admin/listings - 매물 생성
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
        { success: false, error: parsed.error.errors[0].message },
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
        { success: false, error: '매물 생성에 실패했습니다' },
        { status: 500 }
      );
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

    // 업데이트할 필드 준비 (undefined 제거, 컬럼명 변환)
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
