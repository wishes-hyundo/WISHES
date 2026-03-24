import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { listings, contacts } from '@/db/schema';
import { count, eq } from 'drizzle-orm';

// GET /api/admin/stats - 관리자 대시보드 통계
export async function GET(request: NextRequest) {
  try {
    // 암호 검증
    const authHeader = request.headers.get('authorization');
    const password = authHeader?.replace('Bearer ', '');
    if (password !== 'wishes2026') {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    // 전체 매물 수
    const totalListings = await db.select({ value: count() }).from(listings);

    // 상태별 매물 수
    const activeListings = await db
      .select({ value: count() })
      .from(listings)
      .where(eq(listings.status, '가용'));

    const contractingListings = await db
      .select({ value: count() })
      .from(listings)
      .where(eq(listings.status, '계약중'));

    const completedListings = await db
      .select({ value: count() })
      .from(listings)
      .where(eq(listings.status, '계약완료'));

    // 미처리 상담 수
    const pendingContacts = await db
      .select({ value: count() })
      .from(contacts)
      .where(eq(contacts.status, '접수'));

    return NextResponse.json({
      success: true,
      data: {
        totalListings: totalListings[0]?.value || 0,
        activeListings: activeListings[0]?.value || 0,
        contractingListings: contractingListings[0]?.value || 0,
        completedListings: completedListings[0]?.value || 0,
        pendingContacts: pendingContacts[0]?.value || 0,
      },
    });
  } catch (error) {
    console.error('통계 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '통계 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}
