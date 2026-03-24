import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { contacts, listings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const password = authHeader?.replace('Bearer ', '');
  return password === 'wishes2026';
}

// GET /api/admin/contacts - 모든 상담 조회
export async function GET(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const allContacts = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        phone: contacts.phone,
        email: contacts.email,
        message: contacts.message,
        listingId: contacts.listingId,
        listingTitle: listings.title,
        status: contacts.status,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .leftJoin(listings, eq(contacts.listingId, listings.id));

    return NextResponse.json({
      success: true,
      data: allContacts,
    });
  } catch (error) {
    console.error('상담 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '상담 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/contacts - 상담 상태 변경
export async function PATCH(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const updateSchema = z.object({
      id: z.number().int().positive(),
      status: z.enum(['접수', '처리중', '완료']),
    });

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const [result] = await db
      .update(contacts)
      .set({
        status: parsed.data.status,
      })
      .where(eq(contacts.id, parsed.data.id))
      .returning();

    if (!result) {
      return NextResponse.json(
        { success: false, error: '상담을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('상담 상태 변경 오류:', error);
    return NextResponse.json(
      { success: false, error: '상태 변경에 실패했습니다' },
      { status: 500 }
    );
  }
}
