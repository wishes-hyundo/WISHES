import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { listings } from '@/db/schema';
import { and, gte, lte, eq, ne } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const swLat = parseFloat(searchParams.get('swLat') || '0');
    const swLng = parseFloat(searchParams.get('swLng') || '0');
    const neLat = parseFloat(searchParams.get('neLat') || '0');
    const neLng = parseFloat(searchParams.get('neLng') || '0');
    if (!swLat || !swLng || !neLat || !neLng) {
      return NextResponse.json({ success: false, error: 'bounds 파라미터가 필요합니다' }, { status: 400 });
    }
    const deal = searchParams.get('deal');
    const type = searchParams.get('type');
    const minDeposit = searchParams.get('minDeposit');
    const maxDeposit = searchParams.get('maxDeposit');
    const conditions = [
      ne(listings.status, '계약완료'),
      gte(listings.lat, swLat), lte(listings.lat, neLat),
      gte(listings.lng, swLng), lte(listings.lng, neLng),
    ];
    if (deal) conditions.push(eq(listings.deal, deal as any));
    if (type) conditions.push(eq(listings.type, type as any));
    if (minDeposit) conditions.push(gte(listings.deposit, parseInt(minDeposit)));
    if (maxDeposit) conditions.push(lte(listings.deposit, parseInt(maxDeposit)));
    const results = await db.select().from(listings).where(and(...conditions)).limit(100);
    return NextResponse.json({ success: true, data: results, total: results.length });
  } catch (error) {
    console.error('지도 매물 조회 오류:', error);
    return NextResponse.json({ success: false, error: '매물 조회에 실패했습니다' }, { status: 500 });
  }
}
