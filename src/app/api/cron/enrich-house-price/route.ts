/**
 * /api/cron/enrich-house-price — 개별주택가격 자동 fetch (PR-R-2)
 *
 * V-World 무료 API. 단독주택/다가구 대상 (빌라/건물 type_normalized).
 * 정부 공식 평가액 — CLAUDE.md 'AI 시세 추정 X' 일관 (정부 데이터만).
 * admin 만 참고 표시.
 *
 * env: VWORLD_API_KEY
 * 매일 04:30 cron — 100건/run.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VWORLD_KEY = process.env.VWORLD_API_KEY || '';
const BATCH_SIZE = 100;
// V-World 개별주택가격 API
const VWORLD_HOUSE_ENDPOINT = 'https://api.vworld.kr/ned/data/getApIndvdLandPriceAttr';

// 사장님 도메인 — 단독주택/다가구만 (빌라 type 안에 다가구 포함)
const HOUSE_ELIGIBLE = new Set(['빌라', '건물']);

interface ListingRow {
  id: number;
  pnu: string | null;
  type_normalized: string | null;
}

interface HousePriceResult {
  ok: boolean;
  price_total: number | null;
  year: number | null;
  error?: string;
}

async function fetchHousePrice(pnu: string): Promise<HousePriceResult> {
  if (!pnu) return { ok: false, price_total: null, year: null, error: 'no_pnu' };

  const url = new URL(VWORLD_HOUSE_ENDPOINT);
  url.searchParams.set('key', VWORLD_KEY);
  url.searchParams.set('domain', 'wishes.co.kr');
  url.searchParams.set('format', 'json');
  url.searchParams.set('pnu', pnu);

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'WISHES-PR-R2-Bot' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { ok: false, price_total: null, year: null, error: `vworld_${res.status}` };
    }
    const data = await res.json();
    const item = data?.apIndvdLandPriceAttr?.field?.[0] || data?.field?.[0] || null;
    if (!item) {
      return { ok: false, price_total: null, year: null, error: 'no_data' };
    }

    const priceRaw = item.indvdHousePrice || item.house_price || null;
    const yearRaw = item.stdrYear || item.year || null;
    const price = priceRaw ? Number.parseInt(String(priceRaw), 10) : null;
    const year = yearRaw ? Number.parseInt(String(yearRaw), 10) : null;

    return {
      ok: true,
      price_total: Number.isFinite(price) ? price : null,
      year: Number.isFinite(year) ? year : null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { ok: false, price_total: null, year: null, error: `fetch_${msg}` };
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
    .select('id, pnu, type_normalized')
    .eq('status', '공개')
    .in('type_normalized', Array.from(HOUSE_ELIGIBLE))
    .is('house_price_fetched_at', null)
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
        .update({ house_price_fetched_at: new Date().toISOString() })
        .eq('id', listing.id);
      failed++;
      continue;
    }

    const result = await fetchHousePrice(listing.pnu);
    const updatePayload: Record<string, unknown> = {
      house_price_fetched_at: new Date().toISOString(),
    };
    if (result.ok && result.price_total) {
      updatePayload.house_price_total = result.price_total;
      if (result.year) updatePayload.house_price_year = result.year;
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
    eligible_types: Array.from(HOUSE_ELIGIBLE),
  });
}
