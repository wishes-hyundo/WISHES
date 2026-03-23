import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { listings, listingImages, listingFeatures } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/listings/[id] - 매물 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);

    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json(
        { success: false, error: '매물을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    const images = await db
      .select()
      .from(listingImages)
      .where(eq(listingImages.listingId, listingId))
      .orderBy(listingImages.order);

    const features = await db
      .select()
      .from(listingFeatures)
      .where(eq(listingFeatures.listingId, listingId));

    return NextResponse.json({
      success: true,
      data: {
        ...listing,
        images,
        features: features.map((f) => f.feature),
      },
    });
  } catch (error) {
    console.error('매물 상세 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}
