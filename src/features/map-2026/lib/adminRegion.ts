// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// adminRegion — L-mapmarker3 (2026-04-24 pm)
// 한국 주소 문자열을 행정구역 계층(시도/시군구/동) 으로 파싱.
//
// 지도 마커 클러스터링이 행정구역 기준으로 뭉치고 흩어지게 하는 용도.
// grid 방식(좌표를 단순 floor) 은 팬/줌할 때 경계가 움직여 마커가 흔들리는
// 문제가 있었음. 행정구역은 고정돼 있어 사용자 경험이 안정적.
//
// 네이버 지도 / 직방 / 다방이 모두 이 방식.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AdminRegion {
  sido: string | null;  // 서울, 부산, 경기, 강원 …
  gu: string | null;    // 강남구, 관악구, 수원시 장안구 (경기도는 시+구 결합)
  dong: string | null;  // 신림동, 역삼동
}

// 시/도 정규화 — 풀네임 → 짧은 이름
const SIDO_NORM: Record<string, string> = {
  서울특별시: '서울', 서울시: '서울', 서울: '서울',
  부산광역시: '부산', 부산시: '부산', 부산: '부산',
  대구광역시: '대구', 대구시: '대구', 대구: '대구',
  인천광역시: '인천', 인천시: '인천', 인천: '인천',
  광주광역시: '광주', 광주시: '광주', 광주: '광주',
  대전광역시: '대전', 대전시: '대전', 대전: '대전',
  울산광역시: '울산', 울산시: '울산', 울산: '울산',
  세종특별자치시: '세종', 세종시: '세종', 세종: '세종',
  경기도: '경기', 경기: '경기',
  강원특별자치도: '강원', 강원도: '강원', 강원: '강원',
  충청북도: '충북', 충북: '충북',
  충청남도: '충남', 충남: '충남',
  전라북도: '전북', 전북특별자치도: '전북', 전북: '전북',
  전라남도: '전남', 전남: '전남',
  경상북도: '경북', 경북: '경북',
  경상남도: '경남', 경남: '경남',
  제주특별자치도: '제주', 제주도: '제주', 제주: '제주',
};

// 광역시·특별시 (직할구 체계) — 시도 → 구 직접
const DIRECT_METRO = new Set(['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종']);

// 시 단위 직할 (일반시 아래 구 없이 동으로 바로)
const CITY_DIRECT_DONG_PATTERN = /^(.+?[시군])$/;  // e.g. 시흥시, 가평군

/**
 * 한국 주소 문자열을 파싱해 시도/시군구/동 추출.
 *
 * 예:
 *   "서울 관악구 신림동 1431-32"       → { sido: '서울', gu: '관악구', dong: '신림동' }
 *   "서울특별시 강남구 역삼동"          → { sido: '서울', gu: '강남구', dong: '역삼동' }
 *   "경기 수원시 장안구 조원동 123"     → { sido: '경기', gu: '수원시 장안구', dong: '조원동' }
 *   "경기도 성남시 분당구 정자동"       → { sido: '경기', gu: '성남시 분당구', dong: '정자동' }
 *   "경기 시흥시 정왕동"                → { sido: '경기', gu: '시흥시', dong: '정왕동' }
 *   "강원 춘천시 효자동"                → { sido: '강원', gu: '춘천시', dong: '효자동' }
 */
export function parseKoreanAddress(address: string | null | undefined): AdminRegion {
  if (!address) return { sido: null, gu: null, dong: null };
  const parts = String(address).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { sido: null, gu: null, dong: null };

  // 1) 시/도 — 첫 토큰이 SIDO_NORM 에 있으면 매핑, 아니면 부분 매치 (e.g. '서울특별시' → '서울')
  let sidoIdx = 0;
  let sido: string | null = SIDO_NORM[parts[0]] ?? null;
  if (sido == null) {
    // '강원특별자치도' 같은 긴 형태 매치
    for (const [full, short] of Object.entries(SIDO_NORM)) {
      if (parts[0].startsWith(full) || parts[0] === short) { sido = short; break; }
    }
  }
  if (sido == null) {
    // 시/도 토큰이 없는 주소 (예: "강남구 역삼동" 만 있는 경우) — sido 비우고 다음으로
    sidoIdx = -1;
  }

  // 2) 시/군/구 — 광역시는 직접 "XX구", 도는 "XX시 YY구" 또는 "XX시" 또는 "XX군"
  let gu: string | null = null;
  let guEndIdx = sidoIdx;

  const afterSido = parts.slice(sidoIdx + 1);
  if (afterSido.length > 0) {
    const t0 = afterSido[0];
    if (sido && DIRECT_METRO.has(sido)) {
      // 광역시/특별시 — 바로 구
      if (/구$/.test(t0)) {
        gu = t0;
        guEndIdx = sidoIdx + 1;
      }
    } else {
      // 도 — "시" 다음에 "구" 가 올 수도 있음
      if (/[시군]$/.test(t0)) {
        const t1 = afterSido[1];
        if (t1 && /구$/.test(t1)) {
          // 수원시 장안구 형태
          gu = `${t0} ${t1}`;
          guEndIdx = sidoIdx + 2;
        } else {
          // 시흥시 / 가평군 (구 없음)
          gu = t0;
          guEndIdx = sidoIdx + 1;
        }
      } else if (/구$/.test(t0)) {
        // sido 생략된 형태 (예: "강남구 역삼동")
        gu = t0;
        guEndIdx = sidoIdx + 1;
      }
    }
  }

  // 3) 동/읍/면 — 구 다음 토큰
  let dong: string | null = null;
  const afterGu = parts.slice(guEndIdx + 1);
  if (afterGu.length > 0) {
    const t = afterGu[0];
    if (/[동읍면리가]$/.test(t)) {
      // "신림동", "오목교동", "정자1동", "학익1가" 등
      // 숫자 뒤 '동' 도 수용 (예: 정자1동)
      dong = t;
    }
  }

  return { sido, gu, dong };
}

/** 지도 줌(Kakao level)에서 어떤 행정구역 레벨로 클러스터링할지 반환 */
export type AdminLevel = 'sido' | 'gu' | 'dong' | 'individual';

export function adminLevelForZoom(level: number): AdminLevel {
  // Kakao level: 1 (가장 줌인) ~ 14 (가장 줌아웃)
  if (level <= 3) return 'individual';  // 근거리 — 개별 매물
  if (level <= 6) return 'dong';         // 중거리 — 동 단위
  if (level <= 9) return 'gu';           // 원거리 — 시군구
  return 'sido';                          // 광역 — 시도
}
