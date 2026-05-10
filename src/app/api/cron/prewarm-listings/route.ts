// Prewarm cron — Fix 29 + Fix 34: REFRESH MATERIALIZED VIEW + warm unstable_cache
//
// 매 4분 호출:
//   1. Supabase RPC refresh_listings_minimal_mv() — view 데이터 fresh 화 (cron 매 4분, view 가 항상 < 4분 stale)
//   2. /api/admin/listings fetch — Vercel function unstable_cache + Data Cache 갱신
//
// 효과: 첫 진입 < 1-2초 (view 0.16s + slim + serialize + transfer)

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // 표준 cron auth (G-73)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();
  const phases: any = {};

  // Phase 1: REFRESH MATERIALIZED VIEW
  const t1 = Date.now();
  try {
    const supabase = createServerClient();
    const { error: refreshErr } = await supabase.rpc('refresh_listings_minimal_mv');
    phases.refresh = {
      ok: !refreshErr,
      elapsedMs: Date.now() - t1,
      error: refreshErr ? String(refreshErr.message || refreshErr) : null,
    };
  } catch (e: any) {
    phases.refresh = {
      ok: false,
      elapsedMs: Date.now() - t1,
      error: String(e?.message || e),
    };
  }

  // Phase 2: warm unstable_cache by fetching the URL
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://wishes.co.kr';
  const internal = process.env.WISHES_INTERNAL_BEARER || '';

  if (internal) {
    const t2 = Date.now();
    try {
      const res = await fetch(`${baseUrl}/api/admin/listings?fields=minimal&scope=all`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${internal}`,
          'User-Agent': 'wishes-cron-prewarm/2.0',
        },
        cache: 'no-store',
      });
      const body = await res.text();
      phases.warm = {
        ok: res.ok,
        status: res.status,
        size: body.length,
        xVercelCache: res.headers.get('x-vercel-cache'),
        elapsedMs: Date.now() - t2,
      };
    } catch (e: any) {
      phases.warm = {
        ok: false,
        error: String(e?.message || e),
        elapsedMs: Date.now() - t2,
      };
    }
  } else {
    phases.warm = { ok: false, error: 'WISHES_INTERNAL_BEARER not configured' };
  }

  return NextResponse.json(
    {
      success: phases.refresh?.ok && phases.warm?.ok,
      totalElapsedMs: Date.now() - t0,
      phases,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
