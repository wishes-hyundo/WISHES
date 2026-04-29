// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/[id]/nearby - 주변 교통 정보 (카카오 Local API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

// 지하철역 카테고리 코드
const SUBWAY_CATEGORY = 'SW8';
// 버스정류장 카테고리 코드 (Kakao Local)
const BUS_CATEGORY = 'BS3';

interface NearbyStation {
  name: string;
  line: string;
  distance: number; // meters
  walkMin: number;
}

interface NearbyBus {
  name: string;
  distance: number;
  walkMin: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // L-sec78 (2026-04-22): Kakao Local API 할당량 보호
    //   24h CDN 캐시 있으나 listing id 순회하면 cold cache 마다
    //   Kakao 호출 도달. 5분 30회/IP cap.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `nearby:ip:${_ip}`, limit: 30, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: '요청이 너무 많습니다.' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

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
    // L-sec91 (2026-04-22): IDOR 차단 — 비공개 매물 좌표/주소 누출 방지.
    const { data: listing, error } = await supabase
      .from('listings')
      .select('lat, lng, address')
      .eq('id', listingId)
      .eq('status', '공개')
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

    // L-modal-transit (2026-04-29): 지하철 + 버스정류장 동시 조회.
    //   사장님 명령: "주변 교통에 카카오맵 기반으로 정확한 수치여야되고 미터가 빠져있어"
    //   - 지하철: SW8, 반경 1500m (도보 ~20분)
    //   - 버스정류장: BS3, 반경 800m (도보 ~12분, 그 이상은 무의미)
    const buildUrl = (cat: string, radius: number) =>
      `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${cat}` +
      `&x=${listing.lng}&y=${listing.lat}&radius=${radius}&sort=distance&size=15`;
    const fetchKakao = async (cat: string, radius: number) => {
      try {
        const r = await fetch(buildUrl(cat, radius), {
          headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
          signal: AbortSignal.timeout(6000),
        });
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    };
    const [subwayJson, busJson] = await Promise.all([
      fetchKakao(SUBWAY_CATEGORY, 1500),
      fetchKakao(BUS_CATEGORY, 800),
    ]);

    // 결과 파싱
    const stations: NearbyStation[] = ((subwayJson?.documents) || []).map((doc: any) => {
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

    // 버스정류장 파싱
    const buses: NearbyBus[] = ((busJson?.documents) || []).map((doc: any) => {
      const distance = parseInt(doc.distance) || 0;
      const walkMin = Math.max(1, Math.round(distance / 67));
      const name = String(doc.place_name || '').trim();
      return { name, distance, walkMin };
    });
    const uniqueBuses: NearbyBus[] = [];
    const seenBus = new Set<string>();
    for (const b of buses) {
      if (!b.name) continue;
      if (!seenBus.has(b.name)) {
        seenBus.add(b.name);
        uniqueBuses.push(b);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        stations: uniqueStations.slice(0, 3),
        buses: uniqueBuses.slice(0, 3),
        searchRadius: { subway: 1500, bus: 800 },
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
