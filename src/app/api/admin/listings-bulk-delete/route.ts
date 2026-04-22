import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { authorizeBulkListingMutation } from '@/lib/adminAuthz';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { audit } from '@/lib/auditLog';

/**
 * POST /api/admin/listings-bulk-delete
 * Body: { ids: number[] } — max 500 per request
 * Or: { source_site: string } — delete all by source_site (unlimited role only)
 *
 * L-sec136 (2026-04-23): A-crit-2 IDOR 수정.
 *   기존 코드는 verifyAdminAuth 만 통과하면 어떤 토큰이든 다른 중개사 매물을
 *   대량 삭제할 수 있었음. authorizeBulkListingMutation 으로 소유 id 만 필터링.
 *   source_site 경로는 "전체 source 대량 삭제" 라서 unlimited role 에게만 허용.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  try {
    // H-2 (L-sec124 2026-04-22): 대량 삭제 IP rate limit.
    //   정상 운영: 1시간 10회 이내. 단일 토큰 유출 시 자동화 삭제 대량 방지.
    const rl = checkRateLimit({ key: `bulk-delete:ip:${ip}`, limit: 10, windowMs: 60 * 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const supabase = createServerClient();

    // Option 1: Delete by source_site (unlimited role only)
    if (body.source_site && typeof body.source_site === 'string') {
      // L-sec47 (2026-04-22): source_site 길이 cap — .eq() 는 안전하지만 방어선
      const sourceSite = body.source_site.slice(0, 60);

      // L-sec136: source_site 전체 삭제는 unlimited role (master / crawler_bridge /
      //   superadmin) 만 허용. agent 는 소유 id 로만 삭제하도록 강제.
      const authz = await authorizeBulkListingMutation(request, [], supabase);
      if (!authz.ok) {
        audit({ action: 'listing.bulk_delete.denied', actor: authz.actor, ip, status: authz.status, meta: { reason: authz.reason, mode: 'source_site', sourceSite } });
        return NextResponse.json({ error: authz.reason }, { status: authz.status });
      }
      if (!authz.bypassed) {
        audit({ action: 'listing.bulk_delete.denied', actor: authz.actor, ip, status: 403, meta: { reason: 'source_site_requires_unlimited_role', mode: 'source_site', sourceSite } });
        return NextResponse.json(
          { error: 'source_site 대량 삭제는 master 역할만 수행할 수 있습니다' },
          { status: 403 },
        );
      }

      // L-ts1 (2026-04-22): .select('id', { count: 'exact' }) 는 delete→select 체인에서
      //   TS 오버로드가 없음. 어차피 `data?.length` 로 충분하므로 count 옵션 제거.
      const { data, error } = await supabase
        .from('listings')
        .delete()
        .eq('source_site', sourceSite)
        .select('id');

      if (error) {
        console.error('Bulk delete by source_site error:', error);
        audit({ action: 'listing.bulk_delete.error', actor: authz.actor, ip, status: 500, meta: { mode: 'source_site', sourceSite } });
        // L-sec47: prod 에서는 DB error.message 숨김
        const isDev = process.env.NODE_ENV !== 'production';
        return NextResponse.json(
          { success: false, error: isDev ? error.message : '삭제 실패' },
          { status: 500 }
        );
      }

      const deleted = data?.length || 0;
      audit({
        action: 'listing.bulk_delete.ok',
        actor: authz.actor,
        ip,
        status: 200,
        meta: { mode: 'source_site', sourceSite, deleted, bypassed: true },
      });

      return NextResponse.json({
        success: true,
        deleted,
        message: `source_site='${sourceSite}' 매물 삭제 완료`,
      });
    }

    // Option 2: Delete by IDs array
    if (body.ids && Array.isArray(body.ids)) {
      if (body.ids.length > 500) {
        return NextResponse.json(
          { error: 'Max 500 IDs per request' },
          { status: 400 }
        );
      }

      const ids = body.ids.filter((id: unknown): id is number => typeof id === 'number' && Number.isInteger(id));
      if (ids.length === 0) {
        return NextResponse.json(
          { error: 'No valid IDs provided' },
          { status: 400 }
        );
      }

      // ── L-sec136 IDOR 가드 ──
      const authz = await authorizeBulkListingMutation(request, ids, supabase);
      if (!authz.ok) {
        audit({ action: 'listing.bulk_delete.denied', actor: authz.actor, ip, status: authz.status, meta: { reason: authz.reason, mode: 'ids', requestedCount: ids.length } });
        return NextResponse.json({ error: authz.reason }, { status: authz.status });
      }
      if (authz.ownedIds.length === 0) {
        audit({ action: 'listing.bulk_delete.denied', actor: authz.actor, ip, status: 403, meta: { reason: 'no_owned_ids', mode: 'ids', requestedCount: ids.length, filteredOut: authz.filteredOut.length } });
        return NextResponse.json(
          { success: false, error: '권한이 있는 매물이 없습니다', requested: ids.length, skipped: authz.filteredOut.length },
          { status: 403 }
        );
      }

      const { data, error } = await supabase
        .from('listings')
        .delete()
        .in('id', authz.ownedIds)
        .select('id');

      if (error) {
        console.error('Bulk delete by IDs error:', error);
        audit({ action: 'listing.bulk_delete.error', actor: authz.actor, ip, status: 500, meta: { mode: 'ids', requestedCount: ids.length, ownedCount: authz.ownedIds.length } });
        // L-sec47: prod 에서는 DB error.message 숨김
        const isDev = process.env.NODE_ENV !== 'production';
        return NextResponse.json(
          { success: false, error: isDev ? error.message : '삭제 실패' },
          { status: 500 }
        );
      }

      const deleted = data?.length || 0;
      audit({
        action: 'listing.bulk_delete.ok',
        actor: authz.actor,
        ip,
        status: 200,
        meta: {
          mode: 'ids',
          requestedCount: ids.length,
          ownedCount: authz.ownedIds.length,
          filteredOutCount: authz.filteredOut.length,
          deleted,
          bypassed: authz.bypassed,
        },
      });

      // L-sec136: 권한 없어서 skip 된 id 의 개수만 노출 (id 리스트 자체는 info leak 방지)
      return NextResponse.json({
        success: true,
        deleted,
        requested: ids.length,
        skipped: authz.filteredOut.length,
      });
    }

    return NextResponse.json(
      { error: 'Provide either { ids: number[] } or { source_site: string }' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Bulk delete error:', error);
    audit({ action: 'listing.bulk_delete.error', ip, status: 500, meta: { reason: 'exception' } });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
