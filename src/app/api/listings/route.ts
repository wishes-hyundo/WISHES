import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { listings, listingImages, listingFeatures } from '@/db/schema';
import { eq, desc, and, gte, lte } from 'drizzle-orm';

// GET /api/listings - 매물 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const deal = searchParams.get('deal');
    const type = searchParams.get('type');
    const dong = searchParams.get('dong');
    const minDeposit = searchParams.get('minDeposit');
    const maxDeposit = searchParams.get('maxDeposit');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // 필터 조건
    const conditions = [eq(listings.status, '가용')];
    if (deal) conditions.push(eq(listings.deal, deal as any));
    if (type) conditions.push(eq(listings.type, type as any));
    if (dong) conditions.push(eq(listings.dong, dong));
    if (minDeposit) conditions.push(gte(listings.deposit, parseInt(minDeposit)));
    if (maxDeposit) conditions.push(lte(listings.deposit, parseInt(maxDeposit)));

    const results = await db
      .select()
      .from(listings)
      .where(and(...conditions))
      .orderBy(desc(listings.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      success: true,
      data: results,
      total: results.length,
    });
  } catch (error) {
    console.error('매물 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}
