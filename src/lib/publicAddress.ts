// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 비로그인 사용자에게 노출되는 주소 마스킹 유틸
// - 로그인: 전체 주소 (지번·건물명·층까지)
// - 비로그인: 동 단위까지만 ("서울 강남구 논현동")
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 주소 문자열에서 "동/가/읍/면/리"로 끝나는 마지막 토큰까지만 남기고
 * 그 뒤의 지번·건물명·호수·층 정보는 전부 제거한다.
 *
 * 예시:
 *  "서울 강남구 논현동 232-17 우정빌딩 B1층" → "서울 강남구 논현동"
 *  "경기 성남시 분당구 정자동 15 로얄팰리스 101호" → "경기 성남시 분당구 정자동"
 *  "서울 마포구 합정동" → "서울 마포구 합정동" (그대로)
 */
export function maskAddressForPublic(
  address: string | null | undefined,
  dong?: string | null
): string {
  if (!address) return dong || '';
  const parts = address.trim().split(/\s+/).filter(Boolean);

  // 끝에서부터 역방향 스캔: 동/가/읍/면/리로 끝나는 토큰을 찾는다
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/[동가읍면리]$/.test(parts[i])) {
      return parts.slice(0, i + 1).join(' ');
    }
  }

  // 동 suffix가 없으면 첫 3개 토큰만 (시·구·구분) 보수적으로
  if (parts.length >= 3) return parts.slice(0, 3).join(' ');
  return dong || parts.join(' ');
}

/**
 * 로그인 여부에 따라 표시할 주소를 고른다.
 */
export function displayAddressByAuth(
  address: string | null | undefined,
  dong: string | null | undefined,
  authed: boolean
): string {
  if (authed) return address || dong || '';
  return maskAddressForPublic(address, dong);
}
