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
import { verifyAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminAuth(request))) {
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

        // L-briefing-count (2026-04-24): limit(5000) row-fetch → count-only 로 전환.
        //   기존 구현은 deal/source_site 컬럼을 5000 row 만 가져와서 JS 로 count →
        //   매물이 5000 넘으면 통계에서 누락 (실측: 대시보드 전세 695건 0건으로 표시됨).
        //   count-only head:true 쿼리로 바꿔 DB 에서 직접 집계, limit 제약 제거 + 성능 개선.
        const [
          topViewsRes, recentRes, pendingContactsRes,
          jeonseCountRes, wolseCountRes, maemaeCountRes,
          ownCountRes, crawledCountRes,
        ] = await Promise.all([
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

          // 거래유형별 분포 (공개) — count-only
          supabase
            .from('listings')
            .select('id', { count: 'exact', head: true })
            .eq('status', '공개').eq('deal', '전세'),
          supabase
            .from('listings')
            .select('id', { count: 'exact', head: true })
            .eq('status', '공개').eq('deal', '월세'),
          supabase
            .from('listings')
            .select('id', { count: 'exact', head: true })
            .eq('status', '공개').eq('deal', '매매'),

          // 자체 vs 크롤링 (공개) — count-only
          supabase
            .from('listings')
            .select('id', { count: 'exact', head: true })
            .eq('status', '공개').is('source_site', null),
          supabase
            .from('listings')
            .select('id', { count: 'exact', head: true })
            .eq('status', '공개').not('source_site', 'is', null),
        ]);

        const dealCounts: Record<string, number> = {
          전세: jeonseCountRes.count ?? 0,
          월세: wolseCountRes.count ?? 0,
          매매: maemaeCountRes.count ?? 0,
        };

        const ownCount = ownCountRes.count ?? 0;
        const crawledCount = crawledCountRes.count ?? 0;

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
    // L-sec47 (2026-04-22): prod 에서 DB 스키마·스택 누출 방지
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { success: false, error: isDev ? (error?.message || '브리핑 데이터 조회 실패') : '브리핑 데이터 조회 실패' },
      { status: 500 }
    );
  }
}
