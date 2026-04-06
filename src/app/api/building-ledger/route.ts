import { NextRequest, NextResponse } from "next/server";

const SERVICE_KEY =
  process.env.DATA_GO_KR_API_KEY || process.env.BUILDING_LEDGER_API_KEY || "";

const BASE_URL = "https://apis.data.go.kr/1613000/BldRgstHubService";

// ìì ìì ë³´ë HubServiceì ìì ì ìì¼ë¯ë¡ ì¬ë¬ ìë¹ì¤ë¥¼ ìì°¨ ìë
const OWNER_API_URL = "https://apis.data.go.kr/1611000/OwnerInfoService/getArchitecturePossessionInfo";

const OPERATIONS: Record<string, string> = {
  basis: "getBrBasisOulnInfo",
  recapTitle: "getBrRecapTitleInfo",
  title: "getBrTitleInfo",
  floor: "getBrFlrOulnInfo",
  exposPubuseArea: "getBrExposPubuseAreaInfo",
  ownerInfo: "getBrOwnJtInfo",
};

type OperationType = keyof typeof OPERATIONS;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sigunguCd, bjdongCd, platGbCd, bun, ji, operations } = body;

    if (!sigunguCd || !bjdongCd) {
      return NextResponse.json(
        { error: "ìêµ°êµ¬ì½ëì ë²ì ëì½ëë íììëë¤." },
        { status: 400 }
      );
    }

    if (!SERVICE_KEY) {
      return NextResponse.json(
        { error: "ê±´ì¶ë¬¼ëì¥ API í¤ê° ì¤ì ëì§ ìììµëë¤." },
        { status: 500 }
      );
    }

    const opsToFetch: string[] =
      operations || ["basis", "recapTitle", "title", "floor"];

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

        // ìì ìì ë³´ë ì¬ë¬ ìë¹ì¤ URL + ì¬ë¬ ì¸ì½ë© ë°©ì ìì°¨ ìë
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
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
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

    // ìì ìì ë³´ê° ìì¼ë©´ ì±ë³ ë± ì¶ê° ì²ë¦¬
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
      { error: error.message || "ê±´ì¶ë¬¼ëì¥ ì¡°í ì¤ ì¤ë¥ ë°ì" },
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
    basis.regstrGbCdNm === "ì§í©" ||
    recapTitle.regstrGbCdNm === "ì§í©" ||
    title.regstrGbCdNm === "ì§í©";

  const exclusiveUnits = processExclusiveUnits(exposItems);

  return {
    ê±´ë¬¼ëª: basis.bldNm || title.bldNm || "",
    ì£¼ì©ë: basis.mainPurpsCdNm || title.mainPurpsCdNm || "",
    ê¸°íì©ë: basis.etcPurps || "",
    ê±´ë¬¼êµ¬ì¡°: basis.strctCdNm || title.strctCdNm || "",
    ì§ë¶êµ¬ì¡°: basis.roofCdNm || "",
    ëì§ë©´ì : parseFloat(recapTitle.platArea || basis.platArea || "0"),
    ê±´ì¶ë©´ì : parseFloat(recapTitle.archArea || basis.archArea || "0"),
    ì°ë©´ì : parseFloat(recapTitle.totArea || basis.totArea || "0"),
    ê±´íì¨: parseFloat(recapTitle.bcRat || basis.bcRat || "0"),
    ì©ì ë¥ : parseFloat(recapTitle.vlRat || basis.vlRat || "0"),
    ì§ìì¸µì: parseInt(basis.grndFlrCnt || title.grndFlrCnt || "0"),
    ì§íì¸µì: parseInt(basis.ugrndFlrCnt || title.ugrndFlrCnt || "0"),
    ì¹ì©ìë¦¬ë² ì´í°: parseInt(
      basis.rideUseElvtCnt || title.rideUseElvtCnt || "0"
    ),
    ë¹ìì©ìë¦¬ë² ì´í°: parseInt(
      basis.emgenUseElvtCnt || title.emgenUseElvtCnt || "0"
    ),
    ì¥ë´ê¸°ê³ìì£¼ì°¨: parseInt(basis.indrMechUtcnt || "0"),
    ì¥ë´ìì£¼ìì£¼ì°¨: parseInt(basis.indrAutoUtcnt || "0"),
    ì¥ì¸ê¸°ê³ìì£¼ì°¨: parseInt(basis.oudrMechUtcnt || "0"),
    ì¥ì¸ìì£¼ìì£¼ì°¨: parseInt(basis.oudrAutoUtcnt || "0"),
    ì´ì£¼ì°¨ëì:
      parseInt(basis.indrMechUtcnt || "0") +
      parseInt(basis.indrAutoUtcnt || "0") +
      parseInt(basis.oudrMechUtcnt || "0") +
      parseInt(basis.oudrAutoUtcnt || "0"),
    íê°ì¼: basis.pmsDay || "",
    ì¬ì©ì¹ì¸ì¼: basis.useAprDay || title.useAprDay || "",
    ëì¥êµ¬ë¶: basis.regstrGbCdNm || "",
    ëë¡ëªì£¼ì: basis.newPlatPlc || title.newPlatPlc || "",
    ì§ë²ì£¼ì: basis.platPlc || title.platPlc || "",
    ì¸ëì: parseInt(basis.hhldCnt || recapTitle.hhldCnt || "0"),
    í¸ì: parseInt(basis.hoCnt || recapTitle.hoCnt || "0"),
    ì¸µë³ê°ì: floors.map((f: any) => ({
      ì¸µë²í¸: f.flrNo,
      ì¸µêµ¬ë¶: f.flrGbCdNm,
      ì¸µì©ë: f.mainPurpsCdNm || f.etcPurps,
      ë©´ì : parseFloat(f.area || "0"),
    })),
    ì§í©ê±´ë¬¼ì¬ë¶: isCollectiveBuilding,
    ì ì ë¶: exclusiveUnits,
    _raw: { basis, recapTitle, title },
  };
}

