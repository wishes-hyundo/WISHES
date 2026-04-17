// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/briefing (T5-5)
//   중개사 일일 브리핑 위젯용 집계 데이터
//   - 조회수 TOP 10 매물 (7일 기준 views 누적)
//   - 최근 7일 신규 등록 매물
//   - 미처리 상담 (status = '접수')
//   - 거래유형별 공개 매물 수
//   - 자체 매물 vs 크롤링 매물 비율
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { cached } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const password = authHeader?.replace('Bearer ', '');
    if (password !== 'wishes2026') {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const data = await cached(
      'admin-briefing',
      async () => {
        const supabase = createServerClient();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // 병렬 조회
        const [topViewsRes, recentRes, pendingContactsRes, dealCountsRes, ownVsCrawledRes] = await Promise.all([
          // 조회수 TOP 10 (공개 매물)
          supabase
            .from('listings')
            .select('id, title, type, deal, dong, deposit, monthly, price, views, source_site')
            .eq('status', '공개')
            .order('views', { ascending: false, nullsFirst: false })
            .limit(10),

          // 최근 7일 등록
          supabase
            .from('listings')
            .select('id, title, type, deal, dong, deposit, monthly, price, created_at, source_site')
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(10),

          // 미처리 상담
          supabase
            .from('contacts')
            .select('id, name, phone, email, message, created_at')
            .eq('status', '접수')
            .order('created_at', { ascending: false })
            .limit(10),

          // 거래유형별 분포 (공개 매물만)
          supabase
            .from('listings')
            .select('deal')
            .eq('status', '공개')
            .limit(5000),

          // 자체 vs 크롤링 (공개)
          supabase
            .from('listings')
            .select('source_site')
            .eq('status', '공개')
            .limit(5000),
        ]);

        // 거래유형 집계
        const dealCounts: Record<string, number> = { 전세: 0, 월세: 0, 매매: 0 };
        (dealCountsRes.data || []).forEach((r: any) => {
          if (r.deal && dealCounts[r.deal] !== undefined) dealCounts[r.deal]++;
        });

        // 자체 vs 크롤링
        const ownCount = (ownVsCrawledRes.data || []).filter((r: any) => !r.source_site).length;
        const crawledCount = (ownVsCrawledRes.data || []).length - ownCount;

        return {
          topViews: topViewsRes.data || [],
          recent: recentRes.data || [],
          pendingContacts: pendingContactsRes.data || [],
          dealCounts,
          ownVsCrawled: { own: ownCount, crawled: crawledCount },
          generatedAt: new Date().toISOString(),
        };
      },
      120_000,    // 2분 fresh
      600_000,    // 10분 stale
      5_000,      // 5초 타임아웃
    );

    return NextResponse.json({
      success: true,
      data: data || null,
    });
  } catch (error: any) {
    console.error('브리핑 데이터 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: error?.message || '브리핑 데이터 조회 실패' },
      { status: 500 }
    );
  }
}
