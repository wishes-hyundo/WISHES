import { NextRequest, NextResponse } from "next/server";

const SERVICE_KEY =
  process.env.DATA_GO_KR_API_KEY || process.env.BUILDING_LEDGER_API_KEY || "";

const BASE_URL = "https://apis.data.go.kr/1613000/BldRgstHubService";

// 소유자정보는 HubService에 없을 수 있으므로 여러 서비스를 순차 시도
const OWNER_API_URLS = [
  "https://apis.data.go.kr/1613000/BldRgstHubService",
  "https://apis.data.go.kr/1613000/BldRgstService_v2",
  "https://apis.data.go.kr/1613000/BldRgstService",
];

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
 * 소유자정보 API를 여러 서비스 URL + 여러 인코딩 방식으로 순차 시도
 * ServiceKey 인코딩이 서비스마다 다를 수 있으므로 raw/decoded 모두 시도
 */
async function fetchOwnerInfoWithFallback(
  opName: string,
  baseParams: Record<string, string>
) {
  const errors: string[] = [];

  // ServiceKey를 여러 방식으로 준비
  const rawKey = SERVICE_KEY;
  let decodedKey: string;
  try {
    decodedKey = decodeURIComponent(SERVICE_KEY);
  } catch {
    decodedKey = SERVICE_KEY;
  }

  // 각 URL에 대해 raw key와 decoded key 모두 시도
  for (const baseUrl of OWNER_API_URLS) {
    const keyVariants = [
      { label: "raw", key: rawKey },
      { label: "decoded", key: decodedKey },
    ];

    for (const variant of keyVariants) {
      try {
        // URLSearchParams를 사용하지 않고 직접 URL 구성 (인코딩 제어)
        const queryParts = [
          "ServiceKey=" + variant.key,
          "sigunguCd=" + baseParams.sigunguCd,
          "bjdongCd=" + baseParams.bjdongCd,
          "platGbCd=" + (baseParams.platGbCd || "0"),
          "bun=" + (baseParams.bun || "0000"),
          "ji=" + (baseParams.ji || "0000"),
          "numOfRows=100",
          "pageNo=1",
          "_type=json",
        ];
        const url = baseUrl + "/" + opName + "?" + queryParts.join("&");

        console.log(
          "[ownerInfo] trying:",
          baseUrl,
          "key:",
          variant.label
        );

        const res = await fetch(url, {
          headers: { Accept: "application/json" },
        });

        if (!res.ok) {
          errors.push(
            baseUrl +
"(" +
              variant.label +
              ") -> HTTP " +
              res.status
          );
          continue;
        }

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          errors.push(
            baseUrl +
              "(" +
              variant.label +
              ") -> not JSON: " +
              text.substring(0, 80)
          );
          continue;
        }

        // API 응답 내 에러코드 확인
        const resultCode = data?.response?.header?.resultCode;
        if (resultCode && resultCode !== "00") {
          errors.push(
            baseUrl +
              "(" +
              variant.label +
              ") -> code:" +
              resultCode +
              " " +
              (data?.response?.header?.resultMsg || "")
          );
          continue;
        }

        const items = data?.response?.body?.items?.item || [];
        const itemArray = Array.isArray(items)
          ? items
          : items
          ? [items]
          : [];

        console.log(
          "[ownerInfo] success from:",
          baseUrl,
          "key:",
          variant.label,
          "items:",
          itemArray.length
        );

        return {
          operation: "ownerInfo",
          items: itemArray,
          totalCount: data?.response?.body?.totalCount || 0,
          source: baseUrl,
          keyType: variant.label,
        };
      } catch (e: any) {
        errors.push(
          baseUrl + "(" + variant.label + ") -> " + e.message
        );
        continue;
      }
    }
  }

  // 모든 시도 실패 시
  console.error("[ownerInfo] all attempts failed:", errors);
  throw new Error(
    "소유자정보 조회 실패 (시도: " + errors.join(" | ") + ")"
  );
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
