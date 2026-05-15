// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/geocode-fix-fallback
// 동 중심좌표 fallback 의심 매물 일괄 재 geocoding
// (같은 좌표에 다른 base 주소 매물이 있는 경우 = kakao 동 fallback 추정)
//
// 사장님 명령 2026-05-15: 11,991건 fallback fix
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { geocodeAddress } from '@/lib/geocode';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 200;
const RATE_LIMIT_MS = 60;

export async function POST(request: NextRequest) {
  const _t0 = Date.now();
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const supabase = createServerClient();

    // DB 의 stored function 호출 — fallback 의심 매물 BATCH_SIZE 건 가져옴
    // 매번 freshly 계산 (이전 batch 에서 fix 된 매물은 다음 batch 에서 제외됨)
    const { data: targets, error: targetErr } = await supabase
      .rpc('get_fallback_coord_listing_ids', { batch_limit: BATCH_SIZE });

    if (targetErr) {
      return NextResponse.json({
        success: false,
        error: 'RPC failed: ' + targetErr.message,
      }, { status: 500 });
    }

    const list = (targets || []) as Array<{ id: number; address: string; lat: number; lng: number }>;
    if (list.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0, updated: 0, nulled: 0, unchanged: 0,
        hasMore: false, _ms: Date.now() - _t0,
        message: '✅ 모든 fallback 매물 처리 완료',
      });
    }

    let updated = 0, nulled = 0, unchanged = 0, processed = 0;

    for (const l of list) {
      processed++;
      const hit = await geocodeAddress(l.address);
      if (hit) {
        if (Math.abs(hit.lat - l.lat) > 0.00001 || Math.abs(hit.lng - l.lng) > 0.00001) {
          await supabase.from('listings').update({ lat: hit.lat, lng: hit.lng }).eq('id', l.id);
          updated++;
        } else {
          unchanged++;
        }
      } else {
        // 동 fallback 제거됐으니 null = 매칭 못 함 → NULL out
        await supabase.from('listings').update({ lat: null, lng: null }).eq('id', l.id);
        nulled++;
      }
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }

    return NextResponse.json({
      success: true,
      processed, updated, nulled, unchanged,
      hasMore: processed === BATCH_SIZE,
      _ms: Date.now() - _t0,
    });
  } catch (e: any) {
    return NextResponse.json({
      success: false, error: e?.message || 'unknown', _ms: Date.now() - _t0,
    }, { status: 500 });
  }
}
