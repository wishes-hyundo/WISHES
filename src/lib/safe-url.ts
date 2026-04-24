// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-sec95 (2026-04-22): URL scheme 화이트리스트 (XSS 차단)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 🎯 목적
//   크롤러/관리자/외부 데이터에서 온 URL 을 <a href>, <iframe src>, <img src>
//   등에 렌더링할 때 javascript: / data: / vbscript: / file: 등 위험 scheme
//   이 통과되지 않도록 http(s) 만 화이트리스트로 허용.
//
// ⚠️ 배경
//   React 19 는 href="javascript:..." 를 경고만 하고 실제로 렌더링한다 (차단 X).
//   크롤링 매물의 source_url, 사용자가 입력하는 vr_url 등 DB/입력 경로로
//   들어온 URL 을 그대로 href 에 넣으면 클릭 시 arbitrary script 가 실행될 수 있음.
//
// 📌 사용
//   const safe = safeHttpUrl(listing.source_url);
//   return safe ? <a href={safe}>원본</a> : null;
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * http(s) 로 시작하는 URL 만 통과. 그 외(javascript:, data:, vbscript:, file:, mailto:, tel:, 상대 경로, 공백 등)는 null.
 * 입력을 trim 하고 내부 control char (NUL, tab, newline) 을 제거하여
 * `\tjavascript:alert(1)` 같은 우회 시도도 차단한다.
 */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // 1) trim + control char strip (scheme 파싱 전 정규화)
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned) return null;

  // 2) 엄격 scheme 매칭 — http:// 또는 https:// 프리픽스 필수
  //    (대소문자 무시. 콜론 주변 공백/control char 는 위 strip 으로 제거됨)
  if (!/^https?:\/\//i.test(cleaned)) return null;

  // 3) URL 파서로 재검증 — malformed URL 은 거부
  try {
    const u = new URL(cleaned);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * safeHttpUrl 과 같지만 허용 protocol 을 추가 지정할 수 있다.
 * 예) tel:/mailto: 허용 필요한 어드민 연락처 UI 등.
 */
export function safeUrlWithSchemes(
  raw: unknown,
  allowedProtocols: readonly string[],
): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned) return null;
  try {
    const u = new URL(cleaned);
    if (!allowedProtocols.includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
