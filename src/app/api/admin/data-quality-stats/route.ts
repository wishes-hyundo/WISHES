/**
 * /api/admin/data-quality-stats (Tier 6, 2026-04-28)
 * Dashboard 통계 endpoint.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'No supabase' }, { status: 500 });
  }

  try {
    const [total, areaSame, supplyNull, areaZero, extracted, cacheCount] = await Promise.all([
      supabase.from('listings').select('*', { count: 'exact', head: true }),
      supabase.rpc('count_area_same').then(
        (r) => ({ count: typeof r.data === 'number' ? r.data : 0 }),
        () => ({ count: 0 }),
      ),
      supabase.from('listings').select('*', { count: 'exact', head: true }).is('area_supply_m2', null),
      supabase.from('listings').select('*', { count: 'exact', head: true }).eq('area_m2', 0),
      supabase.from('listings').select('*', { count: 'exact', head: true }).not('building_unit_extracted_at', 'is', null),
      supabase.from('building_registry_cache').select('*', { count: 'exact', head: true }),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        total: total.count || 0,
        area_same: areaSame.count || 0,
        supply_null: supplyNull.count || 0,
        area_zero: areaZero.count || 0,
        area_extracted: extracted.count || 0,
        registry_cached: cacheCount.count || 0,
      },
      ts: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
