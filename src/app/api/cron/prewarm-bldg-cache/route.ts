/**
 * L-prewarm (2026-04-29): building_registry_cache 백그라운드 prewarm
 *
 * 사장님 매물 모달 열 때 첫 클릭 7초 대기 X — 미리 cache HIT 보장.
 * 6시간마다 50건씩 처리. Vercel cron 무료.
 *
 * 정책: 사장님 손 X (자동화 우선)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';
const INTERNAL_BEARER = process.env.WISHES_INTERNAL_BEARER || process.env.WISHES_ADMIN_MASTER_PASSWORD || '';

interface KakaoLookup {
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
}

async function quickKakao(address: string): Promise<KakaoLookup | null> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` }, signal: ctrl.signal },
    );
    clearTimeout(tid);
    if (!res.ok) return null;
    const j = await res.json() as { documents?: Array<{ address?: { b_code?: string; main_address_no?: string; sub_address_no?: string } }> };
    const doc = j.documents?.[0];
    if (!doc?.address?.b_code) return null;
    return {
      sigunguCd: doc.address.b_code.substring(0, 5),
      bjdongCd: doc.address.b_code.substring(5, 10),
      bun: (doc.address.main_address_no || '0').padStart(4, '0'),
      ji: (doc.address.sub_address_no || '0').padStart(4, '0'),
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  // G-87 (2026-05-04): user-agent 스푸핑 방어 — CRON_SECRET 강제 + x-vercel-cron 보조.
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = auth === `Bearer ${CRON_SECRET}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (!isUserSecret && !isVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'no_db' }, { status: 500 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);

  // 활성 매물 중 address 있고 cache 에 아직 없는 것 우선
  const { data: listings, error } = await supabase
    .from('listings')
    .select('id, address')
    .eq('status', 'active')
    .not('address', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error || !listings || listings.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, error: error?.message });
  }

  let cacheHits = 0;
  let warmed = 0;
  let errors = 0;

  for (const row of listings) {
    const lid = row.id as number;
    const addr = row.address as string;
    if (!addr) continue;

    try {
      const lookup = await quickKakao(addr);
      if (!lookup) { errors++; continue; }

      // cache 존재 여부 확인 (24h 내)
      const { data: cached } = await supabase
        .from('building_registry_cache')
        .select('fetched_at')
        .eq('sigungu_cd', lookup.sigunguCd)
        .eq('bjdong_cd', lookup.bjdongCd)
        .eq('bun', lookup.bun)
        .eq('ji', lookup.ji)
        .maybeSingle();

      if (cached) {
        const ageMs = Date.now() - new Date(cached.fetched_at as string).getTime();
        if (ageMs < 24 * 60 * 60 * 1000) {
          cacheHits++;
          continue;
        }
      }

      // 캐시 비어있거나 stale → building-registry-full 호출 (캐시 자동 채움)
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 12000);
      const fullUrl = `${SITE_URL}/api/admin/building-registry-full?address=${encodeURIComponent(addr)}&lid=${lid}`;
      const res = await fetch(fullUrl, {
        headers: INTERNAL_BEARER ? { Authorization: `Bearer ${INTERNAL_BEARER}` } : {},
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (res.ok) {
        warmed++;
      } else {
        errors++;
      }
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: listings.length,
    cacheHits,
    warmed,
    errors,
    timestamp: new Date().toISOString(),
  });
}
