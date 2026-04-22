// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/stats — 매물 통계 (v7 §6 SumBox 용)
//
// 목적
//   현재 필터/scope 조건에 매칭되는 매물 통계 (개수·평균가·중앙값) 를
//   반환. SumBox 의 "조건 부합 N건" 뱃지·요약 카드용.
//
// scope 파라미터
//   all (기본) — 모든 공개 매물
//   mine — auth 헤더의 사용자가 created_by 인 매물만
//
// 캐시 정책
//   60초 fresh / 5분 stale. scope+필터 조합별 키.
//
// 응답
//   { success: true, data: { count, avgPrice, medianPrice, byDeal: { 매매: N, ... } } }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServerClient } from '@/lib/supabase';
import { cached } from '@/lib/cache';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // L-sec33 (2026-04-22): 캐시 키에 들어가는 필터 값 길이 cap (cache-key 폭증 방지)
    const deal = (searchParams.get('deal') || '').slice(0, 20);
    const type = (searchParams.get('type') || '').slice(0, 40);
    const dong = (searchParams.get('dong') || '').slice(0, 60);
    const cat = (searchParams.get('cat') || '').slice(0, 40);

    const scopeParam = (searchParams.get('scope') || 'all').toLowerCase();
    const scope: 'all' | 'mine' = scopeParam === 'mine' ? 'mine' : 'all';

    // L-v7-p2: scope=mine 이면 auth 추출
    let scopeUid: string | null = null;
    if (scope === 'mine') {
      try {
        const authHdr = request.headers.get('authorization') || '';
        const token = authHdr.startsWith('Bearer ') ? authHdr.slice(7) : '';
        if (token) {
          const sb = createClient();
          const { data: { user } } = await sb.auth.getUser(token);
          scopeUid = user?.id || null;
        }
      } catch { /* fallback to all */ }
    }

    const cacheKey = `listings-stats:${cat}:${deal}:${type}:${dong}:${scopeUid || 'all'}`;

    const result = await cached(
      cacheKey,
      async () => {
        const supabase = createServerClient();

        // count: 조건 매칭 총 건수
        let countQ = supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('status', '공개');
        if (deal) countQ = countQ.eq('deal', deal);
        if (type) countQ = countQ.eq('type', type);
        if (dong) countQ = countQ.eq('dong', dong);
        if (scope === 'mine' && scopeUid) countQ = countQ.eq('created_by', scopeUid);

        // 거래별 분포 — RPC 가 있으면 그걸 쓰는 게 좋지만, 일단 client-side 그룹핑
        let priceQ = supabase
          .from('listings')
          .select('deal, deposit, monthly, price')
          .eq('status', '공개');
        if (deal) priceQ = priceQ.eq('deal', deal);
        if (type) priceQ = priceQ.eq('type', type);
        if (dong) priceQ = priceQ.eq('dong', dong);
        if (scope === 'mine' && scopeUid) priceQ = priceQ.eq('created_by', scopeUid);
        priceQ = priceQ.limit(2000); // 통계용 표본 cap

        const [countRes, sampleRes] = await Promise.all([countQ, priceQ]);

        const count = countRes.count || 0;
        const sample = sampleRes.data || [];

        // 통합 가격 (매매=price, 전세=deposit, 월세=monthly·12 + deposit/100)
        const unifiedPrices = sample
          .map((r: any) => {
            if (r.deal === '매매') return r.price;
            if (r.deal === '전세') return r.deposit;
            if (r.deal === '월세' || r.deal === '단기') {
              return (r.monthly || 0) * 12 + Math.round((r.deposit || 0) / 100);
            }
            return null;
          })
          .filter((v: any): v is number => typeof v === 'number' && v > 0);

        const avgPrice = unifiedPrices.length
          ? Math.round(unifiedPrices.reduce((a: number, b: number) => a + b, 0) / unifiedPrices.length)
          : 0;
        const sorted = [...unifiedPrices].sort((a: number, b: number) => a - b);
        const medianPrice = sorted.length
          ? sorted[Math.floor(sorted.length / 2)]
          : 0;

        const byDeal: Record<string, number> = {};
        for (const r of sample) {
          const k = (r as any).deal || '기타';
          byDeal[k] = (byDeal[k] || 0) + 1;
        }

        return {
          count,
          sampleSize: sample.length,
          avgPrice,
          medianPrice,
          byDeal,
          scope,
        };
      },
      60_000,    // 60초 fresh
      300_000,   // 5분 stale
      5_000,     // 5초 timeout
    );

    if (!result) {
      return NextResponse.json(
        { success: true, data: { count: 0, avgPrice: 0, medianPrice: 0, byDeal: {}, scope } },
        { headers: { 'Cache-Control': 'no-cache' } }
      );
    }

    return NextResponse.json(
      { success: true, data: result },
      {
        headers: {
          // 사용자별 scope 가 다를 수 있어 private. (mine 일 때만 strict)
          'Cache-Control': scope === 'mine'
            ? 'private, no-cache'
            : 'public, s-maxage=60, stale-while-revalidate=300',
        }
      }
    );
  } catch (error) {
    console.error('listings/stats 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '통계 조회 실패' },
      { status: 500 }
    );
  }
}
