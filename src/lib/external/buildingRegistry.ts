// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bldg-unit (2026-04-28): data.go.kr 건축물대장 API 헬퍼 모듈
//
//   Next.js 15+ Route Handler 파일은 GET/POST 외 export 허용 X.
//   building-registry/route.ts 의 fetchBuildingData / fetchExposureUnits
//   를 lib 모듈로 이동 → building-registry/route.ts 와
//   building-registry-full/route.ts 둘 다 import.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const API_KEY = process.env.DATA_GO_KR_API_KEY || '';
const API_BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService';

type AnyObj = Record<string, unknown>;

const FIELD_MAP: [string, string][] = [
  ['bldNm', 'buildingName'],
  ['mainPurpsCdNm', 'buildingPurpose'],
  ['etcPurps', 'etcPurpose'],
  ['strctCdNm', 'buildingStructure'],
  ['roofCdNm', 'roofStructure'],
  ['platArea', 'siteArea'],
  ['archArea', 'buildingArea'],
  ['totArea', 'totalFloorArea'],
  ['bcRat', 'buildingCoverageRatio'],
  ['vlRat', 'floorAreaRatio'],
  ['grndFlrCnt', 'totalFloors'],
  ['ugrndFlrCnt', 'undergroundFloors'],
  ['rideUseElvtCnt', 'rideElevatorCount'],
  ['emgenUseElvtCnt', 'emergencyElevatorCount'],
  ['indrMechUtcnt', 'indoorMechParking'],
  ['indrAutoUtcnt', 'indoorAutoParking'],
  ['oudrMechUtcnt', 'outdoorMechParking'],
  ['oudrAutoUtcnt', 'outdoorAutoParking'],
  ['useAprDay', 'approvalDate'],
  ['pmsDay', 'permitDate'],
  ['stcnsDay', 'constructionStartDate'],
  ['newPlatPlc', 'roadAddress'],
  ['platPlc', 'jibunAddress'],
  ['regstrGbCdNm', 'registryType'],
  ['regstrKindCdNm', 'registryKind'],
  ['hhldCnt', 'householdCount'],
  ['hoCnt', 'unitCount'],
  ['fmlyCnt', 'familyCount'],
  ['dongNm', 'dongName'],
  // L-bldg-unit Layer 5 (2026-04-28): 위반건축물 정보 (사장님 법적 책임 보호)
  ['vlitnYn', 'illegalBuilding'],          // Y/N
  ['vlitnVilDt', 'illegalBuildingDate'],   // 위반표시일
  ['vlitnLawNm', 'illegalLawName'],        // 위반 법령
  ['vlitnLawArtNm', 'illegalLawArticle'],  // 위반 조항
];

export async function fetchBuildingData(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string,
  platGbCd: string,
  debugInfo: string[],
) {
  let decodedKey = API_KEY;
  try { if (API_KEY.includes('%')) decodedKey = decodeURIComponent(API_KEY); } catch { /* keep */ }

  const endpoints = ['getBrBasisOulnInfo', 'getBrRecapTitleInfo', 'getBrTitleInfo', 'getBrFlrOulnInfo'];

  const baseParams: Record<string, string> = {
    ServiceKey: decodedKey,
    sigunguCd,
    numOfRows: '100',
    pageNo: '1',
    _type: 'json',
  };
  if (bjdongCd) baseParams.bjdongCd = bjdongCd;
  if (bun && bun !== '0000') baseParams.bun = bun;
  if (ji && ji !== '0000') baseParams.ji = ji;
  baseParams.platGbCd = platGbCd;

  const results = await Promise.allSettled(
    endpoints.map(async (ep) => {
      const params = new URLSearchParams(baseParams);
      const url = `${API_BASE}/${ep}?${params.toString()}`;
      debugInfo.push(`${ep}: requesting [sigungu=${sigunguCd}, bjdong=${bjdongCd}, bun=${bun}, ji=${ji}]`);

      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);

      if (!res.ok) {
        debugInfo.push(`${ep}: HTTP ${res.status}`);
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json() as AnyObj;
      const response = (json.response as AnyObj | undefined) || {};
      const header = (response.header as AnyObj | undefined) || (json.header as AnyObj | undefined) || {};
      const body = (response.body as AnyObj | undefined) || (json.body as AnyObj | undefined) || {};

      if (header.resultCode && header.resultCode !== '00') {
        debugInfo.push(`${ep}: api_err=${header.resultCode} ${header.resultMsg || ''}`);
        throw new Error(`API error: ${header.resultCode}`);
      }

      const items = (body.items as AnyObj | undefined)?.item;
      const itemArray: AnyObj[] = Array.isArray(items) ? items : (items ? [items as AnyObj] : []);
      debugInfo.push(`${ep}: ok (${itemArray.length} items)`);
      return { endpoint: ep, items: itemArray };
    }),
  );

  const buildingData: Record<string, string | number> = {};
  const floorData: AnyObj[] = [];

  for (let i = 0; i < endpoints.length; i++) {
    const r = results[i];
    if (r.status !== 'fulfilled') continue;
    const { items } = r.value;

    if (endpoints[i] === 'getBrFlrOulnInfo') {
      floorData.push(...items);
      continue;
    }

    const firstItem = items[0];
    if (!firstItem) continue;

    for (const [apiField, dataField] of FIELD_MAP) {
      if (firstItem[apiField] != null && buildingData[dataField] == null) {
        buildingData[dataField] = String(firstItem[apiField]);
      }
    }
  }

  const rideElv = parseInt(String(buildingData.rideElevatorCount || '0'));
  const emgElv = parseInt(String(buildingData.emergencyElevatorCount || '0'));
  buildingData.elevatorCount = String(rideElv + emgElv);

  const iM = parseInt(String(buildingData.indoorMechParking || '0'));
  const iA = parseInt(String(buildingData.indoorAutoParking || '0'));
  const oM = parseInt(String(buildingData.outdoorMechParking || '0'));
  const oA = parseInt(String(buildingData.outdoorAutoParking || '0'));
  buildingData.parkingCount = String(iM + iA + oM + oA);

  const floors = floorData.map((f) => ({
    floorNo: f.flrNo,
    floorType: f.flrGbCdNm,
    purpose: f.mainPurpsCdNm || f.etcPurps || '',
    area: parseFloat(String(f.area || '0')),
  }));

  return { buildingData, floors };
}

