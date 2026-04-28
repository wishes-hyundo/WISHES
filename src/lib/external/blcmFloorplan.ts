/**
 * L-BLCM (2026-04-29): 건축물 도면정보 API (정부 공식 무료)
 *
 * 출처: http://blcm.go.kr (건축물 생애이력 관리시스템 — 국토교통부)
 * Endpoint: http://blcm.go.kr/api/DrawSearch.do
 *
 * 응답 image 필드 = 진짜 평면도 이미지 URL.
 * 사장님 입력 추측 X — 100% 정부 공식 데이터.
 *
 * 발급:
 *   1. blcm.go.kr 회원가입
 *   2. 인증키 발급 + 서비스 URL 등록 (https://wishes.co.kr)
 *   3. 환경변수 BLCM_API_KEY + BLCM_SERVICE_URL 설정
 */

const BLCM_API_KEY = process.env.BLCM_API_KEY || '';
const BLCM_SERVICE_URL = process.env.BLCM_SERVICE_URL || 'https://wishes.co.kr';
const BLCM_ENDPOINT = 'http://blcm.go.kr/api/DrawSearch.do';

export interface BlcmFloorplanItem {
  mgmBldrgstPk: string;
  bldNm: string;
  dongNm?: string;
  blprtKindName: string;       // "배치도" or "평면도"
  flrGbCdName?: string;        // "지상" or "지하"
  flrNo?: string;
  flrNoNm?: string;
  blprtFileCnt?: number;
  fileId?: string;
  image?: string;              // 진짜 평면도 이미지 URL
}

export interface BlcmFloorplanResult {
  ok: boolean;
  totalCount: number;
  items: BlcmFloorplanItem[];
  source: 'blcm.go.kr';
  searchType: 'bldkey' | 'jibun' | 'road';
  query: string;
  error?: string;
}

/**
 * 건축물대장키 (mgmBldrgstPk) 로 평면도 검색.
 * Layer 4 building-registry 응답에 mgmBldrgstPk 있음 → 즉시 호출 가능.
 */
export async function fetchBlcmFloorplansByBldKey(mgmBldrgstPk: string): Promise<BlcmFloorplanResult> {
  return fetchBlcmFloorplans({
    q: mgmBldrgstPk,
    searchType: 'bldkey',
  });
}

/**
 * 지번주소 (법정동코드 + 본번 + 부번) 로 평면도 검색.
 * 형식: q = bjdongCd + bun + '-' + ji
 */
export async function fetchBlcmFloorplansByJibun(bjdongCd10: string, bun: string, ji: string): Promise<BlcmFloorplanResult> {
  // bun/ji 는 0-padding 없이 그냥 숫자
  const bunNum = parseInt(bun || '0', 10) || 0;
  const jiNum = parseInt(ji || '0', 10) || 0;
  const q = `${bjdongCd10}${bunNum}-${jiNum}`;
  return fetchBlcmFloorplans({ q, searchType: 'jibun' });
}

interface FetchArgs {
  q: string;
  searchType: 'bldkey' | 'jibun' | 'road';
  pageno?: number;
  result?: number;
}

async function fetchBlcmFloorplans(args: FetchArgs): Promise<BlcmFloorplanResult> {
  if (!BLCM_API_KEY) {
    return {
      ok: false,
      totalCount: 0,
      items: [],
      source: 'blcm.go.kr',
      searchType: args.searchType,
      query: args.q,
      error: 'BLCM_API_KEY not configured',
    };
  }

  const params = new URLSearchParams({
    key: BLCM_API_KEY,
    q: args.q,
    target: 'floor',
    searchType: args.searchType,
    url: BLCM_SERVICE_URL,
    output: 'json',
    pageno: String(args.pageno ?? 1),
    result: String(args.result ?? 50),
  });

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(`${BLCM_ENDPOINT}?${params.toString()}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(tid);

    if (!res.ok) {
      return {
        ok: false,
        totalCount: 0,
        items: [],
        source: 'blcm.go.kr',
        searchType: args.searchType,
        query: args.q,
        error: `HTTP ${res.status}`,
      };
    }

    const text = await res.text();
    let json: { totalCount?: number; code?: string; codeNm?: string; result?: BlcmFloorplanItem[] | { item?: BlcmFloorplanItem | BlcmFloorplanItem[] } };
    try {
      json = JSON.parse(text);
    } catch {
      return {
        ok: false,
        totalCount: 0,
        items: [],
        source: 'blcm.go.kr',
        searchType: args.searchType,
        query: args.q,
        error: 'Invalid JSON response',
      };
    }

    // BLCM 응답 구조 — code = '0' 정상, 그 외 오류
    if (json.code && json.code !== '0' && json.code !== 'null') {
      return {
        ok: false,
        totalCount: 0,
        items: [],
        source: 'blcm.go.kr',
        searchType: args.searchType,
        query: args.q,
        error: `BLCM error ${json.code}: ${json.codeNm || ''}`,
      };
    }

    // result 가 배열일 수도, { item: [...] } 일 수도
    let items: BlcmFloorplanItem[] = [];
    if (Array.isArray(json.result)) {
      items = json.result;
    } else if (json.result && typeof json.result === 'object') {
      const item = (json.result as { item?: BlcmFloorplanItem | BlcmFloorplanItem[] }).item;
      if (Array.isArray(item)) items = item;
      else if (item) items = [item];
    }

    // 평면도만 필터 (배치도 제외)
    const planItems = items.filter((it) => it.blprtKindName && it.blprtKindName.includes('평면'));

    return {
      ok: true,
      totalCount: json.totalCount || items.length,
      items: planItems.length > 0 ? planItems : items, // 평면도 없으면 모든 도면 반환
      source: 'blcm.go.kr',
      searchType: args.searchType,
      query: args.q,
    };
  } catch (e) {
    return {
      ok: false,
      totalCount: 0,
      items: [],
      source: 'blcm.go.kr',
      searchType: args.searchType,
      query: args.q,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
