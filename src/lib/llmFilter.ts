// ─────────────────────────────────────────────────────────────────────────
// llmFilter — Claude/LLM 자연어 → 필터 변환 시 whitelist 스키마
//
// L-sec141 (2026-04-23): 원래 src/app/api/map/search-nl/route.ts 안에 있었는데,
//   Next.js App Router 는 route.ts 에서 HTTP 메서드(GET/POST/...) 와 특수값
//   (`dynamic`, `runtime`, `revalidate` 등) 외의 symbol 을 export 하면 빌드
//   타입 체크가 실패 ("Route ... does not match the required types"). 따라서
//   스키마/파서만 여기로 분리하고 route 는 import 만 한다.
//
// 설계 의도:
//   - Phase 1.2 에서 Claude API 로 자연어를 구조화된 필터로 변환할 예정.
//   - LLM 환각 필드(`sql`, `raw_where`, `table` 등)가 supabase 쿼리로
//     흘러가면 인젝션/정보 누출 위험 → strict() 로 허용 외 키는 parse 실패.
//   - 실패 시 null 반환 → 호출측은 규칙 파서로 fallback.
// ─────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

const StringArray = z.array(z.string().max(60)).max(20).optional();
const NumCapped = z.number().finite().min(0).max(1e12).optional();

export const LlmFilterSchema = z
  .object({
    keywords: StringArray,
    types: StringArray,
    dongs: StringArray,
    minPrice: NumCapped,
    maxPrice: NumCapped,
    minDeposit: NumCapped,
    maxDeposit: NumCapped,
    minMonthly: NumCapped,
    maxMonthly: NumCapped,
    minArea: NumCapped,
    maxArea: NumCapped,
  })
  .strict();

export type LlmFilterSafe = z.infer<typeof LlmFilterSchema>;

/**
 * LLM 이 반환한 JSON 을 whitelist 스키마로 파싱. 실패 시 null.
 * 호출측은 null 이면 LLM 결과 무시하고 규칙 파서로 fallback 해야 한다.
 */
export function parseLlmFilter(input: unknown): LlmFilterSafe | null {
  const r = LlmFilterSchema.safeParse(input);
  return r.success ? r.data : null;
}
