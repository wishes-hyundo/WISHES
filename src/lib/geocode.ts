// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 공통 지오코딩 유틸 (Kakao Local API 기반)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// - 주소 → 위도/경도 변환 (건물명·층·호수 제거 후 다단계 폴백)
// - admin/listings POST/PUT, admin/geocode-listings 배치에서 공통 사용
// - 2026-04-20: 신규 매물 등록 시 서버단 자동 지오코딩 훅 필요해져 뽑아냄

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

async function kakaoAddress(q: string) {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const doc = d?.documents?.[0];
    return doc ? { lat: parseFloat(doc.y), lng: parseFloat(doc.x) } : null;
  } catch {
    return null;
  }
}

async function kakaoKeyword(q: string) {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const doc = d?.documents?.[0];
    return doc ? { lat: parseFloat(doc.y), lng: parseFloat(doc.x) } : null;
  } catch {
    return null;
  }
}

/**
 * 주소 정리: 건물명/층/호수를 제거해 Kakao 주소 API 매칭률을 높인다.
 */
function cleanAddress(raw: string): string[] {
  const candidates = new Set<string>();
  const s = (raw || '').trim();
  if (!s) return [];
  candidates.add(s);

  // 행정구역 prefix 로 시작하는 부분 추출
  const m1 = s.match(/(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주).*/);
  if (m1) candidates.add(m1[0]);

  // 뒷부분 층/호/동 정보 제거
  for (const c of [...candidates]) {
    const stripped = c
      .replace(/\s*(?:지하|B)?\s*\d+\s*층.*$/, '')
      .replace(/\s*\d+\s*호.*$/, '')
      .replace(/\s*\d+\s*동\s*\d+\s*호.*$/, '')
      .trim();
    if (stripped && stripped !== c) candidates.add(stripped);
  }

  // 이상 주소 꼬리 숫자 제거
  for (const c of [...candidates]) {
    const normalized = c.replace(/\s+\d{5,}$/, '').trim();
    if (normalized && normalized !== c) candidates.add(normalized);
  }

  return [...candidates].filter((x) => x.length >= 3);
}

/**
 * 주소를 위도/경도로 변환.
 *   1차: 원본 + 정리 후보 주소 API
 *   2차: 키워드 API
 *   3차: 동 이름 중심좌표
 */
export async function geocodeAddress(
  address: string | null | undefined
): Promise<{ lat: number; lng: number } | null> {
  if (!address || !KAKAO_REST_API_KEY) return null;

  const candidates = cleanAddress(address);

  // 1차: 주소 API
  for (const c of candidates) {
    const hit = await kakaoAddress(c);
    if (hit) return hit;
  }

  // 2차: 키워드 API
  for (const c of candidates) {
    const hit = await kakaoKeyword(c);
    if (hit) return hit;
  }

  // 3차: 동 이름 중심좌표 — [2026-05-15 사장님 명령] 제거됨
  //   원인: 주소 매칭 실패 시 "동 이름만" 으로 fallback 하면 같은 동의 다른 매물들이
  //         모두 같은 좌표 (동 중심) 에 표시됨. 정밀분석 결과 11,992건 (활성의 18.5%)
  //         가 이 fallback 으로 잘못된 위치에 찍혀있었음.
  //   대안: 정확하게 매칭 안 되면 null 반환 → 해당 매물 lat/lng 채우지 않음.
  //         지도에 안 보이는 게 잘못된 위치에 보이는 것보다 나음.
  return null;
}
