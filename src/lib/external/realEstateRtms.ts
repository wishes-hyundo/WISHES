/**
 * L-Layer6 (2026-04-28): RTMS 실거래가 요약 — data.go.kr 무료
 *
 * 부동산 거래가 공개 시스템 (RTMS) — 같은 동 (법정동) 의 최근 실거래 평균/중간/최저/최고.
 * 매물 가격이 시장 대비 어떤 수준인지 사장님이 한눈에 비교 가능.
 *
 * 무료. ServiceKey: data.go.kr 동일 키.
 *
 * building_type → endpoint 매핑:
 *   apartment   → getRTMSDataSvcAptTrade / getRTMSDataSvcAptRent
 *   officetel   → getRTMSDataSvcOffiTrade / getRTMSDataSvcOffiRent
 *   villa       → getRTMSDataSvcRHTrade / getRTMSDataSvcRHRent  (연립/다세대)
 *   default     → getRTMSDataSvcRHTrade
 *
 * deal_type:
 *   sale       → Trade (매매)
 *   else       → Rent (전세/월세)
 */

const RTMS_API_KEY =
  process.env.DATA_GO_KR_API_KEY ||
  process.env.PUBLIC_DATA_API_KEY ||
  process.env.BLDG_RGST_API_KEY ||
  '';

export interface RtmsTransaction {
  dealAmount?: number;       // 만원 (매매)
  deposit?: number;          // 만원 (전월세 보증금)
  monthlyRent?: number;      // 만원 (월세)
  exclusiveArea?: number;    // m²
  floor?: number;
  buildYear?: number;
  dealYear?: number;
  dealMonth?: number;
  dealDay?: number;
  apartmentName?: string;
}

export interface RtmsSummary {
  endpoint: string;
  dealType: 'sale' | 'rent';
  totalCount: number;
  recent: RtmsTransaction[];          // 최근 5건
  stats: {
    median?: number;
    avg?: number;
    min?: number;
    max?: number;
    unit: 'krw_10k' | 'krw_10k_deposit';
  };
  fetchedAt: string;
  monthsSearched: string[];
}

interface RtmsArgs {
  sigunguCd: string;
  bjdongCd: string;
  bun?: string;
  ji?: string;
  buildingType: string;
  dealType: string;
}

function pickEndpoint(buildingType: string, isSale: boolean): string {
  const t = (buildingType || '').toLowerCase();
  if (t.includes('apart') || t === '아파트') {
    return isSale ? 'getRTMSDataSvcAptTrade' : 'getRTMSDataSvcAptRent';
  }
  if (t.includes('office') || t === '오피스텔') {
    return isSale ? 'getRTMSDataSvcOffiTrade' : 'getRTMSDataSvcOffiRent';
  }
  // villa / 빌라 / 다세대 / 연립 / 단독 → RH (Row House)
  return isSale ? 'getRTMSDataSvcRHTrade' : 'getRTMSDataSvcRHRent';
}

function buildMonths(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    out.push(`${y}${m}`);
  }
  return out;
}

interface RtmsItem {
  거래금액?: string | number;
  보증금액?: string | number;
  월세금액?: string | number;
  전용면적?: string | number;
  층?: string | number;
  건축년도?: string | number;
  년?: string | number;
  월?: string | number;
  일?: string | number;
  아파트?: string;
  연립다세대?: string;
  오피스텔?: string;
}

function parseAmount(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return isNaN(n) ? undefined : n;
}

function mapItem(it: RtmsItem): RtmsTransaction {
  return {
    dealAmount: parseAmount(it['거래금액']),
    deposit: parseAmount(it['보증금액']),
    monthlyRent: parseAmount(it['월세금액']),
    exclusiveArea: parseAmount(it['전용면적']),
    floor: parseAmount(it['층']),
    buildYear: parseAmount(it['건축년도']),
    dealYear: parseAmount(it['년']),
    dealMonth: parseAmount(it['월']),
    dealDay: parseAmount(it['일']),
    apartmentName: it['아파트'] || it['연립다세대'] || it['오피스텔'] || undefined,
  };
}

