/**
 * /api/cron/enrich-land-price — 표준지 공시지가 자동 fetch (PR-R-2)
 *
 * V-World 무료 API. 정부 공식 평가액 (시세 추정 X — CLAUDE.md 일관).
 * admin 만 참고 표시. 사용자 UI 영향 0.
 *
 * env: VWORLD_API_KEY (PR-R-1 가이드 docs/setup/vworld-api-key.md)
 *
 * 매일 04:00 cron — 100건/run, 600ms throttle.
 * 일 1,000 호출 한도 — 건축물대장(100) + 공시지가(100) + 주택가격(100) = 30%.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VWORLD_KEY = process.env.VWORLD_API_KEY || '';
const BATCH_SIZE = 100;
// V-World 표준지 공시지가 API
const VWORLD_LAND_ENDPOINT = 'https://api.vworld.kr/ned/data/getLdaregVLInfo';

interface ListingRow {
  id: number;
  pnu: string | null; // 19자리 PNU 코드 (지번 → PNU)
  jibun: string | null;
  address: string | null;
}

interface LandPriceResult {
  ok: boolean;
  price_per_m2: number | null;
  year: number | null;
  error?: string;
}

async function fetchLandPrice(pnu: string): Promise<LandPriceResult> {
  if (!pnu) return { ok: false, price_per_m2: null, year: null, error: 'no_pnu' };

  const url = new URL(VWORLD_LAND_ENDPOINT);
  url.searchParams.set('key', VWORLD_KEY);
  url.searchParams.set('domain', 'wishes.co.kr');
  url.searchParams.set('format', 'json');
  url.searchParams.set('pnu', pnu);
  url.searchParams.set('numOfRows', '1');
  url.searchParams.set('pageNo', '1');

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'WISHES-PR-R2-Bot' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { ok: false, price_per_m2: null, year: null, error: `vworld_${res.status}` };
    }
    const data = await res.json();
    const item = data?.ldaregVLInfo?.field?.[0] || data?.field?.[0] || null;
    if (!item) {
      return { ok: false, price_per_m2: null, year: null, error: 'no_data' };
    }

    const priceRaw = item.pblntfPclnd || item.land_price || null;
    const yearRaw = item.stdrYear || item.year || null;
    const price = priceRaw ? Number.parseInt(String(priceRaw), 10) : null;
    const year = yearRaw ? Number.parseInt(String(yearRaw), 10) : null;

    return {
      ok: true,
      price_per_m2: Number.isFinite(price) ? price : null,
      year: Number.isFinite(year) ? year : null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { ok: false, price_per_m2: null, year: null, error: `fetch_${msg}` };
  }
}

export async function GET(request: NextRequest) {
  // G-86 (2026-05-04): fail-safe — CRON_SECRET 미설정이면 500 (이전엔 fail-open)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = auth === `Bearer ${cronSecret}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (!isUserSecret && !isVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!VWORLD_KEY) {
    return NextResponse.json({
      success: false,
      reason: 'vworld_api_key_missing',
      action: 'docs/setup/vworld-api-key.md 참조',
    });
  }

  const supabase = createServerClient();

  const { data: targets, error } = await supabase
    .from('listings')
    .select('id, pnu, jibun, address')
    .eq('status', '공개')
    .is('land_price_fetched_at', null)
    .not('pnu', 'is', null)
    .limit(BATCH_SIZE)
    .returns<ListingRow[]>();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({ success: true, processed: 0, message: 'no_pending' });
  }

  let succeeded = 0;
  let failed = 0;

  for (const listing of targets) {
    if (!listing.pnu) {
      await supabase
        .from('listings')
        .update({ land_price_fetched_at: new Date().toISOString() })
        .eq('id', listing.id);
      failed++;
      continue;
    }

    const result = await fetchLandPrice(listing.pnu);
    const updatePayload: Record<string, unknown> = {
      land_price_fetched_at: new Date().toISOString(),
    };
    if (result.ok && result.price_per_m2) {
      updatePayload.land_price_per_m2 = result.price_per_m2;
      if (result.year) updatePayload.land_price_year = result.year;
      succeeded++;
    } else {
      failed++;
    }
    await supabase.from('listings').update(updatePayload).eq('id', listing.id);
    await new Promise((r) => setTimeout(r, 600));
  }

  return NextResponse.json({
    success: true,
    processed: targets.length,
    succeeded,
    failed,
  });
}
