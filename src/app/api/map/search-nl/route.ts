// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/map/search-nl — 자연어 → 필터 + 지도 이동 중심
//
// Phase 1.0: 규칙 기반 파서 (한국어 휴리스틱) + 간단한 지역 사전
// Phase 1.1: Claude API 연동 + nl_query_cache 테이블 캐싱
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { DealType, FilterState } from '@/features/map-2026/store';

const BodySchema = z.object({ query: z.string().min(1).max(200) });

// 서울 주요 지역 사전 (Phase 1.1 에서 DB 로 이전)
const LOCATIONS: Record<string, { center: [number, number]; zoom: number }> = {
  '강남역': { center: [127.0276, 37.4979], zoom: 14 },
  '강남': { center: [127.0276, 37.4979], zoom: 13 },
  '서초': { center: [127.0167, 37.4837], zoom: 13.5 },
  '신림': { center: [126.9293, 37.4842], zoom: 13.5 },
  '여의도': { center: [126.9244, 37.5219], zoom: 13.5 },
  '성수': { center: [127.0559, 37.5447], zoom: 13.5 },
  '성수동': { center: [127.0559, 37.5447], zoom: 13.5 },
  '홍대': { center: [126.9227, 37.5563], zoom: 13.5 },
  '합정': { center: [126.9145, 37.5494], zoom: 13.5 },
  '잠실': { center: [127.0986, 37.5145], zoom: 13.5 },
  '송파': { center: [127.1058, 37.5145], zoom: 13 },
  '마포': { center: [126.9316, 37.5665], zoom: 13 },
  '공덕': { center: [126.9516, 37.5449], zoom: 13.5 },
  '종로': { center: [126.9784, 37.5729], zoom: 13 },
  '이태원': { center: [126.9947, 37.5347], zoom: 13.5 },
  '용산': { center: [126.9654, 37.5326], zoom: 13 },
  '판교': { center: [127.1112, 37.4019], zoom: 13.5 },
  '분당': { center: [127.1226, 37.3806], zoom: 12.5 },
};

function parseKRW(s: string): number | null {
  // "5억", "500", "1.5억", "5000만원" 형식을 만원 단위로 변환
  const m = s.match(/(\d+(?:\.\d+)?)\s*(억|만)?/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = m[2];
  if (unit === '억') return Math.round(num * 10000);
  return Math.round(num); // 기본 만원
}

function parseQuery(q: string): { filter: Partial<FilterState>; center: [number, number] | null; zoom: number | null } {
  const filter: Partial<FilterState> = {};
  let center: [number, number] | null = null;
  let zoom: number | null = null;

  // 거래유형
  const deals: DealType[] = [];
  if (/매매/.test(q)) deals.push('매매');
  if (/전세/.test(q)) deals.push('전세');
  if (/월세/.test(q)) deals.push('월세');
  if (/단기|일세/.test(q)) deals.push('단기');
  if (deals.length) filter.deals = deals;

  // 지역
  for (const [name, info] of Object.entries(LOCATIONS)) {
    if (q.includes(name)) {
      center = info.center;
      zoom = info.zoom;
      break;
    }
  }

  // 방 개수
  const rooms: number[] = [];
  if (/원룸/.test(q)) rooms.push(1);
  if (/투룸|2룸/.test(q)) rooms.push(2);
  if (/쓰리룸|3룸|쓰리/.test(q)) rooms.push(3);
  if (rooms.length) filter.rooms = rooms;

  // 유형
  const types: string[] = [];
  if (/오피스텔/.test(q)) types.push('오피스텔');
  if (/아파트/.test(q)) types.push('아파트');
  if (/빌라/.test(q)) types.push('빌라');
  if (/주택/.test(q)) types.push('주택');
  if (/상가/.test(q)) types.push('상가');
  if (/사무실|오피스(?!텔)/.test(q)) types.push('사무실');
  if (types.length) filter.propertyTypes = types;

  // 역세권 / 도보
  const walk = q.match(/도보\s*(\d+)\s*분/);
  if (walk) {
    const min = parseInt(walk[1], 10);
    filter.nearStation = min * 60;
  } else if (/역세권/.test(q)) {
    filter.nearStation = 300; // 5분
  }

  // 신축
  const nb = q.match(/(\d+)\s*년\s*이내/);
  if (nb) filter.newBuildYears = parseInt(nb[1], 10);
  else if (/신축/.test(q)) filter.newBuildYears = 3;

  // 반려동물/주차 등 feature
  const features: string[] = [];
  if (/반려동물|펫|애견|강아지|고양이/.test(q)) features.push('반려동물');
  if (/주차/.test(q)) features.push('주차');
  if (/엘리베이터/.test(q)) features.push('엘리베이터');
  if (features.length) filter.features = features;

  // 가격 — "이하" 키워드 감지
  const priceMatch = q.match(/([\d.]+)\s*(억|만)\s*(?:이하|미만|under)?/);
  const below = /이하|미만|under/.test(q);
  if (priceMatch && below) {
    const val = parseKRW(priceMatch[0]);
    if (val != null) {
      if (deals.includes('매매')) filter.maxPrice = val;
      else if (deals.includes('전세')) filter.maxDeposit = val;
      else if (deals.includes('월세') || deals.includes('단기')) {
        // 월세 맥락에서 "100 이하" 는 월세 100만원
        if (priceMatch[2] !== '억') filter.maxMonthly = val;
        else filter.maxDeposit = val;
      }
    }
  }

  return { filter, center, zoom };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const result = parseQuery(parsed.data.query);

  return NextResponse.json(
    { ...result, query: parsed.data.query },
    { headers: { 'Cache-Control': 'public, max-age=600' } }
  );
}
