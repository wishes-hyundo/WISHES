// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PostgREST / ILIKE 인자 escape 유틸.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// L-sec131 (2026-04-23): L-sec126 에서 /api/ai/match 에 인라인으로 두었던
// escapeIlike 를 공용 lib 로 승격.
//   1) 다른 라우트(/api/listings, /api/map/search 등) 도 동일 규칙 재사용 가능
//   2) unit test 하나로 회귀 보호 (이전에 L-sec114 가 인라인 버전에서 누락된
//      이력 있음 → 공용화하면 같은 실수 재발 시 테스트가 즉시 실패)
//
// PostgREST .ilike() / .like() 는 SQL LIKE 문법을 그대로 사용하므로
// %, _, \ 세 메타문자가 사용자 입력에 섞이면 predicate 의미가 바뀐다.
//   '%foo%'  → wildcard 포함 전체 매칭 (의도)
//   '%50\\%%' → '50%' 리터럴 매칭 (의도적 escape 필요)
//
// 규칙: %, _, \ 를 각각 \%, \_, \\ 로 치환.

/**
 * PostgREST .ilike() / .like() 에 사용자 입력을 붙일 때 와일드카드 escape.
 *
 * @example
 *   q.ilike('name', `%${escapeIlike(userQuery)}%`);
 */
export function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}
