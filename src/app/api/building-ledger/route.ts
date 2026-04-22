import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const SERVICE_KEY =
  process.env.DATA_GO_KR_API_KEY || process.env.BUILDING_LEDGER_API_KEY || "";

const BASE_URL = "https://apis.data.go.kr/1613000/BldRgstHubService";

// Owner info: try 1613000 services first (JSON), then 1611000 (XML) as fallback
const OWNER_API_URLS = [
  "https://apis.data.go.kr/1613000/BldRgstHubService",
  "https://apis.data.go.kr/1613000/BldRgstService_v2",
  "https://apis.data.go.kr/1613000/BldRgstService",
];
const OWNER_1611_URL = "https://apis.data.go.kr/1611000/OwnerInfoService/getArchitecturePossessionInfo";

const OPERATIONS: Record<string, string> = {
  basis: "getBrBasisOulnInfo",
  recapTitle: "getBrRecapTitleInfo",
  title: "getBrTitleInfo",
  floor: "getBrFlrOulnInfo",
  exposPubuseArea: "getBrExposPubuseAreaInfo",
  ownerInfo: "getBrOwnJtInfo",
};

type OperationType = keyof typeof OPERATIONS;

// L-sec17 (2026-04-22): data.go.kr 프록시 공개 오용 방지.
//   코드 필드 allowlist (digits only, 길이 cap), operations 화이트리스트 강제,
//   fetch timeout 8s 로 hangup 공격 차단. SERVICE_KEY 가 그대로 data.go.kr 에 갈 때
//   URL injection 이 발생하지 않도록 모든 숫자 파라미터는 \d 만 허용.
const CODE_RE = /^\d{1,20}$/;
const ALLOWED_OPS = new Set(['basis', 'recapTitle', 'title', 'floor', 'exposPubuseArea', 'ownerInfo']);

