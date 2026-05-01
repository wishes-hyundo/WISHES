/**
 * GET /api/admin/government-prices — PR-R-2-Admin
 * 공시지가 + 개별주택가격 자동 보강 결과 (admin 만).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PriceRow {
  id: number;
  address: string | null;
  type_normalized: string | null;
  area_m2: number | null;
  land_price_per_m2: number | null;
  land_price_year: number | null;
  house_price_total: number | null;
  house_price_year: number | null;
  land_price_fetched_at: string | null;
  house_price_fetched_at: string | null;
}

export async function GET(request: NextRequest) {
  const ok = await verifyAdminAuth(request);
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number.parseInt(searchParams.get('limit') || '100', 10), 1), 500);

  const { data, error } = await supabase
    .from('listings')
    .select('id, address, type_normalized, area_m2, land_price_per_m2, land_price_year, house_price_total, house_price_year, land_price_fetched_at, house_price_fetched_at')
    .or('land_price_per_m2.not.is.null,house_price_total.not.is.null')
    .order('land_price_fetched_at', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<PriceRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 통계
  const { count: landFilled } = await supabase
    .from('listings').select('id', { count: 'exact', head: true })
    .not('land_price_per_m2', 'is', null);
  const { count: houseFilled } = await supabase
    .from('listings').select('id', { count: 'exact', head: true })
    .not('house_price_total', 'is', null);
  const { count: landPending } = await supabase
    .from('listings').select('id', { count: 'exact', head: true })
    .eq('status', '공개').is('land_price_fetched_at', null).not('pnu', 'is', null);

  return NextResponse.json({
    success: true,
    listings: data || [],
    stats: {
      land_price_filled: landFilled ?? 0,
      house_price_filled: houseFilled ?? 0,
      land_price_pending: landPending ?? 0,
    },
  });
}
