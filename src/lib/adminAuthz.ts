// ─────────────────────────────────────────────────────────────────────────
// adminAuthz — 공유 IDOR 가드
//
// L-sec136 (2026-04-23): L-sec112 에서 /api/admin/listings/[id] 용으로 만든
//   authorizeListingMutation 을 다른 admin mutation 엔드포인트에서도 일관되게
//   쓸 수 있도록 공용화. /api/admin/listings-bulk-delete, listings-bulk-update,
//   listings-field-update, contacts (PATCH) 가 지금까지 verifyAdminAuth 만
//   거쳐서 다른 중개사 매물/상담을 조작할 수 있는 상태였음 (A-crit-1, A-crit-2
//   in docs/L-audit-2026-04-23.md).
//
// 규약:
//   - master / crawler_bridge / superadmin 은 무제한 (운영 필요).
//   - agent 는 자신의 uid === listings.created_by 여야 함.
//   - created_by null 레거시 매물은 unlimited role 만 건드릴 수 있음 (보수적).
//
// 참고: /api/admin/listings/[id] 의 local authorizeListingMutation 은 일단
//   그대로 둔다 — 리팩터링 시 블래스트 반경을 키우지 않기 위함. 후속 커밋에서
//   해당 파일도 본 lib 를 import 하도록 통합 예정.
// ─────────────────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdminAuthWithContext } from './adminAuth';

export type AuthzActor = { email?: string; role?: string; uid?: string };

export type AuthzSingleResult =
  | { ok: true; actor: AuthzActor }
  | { ok: false; status: number; reason: string; actor?: AuthzActor };

export type AuthzBulkResult =
  | {
      ok: true;
      actor: AuthzActor;
      /** mutation 해도 안전한 id 들. 호출측은 반드시 이 집합만 .in('id', ownedIds) 로 다시 걸어야 한다. */
      ownedIds: number[];
      /** 권한 없어서 필터아웃된 id 들. audit log / 응답 구성에 사용. */
      filteredOut: number[];
      /** unlimited role 이라 소유자 체크를 우회한 경우 true. */
      bypassed: boolean;
    }
  | { ok: false; status: number; reason: string; actor?: AuthzActor };

// Phase 1 (2026-04-28): 5단계 enum 도입. owner = 신 superadmin, admin 등급도 unlimited 추가.
//   master / crawler_bridge / internal_bearer = 토큰 기반 운영 role
//   superadmin / owner = 사장님 (legacy + 신 라벨 양립)
//   admin = Owner 외 모든 + Pending 승인 권한 (broker 매물 unlimited 우회 OK)
const UNLIMITED_ROLES = new Set([
  'master', 'crawler_bridge', 'internal_bearer',
  'superadmin', 'owner', 'admin',
]);

/**
 * 단건 매물 mutation 권한.
 * L-sec112 authorizeListingMutation 과 규약 동일. 다른 엔드포인트에서 재사용.
 */
export async function authorizeListingMutation(
  request: NextRequest,
  listingId: number,
  supabase: SupabaseClient,
): Promise<AuthzSingleResult> {
  const ctx = await verifyAdminAuthWithContext(request);
  if (!ctx.ok) return { ok: false, status: 401, reason: '인증 실패' };
  const actor: AuthzActor = { email: ctx.email, role: ctx.role, uid: ctx.uid };

  if (ctx.role && UNLIMITED_ROLES.has(ctx.role)) return { ok: true, actor };
  if (!ctx.uid) return { ok: false, status: 403, reason: '권한이 없습니다', actor };

  const { data: owner } = await supabase
    .from('listings')
    .select('created_by')
    .eq('id', listingId)
    .maybeSingle();

  if (!owner) return { ok: false, status: 404, reason: '매물을 찾을 수 없습니다', actor };
  const createdBy = (owner as { created_by: string | null }).created_by;
  if (!createdBy || createdBy !== ctx.uid) {
    return { ok: false, status: 403, reason: '본인 매물만 변경할 수 있습니다', actor };
  }
  return { ok: true, actor };
}

/**
 * 대량 매물 mutation 권한 — 소유한 id 만 필터해서 돌려준다.
 *
 * 사용 패턴:
 *   const authz = await authorizeBulkListingMutation(request, requestedIds, supabase);
 *   if (!authz.ok) return NextResponse.json({...}, { status: authz.status });
 *   if (authz.ownedIds.length === 0) return NextResponse.json(
 *     { success: false, error: '권한이 있는 매물이 없습니다' }, { status: 403 });
 *   // 이제 authz.ownedIds 로 .in() 필터 후 mutation
 *
 * 중요:
 *   - 호출측은 반드시 `authz.ownedIds` 만 DB 조작에 사용해야 함. 원본 ids 를 쓰면 IDOR 재발.
 *   - unlimited role 은 모든 id 통과 (bypassed=true).
 */
export async function authorizeBulkListingMutation(
  request: NextRequest,
  ids: number[],
  supabase: SupabaseClient,
): Promise<AuthzBulkResult> {
  const ctx = await verifyAdminAuthWithContext(request);
  if (!ctx.ok) return { ok: false, status: 401, reason: '인증 실패' };
  const actor: AuthzActor = { email: ctx.email, role: ctx.role, uid: ctx.uid };

  if (ctx.role && UNLIMITED_ROLES.has(ctx.role)) {
    return { ok: true, actor, ownedIds: [...ids], filteredOut: [], bypassed: true };
  }
  if (!ctx.uid) return { ok: false, status: 403, reason: '권한이 없습니다', actor };
  if (ids.length === 0) return { ok: true, actor, ownedIds: [], filteredOut: [], bypassed: false };

  const { data: owned } = await supabase
    .from('listings')
    .select('id')
    .in('id', ids)
    .eq('created_by', ctx.uid);

  const ownedSet = new Set(((owned || []) as Array<{ id: number }>).map((r) => r.id));
  const ownedIds = ids.filter((id) => ownedSet.has(id));
  const filteredOut = ids.filter((id) => !ownedSet.has(id));
  return { ok: true, actor, ownedIds, filteredOut, bypassed: false };
}
