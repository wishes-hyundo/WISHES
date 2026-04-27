import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { authorizeBulkListingMutation } from '@/lib/adminAuthz';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { audit } from '@/lib/auditLog';

// L-sec3 (2026-04-22): 박제 ADMIN_TOKEN = 'wishes2026' 제거 → verifyAdminAuth
// L-sec136 (2026-04-23): A-crit-2 IDOR 수정.
//   기존 코드는 verifyAdminAuth 만 통과하면 item.id 로 다른 중개사 매물까지
//   필드를 임의로 수정할 수 있었음 (건축물대장·AI 필드 포함). authorizeBulkListingMutation
//   으로 소유 id 만 걸러낸 뒤 mutation.

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // H-2 (L-sec124): 대량 업데이트 IP rate limit (1h 20회)
  const rl = checkRateLimit({ key: `bulk-update:ip:${ip}`, limit: 20, windowMs: 60 * 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    // L-sec136: createServerClient 사용으로 일관화 (기존: service_role key 직접 createClient).
    //   authz 가드가 uid 매칭을 하므로 service_role 필요 없음. 최소권한 원칙.
    const supabase = createServerClient();
    const body = await request.json();
    const { listings } = body;

    if (!listings || !Array.isArray(listings) || listings.length === 0) {
      return NextResponse.json({ error: 'listings array required' }, { status: 400 });
    }

    // Max 100 per request
    const batch = listings.slice(0, 100);

    // ── L-sec136 IDOR 가드: 요청된 id 중 본인 소유만 추려냄 ──
    const requestedIds: number[] = batch
      .map((item: any) => item?.id)
      .filter((id: unknown): id is number => typeof id === 'number' && Number.isInteger(id));

    if (requestedIds.length === 0) {
      return NextResponse.json({ error: 'No valid listing ids' }, { status: 400 });
    }

    const authz = await authorizeBulkListingMutation(request, requestedIds, supabase);
    if (!authz.ok) {
      audit({ action: 'listing.bulk_update.denied', actor: authz.actor, ip, status: authz.status, meta: { reason: authz.reason, requestedCount: requestedIds.length } });
      return NextResponse.json({ error: authz.reason }, { status: authz.status });
    }
    if (authz.ownedIds.length === 0) {
      audit({ action: 'listing.bulk_update.denied', actor: authz.actor, ip, status: 403, meta: { reason: 'no_owned_ids', requestedCount: requestedIds.length, filteredOut: authz.filteredOut.length } });
      return NextResponse.json(
        { success: false, error: '권한이 있는 매물이 없습니다', requested: requestedIds.length, skipped: authz.filteredOut.length },
        { status: 403 },
      );
    }

    const ownedSet = new Set(authz.ownedIds);
    const results: Array<{ id: any; success: boolean; error?: string; skipped?: boolean }> = [];

    for (const item of batch) {
      try {
        if (typeof item?.id !== 'number' || !Number.isInteger(item.id)) {
          results.push({ id: item?.id, success: false, error: 'invalid id' });
          continue;
        }
        if (!ownedSet.has(item.id)) {
          // L-sec136: 권한 없는 id 는 조용히 skip
          results.push({ id: item.id, success: false, skipped: true, error: 'forbidden' });
          continue;
        }

        const updateData: Record<string, unknown> = {};

        // Building registry fields
        if (item.built_year !== undefined) updateData.built_year = item.built_year;
        if (item.floor_total !== undefined) updateData.floor_total = item.floor_total;
        if (item.bathrooms !== undefined) updateData.bathrooms = item.bathrooms;
        if (item.area_m2 !== undefined) updateData.area_m2 = item.area_m2;
        if (item.area_supply_m2 !== undefined) updateData.area_supply_m2 = item.area_supply_m2;
        if (item.area_land_m2 !== undefined) updateData.area_land_m2 = item.area_land_m2;
        if (item.elevator !== undefined) updateData.elevator = item.elevator;
        if (item.parking !== undefined) updateData.parking = item.parking;
        if (item.heating_type !== undefined) updateData.heating_type = item.heating_type;
        if (item.direction !== undefined) updateData.direction = item.direction;
        if (item.rooms !== undefined) updateData.rooms = item.rooms;

        // AI generated fields
        if (item.title !== undefined) updateData.title = item.title;
        if (item.description !== undefined) updateData.description = item.description;

        // Phase 1-5 (2026-04-28): status / is_problematic / problematic_* 처리
        if (item.status !== undefined) updateData.status = item.status;
        if (item.is_problematic !== undefined) updateData.is_problematic = item.is_problematic;
        if (item.problematic_reason !== undefined) updateData.problematic_reason = item.problematic_reason;
        if (item.problematic_marked_at !== undefined) updateData.problematic_marked_at = item.problematic_marked_at;

        if (Object.keys(updateData).length === 0) {
          results.push({ id: item.id, success: false, error: 'No fields to update' });
          continue;
        }

        updateData.updated_at = new Date().toISOString();

        const { error } = await supabase
          .from('listings')
          .update(updateData)
          .eq('id', item.id);

        if (error) {
          results.push({ id: item.id, success: false, error: error.message });
        } else {
          results.push({ id: item.id, success: true });
        }
      } catch (err) {
        results.push({ id: item?.id, success: false, error: String(err) });
      }
    }

    const totalSuccess = results.filter(r => r.success).length;
    const totalSkipped = results.filter(r => r.skipped).length;
    const totalFailed = results.filter(r => !r.success && !r.skipped).length;

    audit({
      action: 'listing.bulk_update.ok',
      actor: authz.actor,
      ip,
      status: 200,
      meta: {
        requestedCount: requestedIds.length,
        ownedCount: authz.ownedIds.length,
        filteredOutCount: authz.filteredOut.length,
        updated: totalSuccess,
        skipped: totalSkipped,
        failed: totalFailed,
        bypassed: authz.bypassed,
      },
    });

    return NextResponse.json({
      success: true,
      processed: batch.length,
      totalSuccess,
      totalFailed,
      totalSkipped,
      results,
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    audit({ action: 'listing.bulk_update.error', ip, status: 500, meta: { reason: 'exception' } });
    return NextResponse.json(
      { error: 'Bulk update failed', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  return NextResponse.json({
    endpoint: '/api/admin/listings-bulk-update',
    method: 'POST',
    description: 'Bulk update listing fields (building registry + AI generated)',
    body: {
      listings: '[{id, built_year, floor_total, bathrooms, area_m2, area_supply_m2, elevator, parking, title, description, ...}]'
    },
    limits: { maxBatchSize: 100 },
    authorization: 'agent: 본인 소유 id 만 업데이트. master/superadmin/crawler_bridge: 전체 가능.',
  });
}
