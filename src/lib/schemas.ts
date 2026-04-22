// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 공용 Zod 스키마 허브
// L-hub1 (2026-04-22): 92개 API route 중 11개만 zod 적용 상태.
//   route 마다 z.object 를 중복 선언하던 패턴을 허브 기반으로 통합.
//   신규/리팩토링 route 는 여기서 스키마를 import 하고, 프로젝트별 필드는
//   listingCreateSchema 처럼 로컬에서 extend 한다.
//
// 사용 예:
//   import { listingIdSchema, paginationSchema, bboxSchema } from '@/lib/schemas';
//
//   const parsed = listingIdSchema.safeParse(searchParams.get('id'));
//   if (!parsed.success) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
//
// 주의:
//   - 각 스키마는 "공격 표면 감소" 가 목적. cap 값은 route 가 아닌
//     여기에서 1회 결정하여 전수 일관성 확보.
//   - 새로운 공용 스키마를 추가할 때는 주석으로 적용 route 리스트를 남긴다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { z } from 'zod';

// ── Identifiers ────────────────────────────────────────────────────────

/** 매물 ID — DB bigint, 0 이상 / 20억 이하 (cap 목적) */
export const listingIdSchema = z.coerce
  .number()
  .int('id must be integer')
  .nonnegative('id must be >= 0')
  .max(2_000_000_000, 'id too large');

/** UUID v4 (Supabase auth.users.id 등) */
export const uuidSchema = z.string().uuid('invalid uuid');

/** 단축 URL base62 코드 (shortCode.ts 규칙과 동기) */
export const shortCodeSchema = z
  .string()
  .regex(/^[0-9A-Za-z]{4,12}$/, 'invalid short code');

// L-hub3 (2026-04-22): OAuth 공용 스키마.
//   Naver/Kakao/Google OAuth 토큰 교환 시 code/state 입력 검증 중복 제거.

/** OAuth authorization_code — 1~512자 */
export const oauthCodeSchema = z.string().min(1).max(512);

/** OAuth state nonce — 클라이언트가 생성한 CSRF 토큰, 256자 cap */
export const oauthStateSchema = z.string().max(256);

// ── Pagination ─────────────────────────────────────────────────────────

/** 공용 페이지네이션 — limit ∈ [1, 100], offset ∈ [0, 100000] */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

/** 커서 기반 페이지네이션 — opaque cursor string */
export const cursorPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});

// ── Geography ──────────────────────────────────────────────────────────

/** 경도: WGS84 표준 범위 [-180, 180] */
export const longitudeSchema = z.coerce
  .number()
  .min(-180, 'lng out of range')
  .max(180, 'lng out of range')
  .refine((v) => Number.isFinite(v), 'lng must be finite');

/** 위도: WGS84 표준 범위 [-90, 90] */
export const latitudeSchema = z.coerce
  .number()
  .min(-90, 'lat out of range')
  .max(90, 'lat out of range')
  .refine((v) => Number.isFinite(v), 'lat must be finite');

/** bbox: "sw_lng,sw_lat,ne_lng,ne_lat" 문자열 → 객체 파싱 */
export const bboxSchema = z
  .string()
  .min(7)
  .max(120)
  .transform((raw, ctx) => {
    const parts = raw.split(',').map((s) => Number(s.trim()));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      ctx.addIssue({ code: 'custom', message: 'bbox must be 4 finite numbers' });
      return z.NEVER;
    }
    const [swLng, swLat, neLng, neLat] = parts;
    if (swLng < -180 || swLng > 180 || neLng < -180 || neLng > 180) {
      ctx.addIssue({ code: 'custom', message: 'bbox lng out of range' });
      return z.NEVER;
    }
    if (swLat < -90 || swLat > 90 || neLat < -90 || neLat > 90) {
      ctx.addIssue({ code: 'custom', message: 'bbox lat out of range' });
      return z.NEVER;
    }
    if (swLng > neLng || swLat > neLat) {
      ctx.addIssue({ code: 'custom', message: 'bbox sw must be < ne' });
      return z.NEVER;
    }
    return { swLng, swLat, neLng, neLat };
  });

/** zoom level 0~22 (Kakao/MapLibre 공용) */
export const zoomSchema = z.coerce.number().min(0).max(22);

// ── User-input strings ─────────────────────────────────────────────────

/** 사용자 이름 — 2~100자 */
export const nameSchema = z
  .string()
  .trim()
  .min(2, '이름을 입력해주세요')
  .max(100, '이름이 너무 깁니다');

/** 휴대폰 번호 — 숫자/+/- 포함 9~30자 */
export const phoneSchema = z
  .string()
  .trim()
  .min(9, '휴대폰 번호를 입력해주세요')
  .max(30, '휴대폰 번호가 너무 깁니다')
  .regex(/^[0-9+\-\s()]+$/, 'digits and +-() allowed');

/** 이메일 — 200자 cap (RFC 5321 은 254) */
export const emailSchema = z
  .string()
  .trim()
  .email('invalid email format')
  .max(200, 'email too long');

/** 선택 이메일 (빈 문자열 허용) */
export const optionalEmailSchema = emailSchema.optional().or(z.literal(''));

// L-hub3 (2026-04-22): partial update 전용 loose variants.
//   profile PUT, admin/contacts PATCH 같은 곳에서 빈 문자열/미변경 필드 허용.
//   max cap 은 strict 와 동일하나 min 제약을 제거 → 선택 필드 안전 재사용.

/** 이름 loose — 100자 cap, min 없음 (profile partial update 용) */
export const nameLooseSchema = z.string().max(100);

/** 휴대폰 loose — 30자 cap, min 없음, 포맷 검증 유지 */
export const phoneLooseSchema = z
  .string()
  .max(30)
  .regex(/^[0-9+\-\s()]*$/, 'digits and +-() allowed');

/** 메모 / note — 500자 cap */
export const noteSchema = z.string().max(500).optional().nullable();

/** 자유 입력 검색어 — 1~200자 */
export const searchQuerySchema = z.string().trim().min(1).max(200);

// ── Dates ──────────────────────────────────────────────────────────────

/** YYYY-MM-DD 형식 날짜 문자열 */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required');

/** ISO 8601 datetime */
export const isoDatetimeSchema = z.string().datetime({ offset: true });

// ── Money / Listing domain ─────────────────────────────────────────────

/** 가격 원화 단위 — 0 이상 / 1조 미만 */
export const priceWonSchema = z.coerce
  .number()
  .int()
  .nonnegative()
  .max(1_000_000_000_000, 'price too large');

/** 면적 m² — 0 이상 / 10만 이하 */
export const areaSqmSchema = z.coerce.number().nonnegative().max(100_000);

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * safeParse 후 실패 시 표준 400 JSON 응답을 돌려주는 가드.
 * 성공 시 parsed.data 반환, 실패 시 NextResponse 반환.
 *
 * 사용 예:
 *   const parsed = parseOrBadRequest(bodySchema, body);
 *   if (parsed instanceof NextResponse) return parsed;
 *   const { ... } = parsed;
 */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };
export function tryParse<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const firstIssue = r.error.issues[0];
  return { ok: false, error: firstIssue?.message || 'invalid input' };
}