export interface BuildingUnit {
  dongNm: string;
  hoNm: string;
  flrNo: string;
  flrNoNm: string;
  exclusiveArea: number;
  commonArea: number;
  totalArea: number;
  mainPurpsCdNm: string;
  etcPurps: string;
  strctCdNm: string;
  floorNum: number;
}

export async function fetchExposureUnits(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string,
  platGbCd: string,
  debugInfo: string[],
): Promise<BuildingUnit[]> {
  let decodedKey = API_KEY;
  try { if (API_KEY.includes('%')) decodedKey = decodeURIComponent(API_KEY); } catch { /* keep */ }

  const baseParams: Record<string, string> = {
    ServiceKey: decodedKey,
    sigunguCd,
    numOfRows: '500',
    pageNo: '1',
    _type: 'json',
  };
  if (bjdongCd) baseParams.bjdongCd = bjdongCd;
  if (bun && bun !== '0000') baseParams.bun = bun;
  if (ji && ji !== '0000') baseParams.ji = ji;
  baseParams.platGbCd = platGbCd;

  try {
    const params = new URLSearchParams(baseParams);
    const url = `${API_BASE}/getBrExposPubuseAreaInfo?${params.toString()}`;
    debugInfo.push(`getBrExposPubuseAreaInfo: requesting`);

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);

    if (!res.ok) {
      debugInfo.push(`getBrExposPubuseAreaInfo: HTTP ${res.status}`);
      return [];
    }

    const json = await res.json() as AnyObj;
    const response = (json.response as AnyObj | undefined) || {};
    const header = (response.header as AnyObj | undefined) || (json.header as AnyObj | undefined) || {};
    const body = (response.body as AnyObj | undefined) || (json.body as AnyObj | undefined) || {};

    if (header.resultCode && header.resultCode !== '00') {
      debugInfo.push(`getBrExposPubuseAreaInfo: api_err=${header.resultCode}`);
      return [];
    }

    const itemsRaw = (body.items as AnyObj | undefined)?.item;
    const items: AnyObj[] = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw ? [itemsRaw as AnyObj] : []);
    debugInfo.push(`getBrExposPubuseAreaInfo: ok (${items.length} records)`);

    const exclusive = items.filter(
      (it) => it.exposPubuseGbCdNm === '전유' || it.exposPubuseGbCd === '1',
    );
    const common = items.filter(
      (it) => it.exposPubuseGbCdNm === '공용' || it.exposPubuseGbCd === '2',
    );

    const unitMap = new Map<string, BuildingUnit>();

    for (const r of exclusive) {
      const key = (r.dongNm || '') + '_' + (r.hoNm || '');
      if (!unitMap.has(key)) {
        unitMap.set(key, {
          dongNm: String(r.dongNm || ''),
          hoNm: String(r.hoNm || ''),
          flrNo: String(r.flrNo || ''),
          flrNoNm: String(r.flrNoNm || r.flrGbCdNm || ''),
          exclusiveArea: parseFloat(String(r.area || '0')),
          commonArea: 0,
          totalArea: 0,
          mainPurpsCdNm: String(r.mainPurpsCdNm || ''),
          etcPurps: String(r.etcPurps || ''),
          strctCdNm: String(r.strctCdNm || ''),
          floorNum: parseInt(String(r.flrNo || '0')) || 0,
        });
      } else {
        const u = unitMap.get(key)!;
        u.exclusiveArea += parseFloat(String(r.area || '0'));
      }
    }
    for (const r of common) {
      const key = (r.dongNm || '') + '_' + (r.hoNm || '');
      const u = unitMap.get(key);
      if (u) u.commonArea += parseFloat(String(r.area || '0'));
    }

    const units = Array.from(unitMap.values()).map((u) => ({
      ...u,
      exclusiveArea: parseFloat(u.exclusiveArea.toFixed(2)),
      commonArea: parseFloat(u.commonArea.toFixed(2)),
      totalArea: parseFloat((u.exclusiveArea + u.commonArea).toFixed(2)),
    }));

    units.sort((a, b) => {
      if (a.dongNm !== b.dongNm) return a.dongNm.localeCompare(b.dongNm);
      if (a.floorNum !== b.floorNum) return a.floorNum - b.floorNum;
      return a.hoNm.localeCompare(b.hoNm);
    });

    return units;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    debugInfo.push(`getBrExposPubuseAreaInfo: error ${msg}`);
    return [];
  }
}
