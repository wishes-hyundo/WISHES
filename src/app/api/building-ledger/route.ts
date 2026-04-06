import { NextRequest, NextResponse } from "next/server";

const SERVICE_KEY =
  process.env.DATA_GO_KR_API_KEY || process.env.BUILDING_LEDGER_API_KEY || "";

const BASE_URL = "https://apis.data.go.kr/1613000/BldRgstHubService";
const BASE_URL_OWNER = "https://apis.data.go.kr/1613000/BldRgstService_v2";

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
        { error: "시군구코드와 법정동코드는 필수입니다." },
        { status: 400 }
      );
    }

    if (!SERVICE_KEY) {
      return NextResponse.json(
        { error: "건축물대장 API 키가 설정되지 않았습니다." },
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

        const numOfRows =
          op === "exposPubuseArea" ? "500" : op === "ownerInfo" ? "100" : "100";

        const params = new URLSearchParams({
          ServiceKey: decodeURIComponent(SERVICE_KEY),
          ...baseParams,
          numOfRows,
          pageNo: "1",
          _type: "json",
        });

        const baseUrl = op === "ownerInfo" ? BASE_URL_OWNER : BASE_URL;
        const url = baseUrl + "/" + opName + "?" + params.toString();

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
  const ownerItems = data.ownerInfo?.items || [];

  const isCollectiveBuilding =
    basis.regstrGbCdNm === "집합" ||
    recapTitle.regstrGbCdNm === "집합" ||
    title.regstrGbCdNm === "집합";

  const exclusiveUnits = processExclusiveUnits(exposItems);
  const owners = processOwnerInfo(ownerItems);

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
    승용엘리베이터: parseInt(basis.rideUseElvtCnt || title.rideUseElvtCnt || "0"),
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
    소유자정보: owners,
    _raw: { basis, recapTitle, title },
  };
}

/**
 * 소유자 정보 가공
 * - 소유자명, 소유자구분, 지분, 주민번호 성별자리(뒷자리 첫번째)만 추출
 */
function processOwnerInfo(items: any[]) {
  if (!items || items.length === 0) return [];

  return items.map((item: any) => {
    const genderDigit = extractGenderDigit(item.jm || item.ownrNo || "");
    const genderText = getGenderText(genderDigit);

    return {
      소유자명: item.ownrNm || "",
      소유자구분: item.ownrRgstSeCdNm || "",
      지분:
        item.ownrMnnm && item.ownrSlno
          ? item.ownrMnnm + "/" + item.ownrSlno
          : "",
      주민번호성별코드: genderDigit,
      성별: genderText,
      동명: item.dongNm || "",
      호명: item.hoNm || "",
    };
  });
}

/**
 * 주민번호에서 뒷자리 첫번째(성별) 숫자만 추출
 * 형식: 000000-0****** 또는 0000000****** 또는 마스킹된 형태
 */
function extractGenderDigit(jm: string): string {
  if (!jm) return "";
  const cleaned = jm.replace(/[^0-9*-]/g, "");

  // 하이픈 포함: 000000-0
  if (cleaned.includes("-")) {
    const parts = cleaned.split("-");
    if (parts.length === 2 && parts[1].length > 0) {
      const digit = parts[1].charAt(0);
      if (/[1-4]/.test(digit)) return digit;
    }
    return "";
  }

  // 하이픈 없이 13자리 또는 7자리 이상
  if (cleaned.length >= 7) {
    const digit = cleaned.charAt(6);
    if (/[1-4]/.test(digit)) return digit;
  }

  return "";
}

/**
 * 성별코드 → 텍스트 변환
 * 1: 남성(1900년대생), 2: 여성(1900년대생)
 * 3: 남성(2000년대생), 4: 여성(2000년대생)
 */
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
    default:
      return "";
  }
}

/**
 * 전유부 데이터를 호실 단위로 가공
 * exposPubuseGbCd: "1" = 전유, "2" = 공용
 */
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
      totalArea: parseFloat((unit.exclusiveArea + unit.commonArea).toFixed(2)),
      floorNum: parseInt(unit.flrNo) || 0,
    }))
    .sort((a, b) => {
      if (a.dongNm !== b.dongNm) return a.dongNm.localeCompare(b.dongNm);
      if (a.floorNum !== b.floorNum) return a.floorNum - b.floorNum;
      return a.hoNm.localeCompare(b.hoNm);
    });
}
