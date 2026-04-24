// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/stats (캐시 최적화)
//
// L-v7-p2 (2026-04-22) — 504 타임아웃 디버그:
//   5개 병렬 count(exact,head) 쿼리가 listings 테이블 40k+ row 에
//   대해 5초 내 못 끝내는 경우가 잦았음. 다음 3가지로 완화:
//     1) 전체 타임아웃 5→8초 (Vercel 10s edge 아래)
//     2) 쿼리별 개별 타임아웃 4초 (하나 느려도 나머지는 반환)
//     3) 에러 시 500 대신 partial:true 로 빈 데이터 반환 — 대시보드가
//        "일부만 보임" 상태로라도 뜨게 해 504 체감 제거.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { cached } from '@/lib/cache';
import { verifyAdminAuth } from '@/lib/adminAuth';

// 개별 쿼리 타임아웃 — Promise.race 로 '일부 성공' 허용
async function countWithTimeout(
  p: PromiseLike<{ count: number | null }>,
  ms = 4000
): Promise<number> {
  try {
    const r = await Promise.race([
      p,
      new Promise<{ count: null }>((_, rej) =>
        setTimeout(() => rej(new Error('count_timeout')), ms)
      ),
    ]) as { count: number | null };
    return r.count ?? 0;
  } catch {
    return 0; // 이 쿼리만 실패 → 0 폴백, 나머지는 계속
  }
}

/**
 * GET /api/admin/stats - 관리자 대시보드 통계
 * 인메모리 캐시 적용: 60초 fresh, 10분 stale
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const stats = await cached(
      'admin-stats',
      async () => {
        const supabase = createServerClient();

        // 병렬 + 개별 타임아웃 (하나 실패해도 전체는 계속)
        const [total, active, contracting, completed, pendingContacts] = await Promise.all([
          countWithTimeout(supabase.from('listings').select('id', { count: 'exact', head: true })),
          countWithTimeout(supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', '공개')),
          countWithTimeout(supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', '계약중')),
          countWithTimeout(supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', '계약완료')),
          countWithTimeout(supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('status', '접수')),
        ]);

        return {
          totalListings: total,
          activeListings: active,
          contractingListings: contracting,
          completedListings: completed,
          pendingContacts,
        };
      },
      60_000,     // 60초 fresh
      600_000,    // 10분 stale 허용
      8_000,      // 8초 래퍼 타임아웃 (개별 4초보다 길게)
    );

    return NextResponse.json({
      success: true,
      data: stats || {
        totalListings: 0,
        activeListings: 0,
        contractingListings: 0,
        completedListings: 0,
        pendingContacts: 0,
      },
      // L-v7-p2: partial 여부 노출 — 프론트에서 '데이터 일부만' 뱰지 표시 가능
      partial: !stats,
    });
  } catch (error) {
    console.error('통계 조회 오류:', error);
    // 500 대신 빈 데이터 + partial:true 로 fallback — 대시보드 자체는 뜨게
    return NextResponse.json({
      success: true,
      partial: true,
      data: {
        totalListings: 0,
        activeListings: 0,
        contractingListings: 0,
        completedListings: 0,
        pendingContacts: 0,
      },
      warning: '통계 조회 지연 — stale 캐시 또는 0 으로 폴백',
    });
  }
}
