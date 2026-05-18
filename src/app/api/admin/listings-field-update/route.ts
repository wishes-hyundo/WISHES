import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { authorizeListingMutation, authorizeBulkListingMutation } from '@/lib/adminAuthz';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { audit } from '@/lib/auditLog';
import { geocodeAddress } from '@/lib/geocode';

// [Step F-7 fix 2026-05-18] 한국 영토 좌표 범위 검증
function isValidKoreaCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return true;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

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
  // L-cascade1 (2026-04-27 v3 세션): AI 생성 칸도 cascade 보호 대상
  'ai_description', 'seo_meta_description', 'seo_keywords', 'seo_tags', 'ai_title',
];

// ─────────────────────────────────────────────────────────────────────────
// PUT: Update single listing fields
// L-sec136 (2026-04-23): A-crit-2 IDOR 수정 — authorizeListingMutation 적용.
// L-cascade1 (2026-04-27 v3): 변경된 칸 → field_sources['X']='broker' 자동 표시.
//   효과: cron / 일괄 backfill 이 broker 잠금 칸 절대 안 덮어씀 (Phase 0-D 완성).
// ─────────────────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  const ip = getClientIp(request);
  try {
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

    const authz = await authorizeListingMutation(request, id, supabase);
    if (!authz.ok) {
      audit({ action: 'listing.field_update.denied', actor: authz.actor, ip, target: { type: 'listing', id }, status: authz.status, meta: { reason: authz.reason } });
      return NextResponse.json({ error: authz.reason }, { status: authz.status });
    }

    const updateData: Record<string, unknown> = {};
    const newSources: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (ALLOWED_FIELDS.includes(key)) {
        updateData[key] = value;
        // L-cascade1: 중개사 직접 수정 → broker 잠금 (status 는 운영 메타라 제외)
        if (key !== 'status') {
          newSources[key] = 'broker';
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // [Step F-7 fix 2026-05-18] lat/lng 한국 영토 범위 검증
    if ('lat' in updateData || 'lng' in updateData) {
      const newLat = (updateData.lat as number | null | undefined);
      const newLng = (updateData.lng as number | null | undefined);
      if (!isValidKoreaCoord(newLat, newLng)) {
        return NextResponse.json(
          { error: '좌표가 한국 영토 범위를 벗어났습니다 (lat 33~39, lng 124~132)' },
          { status: 400 },
        );
      }
    }

    // L-cascade1: 기존 field_sources fetch 후 broker 표시 병합 + M-3 address 변경 감지용
    let existingRow: { field_sources?: Record<string, string>; address?: string | null; lat?: number | null; lng?: number | null } | null = null;
    if (Object.keys(newSources).length > 0 || 'address' in updateData) {
      const { data: existing } = await supabase
        .from('listings')
        .select('field_sources, address, lat, lng')
        .eq('id', id)
        .single();
      existingRow = existing as any;
      if (Object.keys(newSources).length > 0) {
        const existingFs = (existingRow?.field_sources as Record<string, string>) || {};
        updateData.field_sources = { ...existingFs, ...newSources };
      }
    }

    // [Step M-3 fix 2026-05-18] address 변경 감지 시 자동 재 geocode
    if ('address' in updateData && !('lat' in updateData) && !('lng' in updateData)) {
      const oldAddr = existingRow?.address || '';
      const newAddr = String(updateData.address || '');
      if (oldAddr.trim() !== newAddr.trim() && newAddr.trim().length > 0) {
        try {
          const coords = await geocodeAddress(newAddr);
          if (coords && isValidKoreaCoord(coords.lat, coords.lng)) {
            updateData.lat = coords.lat;
            updateData.lng = coords.lng;
            audit({ action: 'listing.auto_regeocode', actor: authz.actor, ip, target: { type: 'listing', id }, status: 200, meta: { oldAddr, newAddr, lat: coords.lat, lng: coords.lng } });
          } else {
            updateData.lat = null;
            updateData.lng = null;
            audit({ action: 'listing.auto_regeocode_failed', actor: authz.actor, ip, target: { type: 'listing', id }, status: 200, meta: { oldAddr, newAddr } });
          }
        } catch (e) {
          console.warn('[M-3] auto-regeocode error:', e);
        }
      }
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
      meta: { fields: Object.keys(updateData).filter((k) => k !== 'updated_at' && k !== 'field_sources') },
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
// L-sec136 + L-cascade1 적용
// ─────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  try {
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
        results.push({ id, skipped: true });
        continue;
      }

      const updateData: Record<string, any> = {};
      const newSources: Record<string, string> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (ALLOWED_FIELDS.includes(key)) {
          updateData[key] = value;
          if (key !== 'status') {
            newSources[key] = 'broker';
          }
        }
      }

      if (Object.keys(updateData).length === 0) {
        errors.push({ id, error: 'No valid fields' });
        continue;
      }

      if (Object.keys(newSources).length > 0) {
        const { data: existing } = await supabase
          .from('listings')
          .select('field_sources')
          .eq('id', id)
          .single();
        const existingFs = (existing?.field_sources as Record<string, string>) || {};
        updateData.field_sources = { ...existingFs, ...newSources };
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
      meta: { updated, skipped, errors: errors.length },
    });

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      errors,
    });
  } catch (err: any) {
    console.error('POST error:', err);
    return NextResponse.json(
      { error: process.env.NODE_ENV !== 'production' ? err?.message : '수정 실패' },
      { status: 500 },
    );
  }
}
