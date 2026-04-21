// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/[id]/nearby - 주변 교통 정보 (카카오 Local API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

// 지하철역 카테고리 코드
const SUBWAY_CATEGORY = 'SW8';

interface NearbyStation {
  name: string;
  line: string;
  distance: number; // meters
  walkMin: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID입니다' },
        { status: 400 }
      );
    }

    // 매물의 좌표 조회
    const supabase = createClient();
    const { data: listing, error } = await supabase
      .from('listings')
      .select('lat, lng, address')
      .eq('id', listingId)
      .single();

    if (error || !listing) {
      return NextResponse.json(
        { success: false, error: '매물을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    if (!listing.lat || !listing.lng) {
      return NextResponse.json({
        success: true,
        data: { stations: [], message: '좌표 정보가 없어 주변 교통 정보를 조회할 수 없습니다.' }
      });
    }

    if (!KAKAO_REST_API_KEY || KAKAO_REST_API_KEY === '여기에_카카오_REST_API_키_입력') {
      return NextResponse.json({
        success: true,
        data: { stations: [], message: '카카오 API 키가 설정되지 않았습니다.' }
      });
    }

    // 카카오 Local API - 카테고리 검색 (지하철역)
    const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${SUBWAY_CATEGORY}&x=${listing.lng}&y=${listing.lat}&radius=2000&sort=distance&size=5`;

    const kakaoRes = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
      },
    });

    if (!kakaoRes.ok) {
      console.error('Kakao API error:', kakaoRes.status, await kakaoRes.text());
      return NextResponse.json({
        success: true,
        data: { stations: [], message: '교통 정보 조회 중 오류가 발생했습니다.' }
      });
    }

    const kakaoData = await kakaoRes.json();

    // 결과 파싱
    const stations: NearbyStation[] = (kakaoData.documents || []).map((doc: any) => {
      const distance = parseInt(doc.distance) || 0;
      const walkMin = Math.round(distance / 67); // 평균 보행속도 ~4km/h = 67m/min

      // 역 이름에서 호선 추출 (예: "신림역 2호선" → line: "2", name: "신림")
      let name = doc.place_name || '';
      let line = '';

      // "OO역 N호선" 패턴
      const lineMatch = name.match(/(\d+)호선/);
      if (lineMatch) {
        line = lineMatch[1];
        name = name.replace(/\s*\d+호선/, '').replace(/역$/, '');
      } else {
        // 호선 정보 없으면 카테고리에서 추출 시도
        const catLine = (doc.category_name || '').match(/(\d+)호선/);
        if (catLine) {
          line = catLine[1];
        }
        name = name.replace(/역$/, '');
      }

      return {
        name,
        line: line || '●',
        distance,
        walkMin: Math.max(1, walkMin), // 최소 1분
      };
    });

    // 같은 역 중복 제거 (가장 가까운 것만)
    const uniqueStations: NearbyStation[] = [];
    const seen = new Set<string>();
    for (const station of stations) {
      const key = station.name;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueStations.push(station);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        stations: uniqueStations.slice(0, 3),
        searchRadius: 2000,
      }
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800', // 24h cache
      }
    });

  } catch (err) {
    console.error('Nearby stations error:', err);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
