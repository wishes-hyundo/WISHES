import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { authorizeListingMutation, authorizeBulkListingMutation } from '@/lib/adminAuthz';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { audit } from '@/lib/auditLog';

const ALLOWED_FIELDS = [
  'title', 'description', 'type', 'deal',
  'deposit', 'monthly', 'price', 'maintenance_fee', 'maintenance_includes',
  'area_m2', 'area_supply_m2', 'area_land_m2',
  'floor_current', 'floor_total', 'rooms', 'bathrooms',
  'direction', 'heating_type', 'address', 'address_detail', 'dong', 'gu',
  'lat', 'lng', 'available_date', 'built_year',
  'parking', 'parking_spaces', 'elevator', 'pet', 'balcony', 'full_option', 'loan_available',
  'contact', 'contact_role', 'building_name', 'entrance_type',
  'base_price', 'lease_period', 'building_purpose', 'rights_fee',
  'vat_included', 'electric_capacity', 'commission_fee',
  'registered_date', 'last_confirmed', 'special_notes',
  'previous_business', 'recommended_business', 'restricted_business',
  'status',
];

// ─────────────────────────────────────────────────────────────────────────
// PUT: Update single listing fields
// L-sec136 (2026-04-23): A-crit-2 IDOR 수정 — authorizeListingMutation 적용.
// ─────────────────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  const ip = getClientIp(request);
  try {
    // H-2 (L-sec124): 필드 업데이트 IP rate limit (10m 120회)
    const rl = checkRateLimit({ key: `field-update:ip:${ip}`, limit: 120, windowMs: 10 * 60_000 });
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
    const { id, fields } = body;

    if (typeof id !== 'number' || !Number.isInteger(id)) {
      return NextResponse.json({ error: 'Listing ID is required (integer)' }, { status: 400 });
    }
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Fields object is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    // ── L-sec136 IDOR 가드 ──
    const authz = await authorizeListingMutation(request, id, supabase);
    if (!authz.ok) {
      audit({ action: 'listing.field_update.denied', actor: authz.actor, ip, target: { type: 'listing', id }, status: authz.status, meta: { reason: authz.reason } });
      return NextResponse.json({ error: authz.reason }, { status: authz.status });
    }

    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (ALLOWED_FIELDS.includes(key)) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('listings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase update error:', error);
      audit({ action: 'listing.field_update.error', actor: authz.actor, ip, target: { type: 'listing', id }, status: 500 });
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        { error: isDev ? error.message : '수정 실패' },
        { status: 500 },
      );
    }

    audit({
      action: 'listing.field_update.ok',
      actor: authz.actor,
      ip,
      target: { type: 'listing', id },
      status: 200,
      meta: { fields: Object.keys(updateData).filter((k) => k !== 'updated_at') },
    });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('PUT error:', err);
    audit({ action: 'listing.field_update.error', ip, status: 500, meta: { reason: 'exception' } });
    return NextResponse.json(
      { error: process.env.NODE_ENV !== 'production' ? err?.message : '수정 실패' },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POST: Bulk update multiple listings
// L-sec136 (2026-04-23): A-crit-2 IDOR 수정 + rate limit 추가.
// ─────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  try {
    // L-sec136: bulk 경로도 rate limit 추가 (기존 누락).
    const rl = checkRateLimit({ key: `field-update-bulk:ip:${ip}`, limit: 40, windowMs: 30 * 60_000 });
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
    const { updates } = body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'Updates array is required' }, { status: 400 });
    }

    if (updates.length > 50) {
      return NextResponse.json({ error: 'Max 50 updates per request' }, { status: 400 });
    }

    const supabase = createServerClient();

    // ── L-sec136 IDOR 가드: 요청된 id 중 본인 소유만 추려냄 ──
    const requestedIds: number[] = updates
      .map((u: any) => u?.id)
      .filter((id: unknown): id is number => typeof id === 'number' && Number.isInteger(id));

    if (requestedIds.length === 0) {
      return NextResponse.json({ error: 'No valid listing ids' }, { status: 400 });
    }

    const authz = await authorizeBulkListingMutation(request, requestedIds, supabase);
    if (!authz.ok) {
      audit({ action: 'listing.field_update_bulk.denied', actor: authz.actor, ip, status: authz.status, meta: { reason: authz.reason, requestedCount: requestedIds.length } });
      return NextResponse.json({ error: authz.reason }, { status: authz.status });
    }
    if (authz.ownedIds.length === 0) {
      audit({ action: 'listing.field_update_bulk.denied', actor: authz.actor, ip, status: 403, meta: { reason: 'no_owned_ids', requestedCount: requestedIds.length, filteredOut: authz.filteredOut.length } });
      return NextResponse.json(
        { error: '권한이 있는 매물이 없습니다', requested: requestedIds.length, skipped: authz.filteredOut.length },
        { status: 403 },
      );
    }

    const ownedSet = new Set(authz.ownedIds);
    const results: Array<{ id: any; success?: boolean; title?: string; skipped?: boolean }> = [];
    const errors: Array<{ id: any; error: string }> = [];

    for (const item of updates) {
      const { id, fields } = item;
      if (typeof id !== 'number' || !Number.isInteger(id) || !fields) {
        errors.push({ id, error: 'Missing id or fields' });
        continue;
      }
      if (!ownedSet.has(id)) {
        // L-sec136: 권한 없는 id 는 건너뛰고 표시
        results.push({ id, skipped: true });
        continue;
      }

      const updateData: Record<string, any> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (ALLOWED_FIELDS.includes(key)) {
          updateData[key] = value;
        }
      }

      if (Object.keys(updateData).length === 0) {
        errors.push({ id, error: 'No valid fields' });
        continue;
      }

      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('listings')
        .update(updateData)
        .eq('id', id)
        .select('id, title')
        .single();

      if (error) {
        errors.push({ id, error: error.message });
      } else {
        results.push({ id, success: true, title: (data as any)?.title });
      }
    }

    const updated = results.filter((r) => r.success).length;
    const skipped = results.filter((r) => r.skipped).length;

    audit({
      action: 'listing.field_update_bulk.ok',
      actor: authz.actor,
      ip,
      status: 200,
      meta: {
        requestedCount: requestedIds.length,
        ownedCount: authz.ownedIds.length,
        filteredOutCount: authz.filteredOut.length,
        updated,
        failed: errors.length,
        skipped,
        bypassed: authz.bypassed,
      },
    });

    return NextResponse.json({
      success: true,
      updated,
      failed: errors.length,
      skipped,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('POST error:', err);
    audit({ action: 'listing.field_update_bulk.error', ip, status: 500, meta: { reason: 'exception' } });
    return NextResponse.json(
      { error: process.env.NODE_ENV !== 'production' ? err?.message : '수정 실패' },
      { status: 500 },
    );
  }
}