function processExclusiveUnits(items: any[]) {
  if (!items || items.length === 0) return [];

  const exclusiveRecords = items.filter(
    (item: any) =>
      item.exposPubuseGbCdNm === "ì ì " || item.exposPubuseGbCd === "1"
  );
  const commonRecords = items.filter(
    (item: any) =>
      item.exposPubuseGbCdNm === "ê³µì©" || item.exposPubuseGbCd === "2"
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
 * ìì ìì ë³´ APIë¥¼ ì¬ë¬ ìë¹ì¤ URL + ì¬ë¬ ì¸ì½ë© ë°©ìì¼ë¡ ìì°¨ ìë
 * ServiceKey ì¸ì½ë©ì´ ìë¹ì¤ë§ë¤ ë¤ë¥¼ ì ìì¼ë¯ë¡ raw/decoded ëª¨ë ìë
 */
async function fetchOwnerInfoWithFallback(
  opName: string,
  params: Record<string, string>
): Promise<{ items: OwnerInfoItem[]; error?: string }> {
  // 소유자 정보는 별도 서비스: 1611000/OwnerInfoService (NOT 1613000/BldRgstHubService)
  // 파라미터도 snake_case 사용 (sigungu_cd, bjdong_cd 등)
  const ownerParams: Record<string, string> = {
    serviceKey: SERVICE_KEY,
    numOfRows: "99999",
    pageNo: "1",
    sigungu_cd: params.sigunguCd || "",
    bjdong_cd: params.bjdongCd || "",
  };
  if (params.bun) ownerParams.bun = params.bun;
  if (params.ji) ownerParams.ji = params.ji;
  if (params.platGbCd) ownerParams.plat_gb_cd = params.platGbCd;

  const errors: string[] = [];

  // 시도 1: 인코딩된 키 그대로
  try {
    const url = OWNER_API_URL;
    const queryString = new URLSearchParams(ownerParams).toString();
    const fullUrl = url + "?" + queryString;
    console.log("[OwnerInfo] Trying encoded key:", url);
    const res = await fetch(fullUrl);
    if (!res.ok) {
      errors.push(url + "(encoded) -> HTTP " + res.status);
    } else {
      const text = await res.text();
      const parser = new (await import("fast-xml-parser")).XMLParser();
      const json = parser.parse(text);
      const header = json?.response?.header;
      if (header?.resultCode === "00") {
        const body = json?.response?.body;
        const rawItems = body?.items?.item;
        if (rawItems) {
          const items = Array.isArray(rawItems) ? rawItems : [rawItems];
          return { items: items as OwnerInfoItem[] };
        }
        return { items: [] };
      } else {
        errors.push(url + "(encoded) -> code:" + header?.resultCode + " " + (header?.resultMsg || ""));
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push("OwnerInfoService(encoded) -> " + msg);
  }

  // 시도 2: 디코딩된 키
  try {
    const decodedKey = decodeURIComponent(SERVICE_KEY);
    const decodedParams = { ...ownerParams, serviceKey: decodedKey };
    const url = OWNER_API_URL;
    const queryString = new URLSearchParams(decodedParams).toString();
    const fullUrl = url + "?" + queryString;
    console.log("[OwnerInfo] Trying decoded key:", url);
    const res = await fetch(fullUrl);
    if (!res.ok) {
      errors.push(url + "(decoded) -> HTTP " + res.status);
    } else {
      const text = await res.text();
      const parser = new (await import("fast-xml-parser")).XMLParser();
      const json = parser.parse(text);
      const header = json?.response?.header;
      if (header?.resultCode === "00") {
        const body = json?.response?.body;
        const rawItems = body?.items?.item;
        if (rawItems) {
          const items = Array.isArray(rawItems) ? rawItems : [rawItems];
          return { items: items as OwnerInfoItem[] };
        }
        return { items: [] };
      } else {
        errors.push(url + "(decoded) -> code:" + header?.resultCode + " " + (header?.resultMsg || ""));
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push("OwnerInfoService(decoded) -> " + msg);
  }

  return {
    items: [],
    error: "소유자정보 조회 실패 (시도: " + errors.join(" | ") + ")",
  };
}

/**
 * ìì ìì ë³´ì ì±ë³ ì ë³´ ì¶ê°
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
      return "ë¨";
    case "2":
      return "ì¬";
    case "3":
      return "ë¨";
    case "4":
      return "ì¬";
    case "5":
      return "ë¨(ì¸êµ­ì¸)";
    case "6":
      return "ì¬(ì¸êµ­ì¸)";
    default:
      return "";
  }
}
