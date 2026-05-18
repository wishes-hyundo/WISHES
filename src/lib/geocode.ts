// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 공통 지오코딩 유틸 (Kakao Local API 기반)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// - 주소 → 위도/경도 변환 (건물명·층·호수 제거 후 다단계 폴백)
// - admin/listings POST/PUT, admin/geocode-listings 배치에서 공통 사용
// - 2026-04-20: 신규 매물 등록 시 서버단 자동 지오코딩 훅 필요해져 뽑아냄

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

// [Step F-3 fix 2026-05-18] analyze_type=exact 명시 + address_type 검증
//   결함: 기본 'similar' = 동/리 중심좌표 (REGION) 도 첫 결과로 받음
//   수정: 1차 exact + address_type 검증 (REGION 거부), 2차 similar fallback
//   효과: 동 중심좌표 제거 = fallback 1,892 의 향후 발생 차단
async function kakaoAddress(q: string) {
  try {
    // 1차: exact (정확 매칭)
    let res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}&analyze_type=exact`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    if (res.ok) {
      const d = await res.json();
      const doc = d?.documents?.[0];
      // address_type 검증: REGION (동/리 중심) 거부, ROAD/JIBUN 만 신뢰
      if (doc && doc.address_type !== 'REGION') {
        return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
      }
    }
    // 2차: similar (부분 매칭) — REGION 거부 유지
    res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}&analyze_type=similar`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const doc = d?.documents?.[0];
    if (!doc || doc.address_type === 'REGION') return null;
    return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
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
    const normalized = c.replace(/\s+\d{5,