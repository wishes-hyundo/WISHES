// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bldg-unit Layer 6 (2026-04-28): RTMS 실거래가 통합
//   data.go.kr 부동산 실거래가 API → 같은 법정동 + type/deal 의 최근 6개월
//   거래 평균/중간값/recent_3m_avg 산출. 사장님 가격 협상 시세 무기.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const API_KEY = process.env.DATA_GO_KR_API_KEY || '';
const RTMS_BASE = 'https://apis.data.go.kr/1613000';

type AnyObj = Record<string, unknown>;

export interface RtmsSummary {
  available: boolean;
  reason?: string;
  endpoint: string;
  count: number;
  avg: number;
  median: number;
  min: number;
  max: number;
  recent_3m_avg: number;
}

function pickEndpoint(type: string, deal: string): string | null {
  const t = (type || '').trim();
  const d = (deal || '').trim();
  const isTrade = d === '매매';
  const isRent = d === '전세' || d === '월세';
  if (t === '아파트') return isTrade ? 'getRTMSDataSvcAptTrade' : (isRent ? 'getRTMSDataSvcAptRent' : null);
  if (t === '오피스텔') return isTrade ? 'getRTMSDataSvcOffiTrade' : (isRent ? 'getRTMSDataSvcOffiRent' : null);
  if (['원룸', '투룸', '쓰리룸'].includes(t))
    return isTrade ? 'getRTMSDataSvcRHTrade' : (isRent ? 'getRTMSDataSvcRHRent' : null);
  return null;
}

function parseAmount(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).replace(/,/g, '').trim();
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function fetchRtmsSummary(
  type: string,
  deal: string,
  sigunguCd: string,
  monthsBack = 6,
): Promise<RtmsSummary> {
  const endpoint = pickEndpoint(type, deal);
  if (!endpoint) {
    return { available: false, reason: 'unsupported_type_deal', endpoint: '', count: 0, avg: 0, median: 0, min: 0, max: 0, recent_3m_avg: 0 };
  }
  if (!API_KEY) {
    return { available: false, reason: 'no_api_key', endpoint, count: 0, avg: 0, median: 0, min: 0, max: 0, recent_3m_avg: 0 };
  }

  const lawdCd = sigunguCd.substring(0, 5);
  const now = new Date();
  let decodedKey = API_KEY;
  try { if (API_KEY.includes('%')) decodedKey = decodeURIComponent(API_KEY); } catch { /* keep */ }

  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  // L-fix-perf (2026-04-28): 6개월을 sequential 로 호출하면 timeout. Promise.all 병렬.
  const monthFetches = await Promise.allSettled(
    Array.from({ length: monthsBack }, (_, i) => {
      const target = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yyyymm = String(target.getFullYear()) + String(target.getMonth() + 1).padStart(2, '0');
      const params = new URLSearchParams({
        ServiceKey: decodedKey, LAWD_CD: lawdCd, DEAL_YMD: yyyymm,
        pageNo: '1', numOfRows: '50', _type: 'json',
      });
      const url = `${RTMS_BASE}/${endpoint.replace('get', '')}/${endpoint}?${params.toString()}`;
      return (async () => {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 5000);
        try {
          const res = await fetch(url, { signal: ctrl.signal });
          clearTimeout(tid);
          if (!res.ok) return { target, items: [] as AnyObj[] };
          const json = await res.json() as AnyObj;
          const response = (json.response as AnyObj | undefined) || {};
          const body = (response.body as AnyObj | undefined) || {};
          const itemsRaw = (body.items as AnyObj | undefined)?.item;
          const items: AnyObj[] = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw ? [itemsRaw as AnyObj] : []);
          return { target, items };
        } catch {
          clearTimeout(tid);
          return { target, items: [] as AnyObj[] };
        }
      })();
    }),
  );

  const amounts: number[] = [];
  const recentAmounts: number[] = [];
  for (const m of monthFetches) {
    if (m.status !== 'fulfilled') continue;
    for (const r of m.value.items) {
      const dealAmount = parseAmount(r['거래금액'] || r['보증금액']);
      if (dealAmount === 0) continue;
      amounts.push(dealAmount);
      if (m.value.target >= threeMonthsAgo) recentAmounts.push(dealAmount);
    }
  }

  if (amounts.length === 0) {
    return { available: false, reason: 'no_transactions', endpoint, count: 0, avg: 0, median: 0, min: 0, max: 0, recent_3m_avg: 0 };
  }
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const recentAvg = recentAmounts.length > 0 ? recentAmounts.reduce((a, b) => a + b, 0) / recentAmounts.length : 0;
  return {
    available: true, endpoint, count: amounts.length,
    avg: Math.round(avg), median: Math.round(median(amounts)),
    min: Math.min(...amounts), max: Math.max(...amounts),
    recent_3m_avg: Math.round(recentAvg),
  };
}