export async function POST(request: NextRequest) {
  try {
    // L-sec69 (2026-04-22): data.go.kr SERVICE_KEY 할당량 보호
    //   5분 30회/IP cap. 건축물대장 엔드포인트는 사용 빈도 낮음.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `building-ledger:ip:${_ip}`, limit: 30, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { sigunguCd, bjdongCd, platGbCd, bun, ji, operations } = body || {};

    // L-sec17: 코드 필드 타입/형식 엄격 검증
    if (typeof sigunguCd !== 'string' || !CODE_RE.test(sigunguCd)) {
      return NextResponse.json(
        { error: "sigunguCd 형식 오류 (숫자만 1-20자)." },
        { status: 400 }
      );
    }
    if (typeof bjdongCd !== 'string' || !CODE_RE.test(bjdongCd)) {
      return NextResponse.json(
        { error: "bjdongCd 형식 오류 (숫자만 1-20자)." },
        { status: 400 }
      );
    }
    // 선택 필드도 제공되면 같은 검증
    for (const [k, v] of Object.entries({ platGbCd, bun, ji })) {
      if (v != null && v !== '' && (typeof v !== 'string' || !CODE_RE.test(v))) {
        return NextResponse.json(
          { error: `${k} 형식 오류 (숫자만 1-20자).` },
          { status: 400 }
        );
      }
    }

    if (!SERVICE_KEY) {
      return NextResponse.json(
        { error: "건축물대장 API 키가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    // L-sec17: operations 화이트리스트 + 최대 6개 제한
    const opsRaw: unknown = operations;
    const opsInput: string[] = Array.isArray(opsRaw)
      ? (opsRaw as unknown[]).filter((o): o is string => typeof o === 'string')
      : ["basis", "recapTitle", "title", "floor"];
    const opsToFetch = opsInput
      .filter((o) => ALLOWED_OPS.has(o))
      .slice(0, 6);
    if (opsToFetch.length === 0) {
      return NextResponse.json(
        { error: "유효한 operations 가 없습니다." },
        { status: 400 }
      );
    }

    const baseParams = {
      sigunguCd,
      bjdongCd,
      platGbCd: platGbCd || "0",
      bun: bun || "0000",
      ji: ji || "0000",
    };

    const results = await Promise.allSettled(
      opsToFetch.map(async (op) => {
        const opName = OPERATIONS[op];
        if (!opName) throw new Error("Invalid operation: " + op);

        // 소유자정보는 여러 서비스 URL + 여러 인코딩 방식 순차 시도
        if (op === "ownerInfo") {
          return await fetchOwnerInfoWithFallback(opName, baseParams);
        }

        const params = new URLSearchParams({
          ServiceKey: decodeURIComponent(SERVICE_KEY),
          ...baseParams,
          numOfRows: op === "exposPubuseArea" ? "500" : "100",
          pageNo: "1",
          _type: "json",
        });

        const url = BASE_URL + "/" + opName + "?" + params.toString();
        // L-sec17: 외부 API hangup 공격 차단 (8초 타임아웃)
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error("API error: " + res.status);

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(op + ": JSON parse failed - API returned HTML");
        }

        const items = data?.response?.body?.items?.item || [];
        return {
          operation: op,
          items: Array.isArray(items) ? items : [items],
          totalCount: data?.response?.body?.totalCount || 0,
        };
      })
    );

    const combinedResult: Record<string, any> = {};
    results.forEach((result, index) => {
      const op = opsToFetch[index];
      if (result.status === "fulfilled") {
        combinedResult[op] = result.value;
      } else {
        combinedResult[op] = { error: result.reason.message, items: [] };
      }
    });

    const extracted = extractPropertyInfo(combinedResult);

    // 소유자정보가 있으면 성별 등 추가 처리
    if (combinedResult.ownerInfo?.items?.length > 0) {
      combinedResult.ownerInfo.items = processOwnerInfo(
combinedResult.ownerInfo.items
      );
    }

    return NextResponse.json({
      success: true,
      data: combinedResult,
      extracted,
    });
  } catch (error: any) {
    console.error("[building-ledger] error:", error);
    return NextResponse.json(
      { error: error.message || "건축물대장 조회 중 오류 발생" },
      { status: 500 }
    );
  }
}

function extractPropertyInfo(data: Record<string, any>) {
  const basis = data.basis?.items?.[0] || {};
  const recapTitle = data.recapTitle?.items?.[0] || {};
  const title = data.title?.items?.[0] || {};
  const floors = data.floor?.items || [];
  const exposItems = data.exposPubuseArea?.items || [];

  const isCollectiveBuilding =
    basis.regstrGbCdNm === "집합" ||
    recapTitle.regstrGbCdNm === "집합" ||
    title.regstrGbCdNm === "집합";

  const exclusiveUnits = processExclusiveUnits(exposItems);

  return {
    건물명: basis.bldNm || title.bldNm || "",
    주용도: basis.mainPurpsCdNm || title.mainPurpsCdNm || "",
    기타용도: basis.etcPurps || "",
    건물구조: basis.strctCdNm || title.strctCdNm || "",
    지붕구조: basis.roofCdNm || "",
    대지면적: parseFloat(recapTitle.platArea || basis.platArea || "0"),
    건축면적: parseFloat(recapTitle.archArea || basis.archArea || "0"),
    연면적: parseFloat(recapTitle.totArea || basis.totArea || "0"),
    건폐율: parseFloat(recapTitle.bcRat || basis.bcRat || "0"),
    용적률: parseFloat(recapTitle.vlRat || basis.vlRat || "0"),
    지상층수: parseInt(basis.grndFlrCnt || title.grndFlrCnt || "0"),
    지하층수: parseInt(basis.ugrndFlrCnt || title.ugrndFlrCnt || "0"),
    승용엘리베이터: parseInt(
      basis.rideUseElvtCnt || title.rideUseElvtCnt || "0"
    ),
    비상용엘리베이터: parseInt(
      basis.emgenUseElvtCnt || title.emgenUseElvtCnt || "0"
    ),
    옥내기계식주차: parseInt(basis.indrMechUtcnt || "0"),
    옥내자주식주차: parseInt(basis.indrAutoUtcnt || "0"),
    옥외기계식주차: parseInt(basis.oudrMechUtcnt || "0"),
    옥외자주식주차: parseInt(basis.oudrAutoUtcnt || "0"),
    총주차대수:
      parseInt(basis.indrMechUtcnt || "0") +
      parseInt(basis.indrAutoUtcnt || "0") +
      parseInt(basis.oudrMechUtcnt || "0") +
      parseInt(basis.oudrAutoUtcnt || "0"),
    허가일: basis.pmsDay || "",
    사용승인일: basis.useAprDay || title.useAprDay || "",
    대장구분: basis.regstrGbCdNm || "",
    도로명주소: basis.newPlatPlc || title.newPlatPlc || "",
    지번주소: basis.platPlc || title.platPlc || "",
    세대수: parseInt(basis.hhldCnt || recapTitle.hhldCnt || "0"),
    호수: parseInt(basis.hoCnt || recapTitle.hoCnt || "0"),
    층별개요: floors.map((f: any) => ({
      층번호: f.flrNo,
      층구분: f.flrGbCdNm,
      층용도: f.mainPurpsCdNm || f.etcPurps,
      면적: parseFloat(f.area || "0"),
    })),
    집합건물여부: isCollectiveBuilding,
    전유부: exclusiveUnits,
    _raw: { basis, recapTitle, title },
  };
}

function processExclusiveUnits(items: any[]) {
  if (!items || items.length === 0) return [];

  const exclusiveRecords = items.filter(
    (item: any) =>
      item.exposPubuseGbCdNm === "전유" || item.exposPubuseGbCd === "1"
  );
  const commonRecords = items.filter(
    (item: any) =>
      item.exposPubuseGbCdNm === "공용" || item.exposPubuseGbCd === "2"
  );

  const unitMap = new Map<
    string,
    {
      dongNm: string;
      hoNm: string;
      flrNo: string;
      flrNoNm: string;
      exclusiveArea: number;
      commonArea: number;
      mainPurpsCdNm: string;
      etcPurps: string;
      strctCdNm: string;
    }
  >();

  for (const record of exclusiveRecords) {
    const key = (record.dongNm || "") + "_" + (record.hoNm || "");
    if (!unitMap.has(key)) {
      unitMap.set(key, {
        dongNm: record.dongNm || "",
        hoNm: record.hoNm || "",
        flrNo: record.flrNo || "",
        flrNoNm: record.flrNoNm || record.flrGbCdNm || "",
        exclusiveArea: parseFloat(record.area || "0"),
        commonArea: 0,
        mainPurpsCdNm: record.mainPurpsCdNm || "",
        etcPurps: record.etcPurps || "",
        strctCdNm: record.strctCdNm || "",
      });
    } else {
      const existing = unitMap.get(key)!;
      existing.exclusiveArea += parseFloat(record.area || "0");
    }
  }

  for (const record of commonRecords) {
    const key = (record.dongNm || "") + "_" + (record.hoNm || "");
    const unit = unitMap.get(key);
    if (unit) {
      unit.commonArea += parseFloat(record.area || "0");
    }
  }

  return Array.from(unitMap.values())
    .map((unit) => ({
      ...unit,
      exclusiveArea: parseFloat(unit.exclusiveArea.toFixed(2)),
      commonArea: parseFloat(unit.commonArea.toFixed(2)),
      totalArea: parseFloat(
        (unit.exclusiveArea + unit.commonArea).toFixed(2)
      ),
      floorNum: parseInt(unit.flrNo) || 0,
    }))
    .sort((a, b) => {
      if (a.dongNm !== b.dongNm) return a.dongNm.localeCompare(b.dongNm);
      if (a.floorNum !== b.floorNum) return a.floorNum - b.floorNum;
      return a.hoNm.localeCompare(b.hoNm);
    });
}

/**
 * Fetch owner info with fallback across multiple services
 * 1) Try 1613000 services (getBrOwnJtInfo) - JSON response
 * 2) Try 1611000/OwnerInfoService - XML response (needs separate API key registration)
 */
async function fetchOwnerInfoWithFallback(
  opName: string,
  baseParams: Record<string, string>
) {
  const errors: string[] = [];

  // === Phase 1: Try 1613000 services (JSON, same API key) ===
  for (const baseUrl of OWNER_API_URLS) {
    try {
      const params = new URLSearchParams({
        ServiceKey: decodeURIComponent(SERVICE_KEY),
        sigunguCd: baseParams.sigunguCd || "",
        bjdongCd: baseParams.bjdongCd || "",
        platGbCd: baseParams.platGbCd || "0",
        bun: baseParams.bun || "0000",
        ji: baseParams.ji || "0000",
        numOfRows: "99999",
        pageNo: "1",
        _type: "json",
      });
      const url = baseUrl + "/" + opName + "?" + params.toString();
      console.log("[OwnerInfo] Trying 1613000:", baseUrl.split("/").pop());
      // L-sec17: 8초 타임아웃
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        errors.push(baseUrl.split("/").pop() + " -> HTTP " + res.status);
        continue;
      }
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { errors.push(baseUrl.split("/").pop() + " -> not JSON"); continue; }
      const items = data?.response?.body?.items?.item;
      if (items) {
        const arr = Array.isArray(items) ? items : [items];
        if (arr.length > 0) {
          console.log("[OwnerInfo] Success from", baseUrl.split("/").pop(), "items:", arr.length);
          return { operation: "ownerInfo", items: arr, totalCount: data?.response?.body?.totalCount || 0, source: baseUrl };
        }
      }
      // resultCode check
      const code = data?.response?.header?.resultCode;
      if (code && code !== "00") {
        errors.push(baseUrl.split("/").pop() + " -> code:" + code);
      } else {
        errors.push(baseUrl.split("/").pop() + " -> empty");
      }
    } catch (e: any) {
      errors.push(baseUrl.split("/").pop() + " -> " + (e.message || String(e)));
    }
  }

  // === Phase 2: Try 1611000/OwnerInfoService (XML response) ===
  for (const keyType of ["encoded", "decoded"]) {
    try {
      const svcKey = keyType === "decoded" ? decodeURIComponent(SERVICE_KEY) : SERVICE_KEY;
      const ownerParams: Record<string, string> = {
        serviceKey: svcKey,
        numOfRows: "99999",
        pageNo: "1",
        sigungu_cd: baseParams.sigunguCd || "",
        bjdong_cd: baseParams.bjdongCd || "",
      };
      if (baseParams.bun && baseParams.bun !== "0000") ownerParams.bun = baseParams.bun;
      if (baseParams.ji && baseParams.ji !== "0000") ownerParams.ji = baseParams.ji;
      if (baseParams.platGbCd) ownerParams.plat_gb_cd = baseParams.platGbCd;

      const qs = new URLSearchParams(ownerParams).toString();
      const fullUrl = OWNER_1611_URL + "?" + qs;
      console.log("[OwnerInfo] Trying 1611000 with", keyType, "key");
      // L-sec17: 8초 타임아웃
      const res = await fetch(fullUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) { errors.push("1611000_" + keyType + " -> HTTP " + res.status); continue; }
      const xml = await res.text();
      // Simple XML parsing without external library
      const codeMatch = xml.match(/<resultCode>(\d+)<\/resultCode>/);
      if (codeMatch && codeMatch[1] === "00") {
        const items = parseXmlItems(xml);
        if (items.length > 0) {
          console.log("[OwnerInfo] Success from 1611000", keyType, "items:", items.length);
          return { operation: "ownerInfo", items, totalCount: items.length, source: OWNER_1611_URL, keyType };
        }
        return { operation: "ownerInfo", items: [], totalCount: 0 };
      } else {
        const msgMatch = xml.match(/<resultMsg>([^<]*)<\/resultMsg>/);
        errors.push("1611000_" + keyType + " -> code:" + (codeMatch?.[1] || "?") + " " + (msgMatch?.[1] || ""));
      }
    } catch (e: any) {
      errors.push("1611000_" + keyType + " -> " + (e.message || String(e)));
    }
  }

  console.error("[OwnerInfo] All attempts failed:", errors);
  return { operation: "ownerInfo", items: [], totalCount: 0 };
}

/** Simple XML item parser for OwnerInfoService response */
function parseXmlItems(xml: string): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  // 2026-04-21: `s` (dotAll) flag는 ES2018+ 필요. [\s\S] 로 대체해 target 무관.
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const item: Record<string, string> = {};
    const fieldRegex = /<(\w+)>([^<]*)<\/>/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(itemXml)) !== null) {
      item[fieldMatch[1]] = fieldMatch[2];
    }
    items.push(item);
  }
  return items;
}

/**
 * 소유자정보에 성별 정보 추가
 */
function processOwnerInfo(items: any[]) {
  return items.map((item: any) => {
    const juminBack = extractGenderDigit(item);
    const gender = getGenderText(juminBack);

    return {
      ...item,
      _gender: gender,
      _genderDigit: juminBack,
    };
  });
}

function extractGenderDigit(item: any): string {
  const possibleFields = ["jmno", "juminNo", "ownrJuminNo"];
  for (const field of possibleFields) {
    if (item[field] && typeof item[field] === "string") {
      const val = item[field].replace(/-/g, "");
      if (val.length >= 7) {
        return val.charAt(6);
      }
    }
  }
  return "";
}

function getGenderText(digit: string): string {
  switch (digit) {
    case "1":
      return "남";
    case "2":
      return "여";
    case "3":
      return "남";
    case "4":
      return "여";
    case "5":
      return "남(외국인)";
    case "6":
      return "여(외국인)";
    default:
      return "";
  }
}
