import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { listings } from '@/db/schema';
import { z } from 'zod';

// 요청 검증 스키마
const createListingSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  type: z.enum(['원룷', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실']),
  deal: z.enum(['전세', '월세', '맠매']),
  deposit: z.number().int().nonnegative().default(0),
  monthly: z.number().int().nonnegative().optional().nullable(),
  price: z.number().int().nonnegative().optional().nullable(),
  area: z.number().positive(),
  floor: z.string().min(1),
  address: z.string().min(1),
  dong: z.string().min(1),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  description: z.string().optional(),
  available: z.boolean().default(true),
  availableDate: z.string().optional(),
  built: z.string().optional(),
  parking: z.boolean().default(false),
  elevator: z.boolean().default(false),
  pet: z.boolean().default(false),
  status: z.enum(['가용', '계약중', '계약완료']).default('가용'),
});

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const password = authHeader?.replace('Bearer ', '');
  return password === 'wishes2026';
}

// GET /api/admin/listings - 모든 매물 조회
export async function GET(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const allListings = await db.select().from(listings);
    return NextResponse.json({
      success: true,
      data: allListings,
    });
  } catch (error) {
    console.error('매물 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}

// POST /api/admin/listings - 매물 생성
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

    const data = parsed.data;
    const [result] = await db
      .insert(listings)
      .values({
        title: data.title,
        type: data.type,
        deal: data.deal,
        deposit: data.deposit,
        monthly: data.monthly || null,
        price: data.price || null,
        area: data.area,
        floor: data.floor,
        address: data.address,
        dong: data.dong,
        lat: data.lat || null,
        lng: data.lng || null,
        description: data.description || null,
        available: data.available,
        availableDate: data.availableDate || null,
        built: data.built || null,
        parking: data.parking,
        elevator: data.elevator,
        pet: data.pet,
        status: data.status,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: result,
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

// PUT /api/admin/listings - 매물 수정
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

    // 업데이트할 필드만 준비
    const updateValues: any = {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    };

    // null 값 제거
    Object.keys(updateValues).forEach(
      (key) => updateValues[key] === undefined && delete updateValues[key]
    );

    const [result] = await db
      .update(listings)
      .set(updateValues)
      .where(new (require('drizzle-orm')).eq(listings.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('매물 수정 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 수정에 실패했습니다' },
      { status: 500 }
    );
  }
}
