// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI 매물 매칭 파서 (T5-1)
//   자연어 질의 → 구조화된 필터 객체
//   - 서버/클라이언트 양쪽에서 재사용 가능
//   - 외부 API 호출 없이 결정적 규칙으로 동작 (비용 0, 응답 즉시)
//   - 한국 부동산 도메인 특화 (원룸/월세/강남구/5000만원/전용 20평 등)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ParsedMatchFilter {
  deal?: '전세' | '월세' | '매매';
  type?: '원룸' | '투룸' | '쓰리룸' | '오피스텔' | '아파트' | '상가' | '사무실';
  gu?: string;            // 구/시 단위 (예: "강남구", "관악구")  G-68
  dong?: string;          // 동 단위 (예: "신림동", "양재동")
  maxDeposit?: number;    // 만원
  minDeposit?: number;    // 만원
  maxMonthly?: number;    // 만원
  minArea?: number;       // m² (평 입력 시 환산)
  maxArea?: number;       // m²
  rooms?: number;
  parking?: boolean;
  elevator?: boolean;
  pet?: boolean;
  businessType?: string;  // 상가 전용 (카페/음식점/학원 …)
  /** 사람 친화 설명 — "강남구 원룸, 보증금 5,000만원 이하" 같은 재구성 문자열 */
  summary: string;
  /** 파서가 인식하지 못한 잔여 텍스트 */
  residue: string;
}

// ── 상수 ──
const DEALS = ['전세', '월세', '매매'] as const;
const TYPES = ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'] as const;
const BUSINESS_TYPES = ['카페', '음식점', '편의점', '학원', '헬스장', '미용실', '병원', '약국', '사무실', '사무소'];

// 평 → m²  (1평 = 3.3058 m²)
const PYEONG_TO_M2 = 3.3058;

