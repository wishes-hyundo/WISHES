// ────────────────────────────────────────
// POST /api/admin/geocode-listings - 좌표 없는 매물 일괄 지오코딩
// ────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

interface GeoResult {
  id: number;
  address: string;
  lat: number | null;
  lng: number | null;
  status: 'success' | 'failed' | 'no_address';
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || !KAKAO_REST_API_KEY) return null;

  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (data.documents && data.documents.length > 0) {
      const doc = data.documents[0];
      return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // 좌표가 없는 매물 조회 (address 컬럼만 사용)
    const { data: listings, error: fetchError } = await supabase
      .from('listings')
      .select('id, address, lat, lng')
      .or('lat.is.null,lng.is.null')
      .order('id', { ascending: false });

    if (fetchError) {
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
    }

    if (!listings || listings.length === 0) {
      return NextResponse.json({ success: true, message: '좌표가 없는 매물이 없습니다', updated: 0 });
    }

    const results: GeoResult[] = [];

    for (const listing of listings) {
      const address = listing.address;

      if (!address) {
        results.push({ id: listing.id, address: '', lat: null, lng: null, status: 'no_address' });
        continue;
      }

      const coords = await geocodeAddress(address);

      if (coords) {
        const { error: updateError } = await supabase
          .from('listings')
          .update({ lat: coords.lat, lng: coords.lng })
          .eq('id', listing.id);

        results.push({
          id: listing.id,
          address,
          lat: coords.lat,
          lng: coords.lng,
          status: updateError ? 'failed' : 'success',
        });
      } else {
        results.push({ id: listing.id, address, lat: null, lng: null, status: 'failed' });
      }

      // API 레이트 리밋 방지 (100ms 딜레이)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successCount = results.filter(r => r.status === 'success').length;

    return NextResponse.json({
      success: true,
      message: `${listings.length}개 매물 중 ${successCount}개 좌표 업데이트 완료`,
      total: listings.length,
      updated: successCount,
      results,
    });
  } catch (error) {
    console.error('지오코딩 오류:', error);
    return NextResponse.json({ success: false, error: '지오코딩에 실패했습니다' }, { status: 500 });
  }
}