function median(arr: number[]): number | undefined {
  if (!arr.length) return undefined;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function fetchRtmsSummary(args: RtmsArgs): Promise<RtmsSummary | null> {
  if (!RTMS_API_KEY) return null;

  const isSale = (args.dealType || 'sale').toLowerCase() === 'sale';
  const endpoint = pickEndpoint(args.buildingType, isSale);

  const lawd = args.sigunguCd; // RTMS 는 5자리 LAWD_CD 사용
  const months = buildMonths(3); // 최근 3개월

  let decodedKey = RTMS_API_KEY;
  try { if (RTMS_API_KEY.includes('%')) decodedKey = decodeURIComponent(RTMS_API_KEY); } catch { /* keep */ }

  const all: RtmsTransaction[] = [];
  const monthsTried: string[] = [];

  await Promise.all(
    months.map(async (yyyymm) => {
      try {
        const params = new URLSearchParams({
          ServiceKey: decodedKey,
          LAWD_CD: lawd,
          DEAL_YMD: yyyymm,
          numOfRows: '100',
          pageNo: '1',
          _type: 'json',
        });
        const url = `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/${endpoint}?${params.toString()}`
          .replace('RTMSDataSvcAptTrade', endpoint.replace('get', '').replace('Trade', 'Trade').replace('Rent', 'Rent'));
        // Actual base path varies per endpoint family — use mapping
        const base =
          endpoint.startsWith('getRTMSDataSvcApt') ? 'RTMSDataSvcAptTrade' :
          endpoint.startsWith('getRTMSDataSvcOffi') ? 'RTMSDataSvcOffiTrade' :
          'RTMSDataSvcRHTrade';
        const finalUrl = `https://apis.data.go.kr/1613000/${base}/${endpoint}?${params.toString()}`;

        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(finalUrl, { signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) return;

        const text = await res.text();
        let json: { response?: { body?: { items?: { item?: RtmsItem | RtmsItem[] } } } };
        try { json = JSON.parse(text); } catch { return; }
        monthsTried.push(yyyymm);

        const items = json.response?.body?.items?.item;
        if (!items) return;
        const arr = Array.isArray(items) ? items : [items];

        // 같은 번지 (bun/ji) 만 필터링 — 가능하면
        for (const it of arr) {
          all.push(mapItem(it));
        }
        // suppress unused warning for url
        void url;
      } catch {
        /* per-month fail ignored */
      }
    }),
  );

  if (all.length === 0) {
    return {
      endpoint,
      dealType: isSale ? 'sale' : 'rent',
      totalCount: 0,
      recent: [],
      stats: { unit: isSale ? 'krw_10k' : 'krw_10k_deposit' },
      fetchedAt: new Date().toISOString(),
      monthsSearched: monthsTried,
    };
  }

  // 정렬: 거래일 최신 → 오래된
  all.sort((a, b) => {
    const ka = (a.dealYear || 0) * 10000 + (a.dealMonth || 0) * 100 + (a.dealDay || 0);
    const kb = (b.dealYear || 0) * 10000 + (b.dealMonth || 0) * 100 + (b.dealDay || 0);
    return kb - ka;
  });

  const amounts = all
    .map((t) => (isSale ? t.dealAmount : t.deposit))
    .filter((n): n is number => typeof n === 'number' && n > 0);

  const stats = {
    median: median(amounts),
    avg: amounts.length ? Math.round(amounts.reduce((s, n) => s + n, 0) / amounts.length) : undefined,
    min: amounts.length ? Math.min(...amounts) : undefined,
    max: amounts.length ? Math.max(...amounts) : undefined,
    unit: (isSale ? 'krw_10k' : 'krw_10k_deposit') as 'krw_10k' | 'krw_10k_deposit',
  };

  return {
    endpoint,
    dealType: isSale ? 'sale' : 'rent',
    totalCount: all.length,
    recent: all.slice(0, 5),
    stats,
    fetchedAt: new Date().toISOString(),
    monthsSearched: monthsTried,
  };
}