// 한국어 숫자어 → 숫자 (간단 버전)
function koreanNumberToInt(token: string): number | null {
  // "일", "이", ... 아님 — 아라비아 숫자 위주만 처리
  const match = token.match(/^(\d+(?:\.\d+)?)\s*(천|만|억)?$/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  const unit = match[2];
  if (unit === '억') return val * 10000; // 억 → 만원
  if (unit === '천') return val * 1000;  // 천만원 → 만원 단위로 환산은 문맥 필요 — 여기선 "천" 단독 거의 없음
  if (unit === '만') return val;
  return val;
}

// 가격 토큰 파싱:  "보증금 5000만원", "월세 50만원", "전세 2억", "1.5억" 등
function parsePrice(text: string): { maxDeposit?: number; minDeposit?: number; maxMonthly?: number } {
  const out: { maxDeposit?: number; minDeposit?: number; maxMonthly?: number } = {};

  // "월세 50", "월세 50만원", "월세 50 이하"
  const monthlyMatch = text.match(/월세\s*(\d+(?:\.\d+)?)\s*(만원|만)?/);
  if (monthlyMatch) {
    out.maxMonthly = parseFloat(monthlyMatch[1]);
  }

  // "보증금 5000만원 이하", "보증금 5000 이하", "보증금 5000"
  const depositMatch = text.match(/보증금\s*(\d+(?:\.\d+)?)\s*(억|만원|만)?\s*(이하|이상|까지|부터)?/);
  if (depositMatch) {
    let val = parseFloat(depositMatch[1]);
    if (depositMatch[2] === '억') val *= 10000;
    const bound = depositMatch[3];
    if (bound === '이상' || bound === '부터') out.minDeposit = val;
    else out.maxDeposit = val; // 기본은 이하
  }

  // 전세/매매 단독 숫자: "전세 2억", "매매 5억"
  const jeonseMatch = text.match(/전세\s*(\d+(?:\.\d+)?)\s*(억|만원|만)?/);
  if (jeonseMatch && !out.maxDeposit) {
    let val = parseFloat(jeonseMatch[1]);
    if (jeonseMatch[2] === '억') val *= 10000;
    out.maxDeposit = val;
  }

  // "5000만원 이하" (단독)
  if (!out.maxDeposit && !out.maxMonthly) {
    const solo = text.match(/(\d+(?:\.\d+)?)\s*(억|만원)\s*(이하|까지)/);
    if (solo) {
      let val = parseFloat(solo[1]);
      if (solo[2] === '억') val *= 10000;
      out.maxDeposit = val;
    }
  }

  return out;
}

// 면적 파싱: "20평 이상", "전용 30제곱", "60m² 이하"
function parseArea(text: string): { minArea?: number; maxArea?: number } {
  const out: { minArea?: number; maxArea?: number } = {};

  // "20평", "전용 20평 이상"
  const pyeongMatch = text.match(/(\d+(?:\.\d+)?)\s*평\s*(이상|이하|부터|까지)?/);
  if (pyeongMatch) {
    const m2 = Math.round(parseFloat(pyeongMatch[1]) * PYEONG_TO_M2);
    const bound = pyeongMatch[2];
    if (bound === '이하' || bound === '까지') out.maxArea = m2;
    else out.minArea = m2; // 기본은 이상
  }

  // "20m² 이상", "30 제곱 이하"
  const m2Match = text.match(/(\d+(?:\.\d+)?)\s*(?:m²|㎡|제곱|제곱미터)\s*(이상|이하|부터|까지)?/);
  if (m2Match) {
    const m2 = parseFloat(m2Match[1]);
    const bound = m2Match[2];
    if (bound === '이하' || bound === '까지') out.maxArea = m2;
    else if (bound === '이상' || bound === '부터') out.minArea = m2;
    else out.minArea = m2;
  }

  return out;
}

// 방 수 파싱: "방 2개", "3룸"
function parseRooms(text: string): number | undefined {
  const match = text.match(/(\d+)\s*(?:개?의\s*)?(?:방|룸)/);
  if (match) return parseInt(match[1], 10);
  return undefined;
}

// 지역명 추출: 단어 중 "구"/"동"/"시"로 끝나는 토큰
// G-68 (2026-05-03): 구/동 분리 반환 (DB 가 gu/dong 분리 컬럼이라 매칭 정확도 위해).
function parseLocation(text: string): { gu?: string; dong?: string } {
  const out: { gu?: string; dong?: string } = {};
  const guMatch = text.match(/([가-힣]{2,4}구)\b/);
  if (guMatch) out.gu = guMatch[1];
  const dongMatch = text.match(/([가-힣]{2,5}동)\b/);
  if (dongMatch) out.dong = dongMatch[1];
  // 시 단위는 한국 부동산 검색에서 드문 사용 — 무시
  return out;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 파서
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function parseMatchQuery(raw: string): ParsedMatchFilter {
  const text = raw.trim();
  const result: ParsedMatchFilter = { summary: '', residue: text };
  if (!text) return result;

  // 거래 유형
  for (const d of DEALS) {
    if (text.includes(d)) { result.deal = d; break; }
  }

  // 매물 유형
  for (const t of TYPES) {
    if (text.includes(t)) { result.type = t; break; }
  }

  // 지역 (G-68: 구/동 분리)
  const loc = parseLocation(text);
  if (loc.gu) result.gu = loc.gu;
  if (loc.dong) result.dong = loc.dong;

  // 가격
  Object.assign(result, parsePrice(text));

  // 면적
  Object.assign(result, parseArea(text));

  // 방 수
  const rooms = parseRooms(text);
  if (rooms) result.rooms = rooms;

  // 불리언 옵션
  if (/주차\s*(가능|있|포함)?/.test(text)) result.parking = true;
  if (/엘리베이터/.test(text)) result.elevator = true;
  if (/(반려|애완|펫|강아지|고양이)/.test(text)) result.pet = true;

  // 상가 업종
  for (const b of BUSINESS_TYPES) {
    if (text.includes(b) && result.type === '상가') {
      result.businessType = b;
      break;
    }
  }

  // 사람 친화 요약 생성
  const parts: string[] = [];
  if (result.gu) parts.push(result.gu);
  if (result.dong) parts.push(result.dong);
  if (result.type) parts.push(result.type);
  if (result.deal) parts.push(result.deal);
  if (result.maxDeposit) parts.push(`보증금 ${result.maxDeposit.toLocaleString()}만원 이하`);
  if (result.maxMonthly) parts.push(`월세 ${result.maxMonthly}만원 이하`);
  if (result.minArea) parts.push(`면적 ${result.minArea}m² 이상`);
  if (result.rooms) parts.push(`${result.rooms}룸`);
  if (result.parking) parts.push('주차');
  if (result.elevator) parts.push('엘리베이터');
  if (result.pet) parts.push('반려동물');
  result.summary = parts.join(' · ') || '조건 미인식';

  // 잔여 텍스트 계산 — 단순히 인식된 토큰 제거
  let residue = text;
  [
    result.deal, result.type, result.gu, result.dong,
    result.maxDeposit && String(result.maxDeposit),
    result.maxMonthly && String(result.maxMonthly),
    '보증금', '월세', '전세', '매매', '이하', '이상',
    '평', 'm²', '㎡', '제곱', '미터', '주차', '엘리베이터', '반려', '애완', '펫',
  ].filter(Boolean).forEach((w) => {
    if (w) residue = residue.split(w as string).join(' ');
  });
  result.residue = residue.trim().replace(/\s+/g, ' ');

  return result;
}
