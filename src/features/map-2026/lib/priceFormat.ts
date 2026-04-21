// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 한국 부동산 가격 포매팅
// 매매: "8.5억", 전세: "2.3억", 월세: "500/50", 단기: "100/월"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { DealType, MapListing } from '../store';

/** 만원 단위 정수를 "1.2억", "3,500" 같은 한국 표기로 */
export function formatKRW(man: number | null): string {
  if (man == null || Number.isNaN(man)) return '-';
  if (man >= 10000) {
    const eok = man / 10000;
    return `${eok.toFixed(eok < 10 ? 1 : 0).replace(/\.0$/, '')}억`;
  }
  return new Intl.NumberFormat('ko-KR').format(man);
}

/** 핀/카드에 찍히는 대표 가격 라벨 */
export function formatDealLabel(l: Pick<MapListing, 'deal' | 'deposit' | 'monthly' | 'price'>): string {
  switch (l.deal) {
    case '매매':
      return l.price ? formatKRW(l.price) : '-';
    case '전세':
      return l.deposit ? formatKRW(l.deposit) : '-';
    case '월세':
      return `${formatKRW(l.deposit)}/${l.monthly ?? 0}`;
    case '단기':
      return `${l.monthly ?? 0}/월`;
  }
}

/** 비교우위 배지 (저렴 -7% / 비쌈 +12% / 시세 수준)
 *
 * L-ux1 (2026-04-22): 기존엔 "-25%" 만 표시해서 색상 의존도 100% 였음.
 * 색각 이상자(약 8% 남성) 에게 good/bad 구분이 불가능했음.
 * 이제 저렴/비쌈 prefix 로 색 없이도 방향을 읽을 수 있음. */
export function formatDeviation(dev: number | null): { text: string; kind: 'good' | 'bad' | 'neutral' } {
  if (dev == null || Number.isNaN(dev)) return { text: '시세', kind: 'neutral' };
  const pct = Math.round(dev * 100);
  if (pct <= -5) return { text: `저렴 ${pct}%`, kind: 'good' };
  if (pct >= 5) return { text: `비쌈 +${pct}%`, kind: 'bad' };
  return { text: '시세 수준', kind: 'neutral' };
}

/** 면적 표기 (m² + 평) — L-mapfix1 (2026-04-21): 0 값도 '면적 정보 없음'으로 처리
 *    크롤러 수집분 중 상당수가 supply_area / exclusive_area 필드가 비어
 *    DB 에 area_m2 = 0 으로 저장되어 "0.0m² · 0.0평" 로 노출되던 UX 사고 차단. */
export function formatArea(m2: number | null): string {
  if (m2 == null || Number.isNaN(m2) || m2 <= 0) return '-';
  const pyeong = (m2 / 3.3058).toFixed(1);
  return `${m2.toFixed(1)}m² · ${pyeong}평`;
}

/** 역까지 도보 (미터 → "7분") — 도보 4.8km/h 가정 */
export function formatStationDistance(m: number | null): string | null {
  if (m == null || Number.isNaN(m)) return null;
  const minutes = Math.max(1, Math.round(m / 80));
  return `도보 ${minutes}분`;
}

/** deals 배열을 쿼리파라미터 문자열로 */
export function dealsToParam(deals: DealType[]): string | undefined {
  if (deals.length === 0) return undefined;
  return deals.join(',');
}
