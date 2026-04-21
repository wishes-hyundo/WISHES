// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/map/search-nl — 자연어 → 필터 + 지도 이동 중심
//
// Phase 1.0: 규칙 기반 파서 (한국어 휴리스틱) + 지역 사전
// Phase 1.1: Category-First (residence/retail_office/land/investment) + purposes 추론
// Phase 1.2 [TODO]: Claude API fallback + nl_query_cache 테이블 캐싱
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type {
  DealType,
  FilterState,
  PropertyCategory,
  CommercialPurpose,
} from '@/features/map-2026/store';

const BodySchema = z.object({ query: z.string().min(1).max(200) });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 지역 사전 (수도권·광역시 주요 거점)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const LOCATIONS: Record<string, { center: [number, number]; zoom: number }> = {
  // 서울
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
  '건대': { center: [127.0703, 37.5402], zoom: 13.5 },
  '서울대입구': { center: [126.9524, 37.4813], zoom: 13.5 },
  '구로': { center: [126.8874, 37.4951], zoom: 13 },
  '동대문': { center: [127.0095, 37.5713], zoom: 13.5 },
  '영등포': { center: [126.9067, 37.5259], zoom: 13 },

  // 수도권
  '판교': { center: [127.1112, 37.4019], zoom: 13.5 },
  '분당': { center: [127.1226, 37.3806], zoom: 12.5 },
  '송도': { center: [126.6656, 37.3826], zoom: 13 },
  '인천': { center: [126.7052, 37.4563], zoom: 12 },
  '일산': { center: [126.7690, 37.6587], zoom: 12.5 },
  '부천': { center: [126.7659, 37.4988], zoom: 12.5 },
  '안양': { center: [126.9561, 37.3943], zoom: 12.5 },
  '수원': { center: [127.0290, 37.2635], zoom: 12.5 },
  '광명': { center: [126.8641, 37.4782], zoom: 13 },
  '하남': { center: [127.2055, 37.5393], zoom: 12.5 },
  '남양주': { center: [127.2165, 37.6363], zoom: 11.5 },

  // 광역시
  '부산': { center: [129.0756, 35.1796], zoom: 11 },
  '해운대': { center: [129.1635, 35.1631], zoom: 13 },
  '서면': { center: [129.0603, 35.1578], zoom: 13 },
  '대구': { center: [128.6014, 35.8714], zoom: 11 },
  '대전': { center: [127.3845, 36.3504], zoom: 11 },
  '광주': { center: [126.8526, 35.1595], zoom: 11 },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 파서
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function parseKRW(s: string): number | null {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(억|만)?/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = m[2];
  if (unit === '억') return Math.round(num * 10000);
  return Math.round(num);
}

/** category 추론: 키워드 힌트 기반 */
function inferCategory(q: string): { category: PropertyCategory; purposes: CommercialPurpose[] } {
  const purposes: CommercialPurpose[] = [];

  // 투자 키워드 (최우선)
  if (/수익률|수익형|공실률|임대수익|월세수익|재건축|재개발|경매/.test(q)) {
    return { category: 'investment', purposes: [] };
  }

  // 토지 키워드
  if (/토지|땅|대지|전답|임야|잡종지|농지/.test(q)) {
    return { category: 'land', purposes: [] };
  }

  // 상가/사무실 세부 용도
  if (/상가|근생/.test(q))                    purposes.push('retail');
  if (/사무실|오피스(?!텔)|사옥/.test(q))       purposes.push('office');
  if (/지식산업|아파트형\s*공장/.test(q))       purposes.push('knowledge_center');
  if (/공유오피스|코워킹/.test(q))             purposes.push('coworking');
  if (/복합|주상복합/.test(q))                 purposes.push('mixed_use');
  if (purposes.length) {
    return { category: 'retail_office', purposes };
  }

  // 상가/사무실 포괄 키워드
  if (/상업용|임대용\s*건물/.test(q)) {
    return { category: 'retail_office', purposes: [] };
  }

  // 기본값: 주거
  return { category: 'residence', purposes: [] };
}

function parseQuery(q: string): {
  filter: Partial<FilterState>;
  center: [number, number] | null;
  zoom: number | null;
} {
  const filter: Partial<FilterState> = {};
  let center: [number, number] | null = null;
  let zoom: number | null = null;

  // 1) 카테고리 + purposes (Category-First)
  const { category, purposes } = inferCategory(q);
  filter.category = category;
  if (purposes.length) filter.purposes = purposes;

  // 2) 거래유형
  const deals: DealType[] = [];
  if (/매매|분양/.test(q)) deals.push('매매');
  if (/전세/.test(q)) deals.push('전세');
  if (/월세/.test(q)) deals.push('월세');
  if (/단기|일세|에어비앤비/.test(q)) deals.push('단기');
  if (deals.length) filter.deals = deals;

  // 3) 지역 (가장 긴 매치 우선 — "강남역" 이 "강남" 보다 우선)
  let bestMatch = '';
  for (const name of Object.keys(LOCATIONS)) {
    if (q.includes(name) && name.length > bestMatch.length) {
      bestMatch = name;
    }
  }
  if (bestMatch) {
    const info = LOCATIONS[bestMatch];
    center = info.center;
    zoom = info.zoom;
  }

  // 4) 방 개수 (주거 전용)
  if (category === 'residence') {
    const rooms: number[] = [];
    if (/원룸|1룸/.test(q)) rooms.push(1);
    if (/투룸|2룸/.test(q)) rooms.push(2);
    if (/쓰리룸|3룸|쓰리/.test(q)) rooms.push(3);
    if (rooms.length) filter.rooms = rooms;
  }

  // 5) 유형
  const types: string[] = [];
  if (/오피스텔/.test(q)) types.push('오피스텔');
  if (/아파트(?!형)/.test(q)) types.push('아파트');
  if (/빌라/.test(q)) types.push('빌라');
  if (/주택/.test(q)) types.push('주택');
  if (/단독/.test(q)) types.push('단독주택');
  if (types.length) filter.propertyTypes = types;

  // 6) 역세권 / 도보
  const walk = q.match(/도보\s*(\d+)\s*분/);
  if (walk) {
    const min = parseInt(walk[1], 10);
    filter.nearStation = min * 60;
  } else if (/역세권|역\s*가까운/.test(q)) {
    filter.nearStation = 300;
  }

  // 7) 신축
  const nb = q.match(/(\d+)\s*년\s*이내/);
  if (nb) filter.newBuildYears = parseInt(nb[1], 10);
  else if (/신축|새\s*건물/.test(q)) filter.newBuildYears = 3;

  // 8) Features (카테고리별 특화)
  const features: string[] = [];
  if (/반려동물|펫|애견|강아지|고양이/.test(q)) features.push('반려동물');
  if (/주차/.test(q)) features.push('주차');
  if (/엘리베이터/.test(q)) features.push('엘리베이터');

  if (category === 'retail_office') {
    if (/1층|일층/.test(q)) features.push('1층');
    if (/코너|모서리/.test(q)) features.push('코너');
    if (/전용률/.test(q)) features.push('전용률↑');
  }
  if (category === 'land') {
    if (/도로\s*(?:접|접함)/.test(q)) features.push('도로접함');
    if (/지목\s*변경/.test(q)) features.push('지목변경');
    if (/개발\s*가능/.test(q)) features.push('개발가능');
  }
  if (category === 'investment') {
    // "수익률 5%+" 태그
    const y = q.match(/수익률\s*(\d+)\s*[%퍼센트]?\s*(?:이상|\+)?/);
    if (y) features.push(`수익률${y[1]}+`);
    if (/공실률\s*낮/.test(q)) features.push('공실률낮음');
    if (/임대차\s*승계/.test(q)) features.push('임대차승계');
    if (/리모델링/.test(q)) features.push('리모델링가능');
  }
  if (features.length) filter.features = features;

  // 9) 사진 필터
  if (/사진\s*있는|이미지\s*있는/.test(q)) filter.hasImages = true;

  // 10) 가격 — "이하" / "미만" / "N~M" 키워드
  const below = /이하|미만|밑/.test(q);
  const priceMatch = q.match(/([\d.]+)\s*(억|만)/);
  if (priceMatch && below) {
    const val = parseKRW(priceMatch[0]);
    if (val != null) {
      if (deals.includes('매매') || category === 'investment') filter.maxPrice = val;
      else if (deals.includes('전세')) filter.maxDeposit = val;
      else if (deals.includes('월세') || deals.includes('단기')) {
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
