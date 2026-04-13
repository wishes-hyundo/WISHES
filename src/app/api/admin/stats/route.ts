// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/stats (캐시 최적화)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { cached } from '@/lib/cache';

/**
 * GET /api/admin/stats - 관리자 대시보드 통계
 * 인메모리 캐시 적용: 60초 fresh, 10분 stale
 */
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

    const stats = await cached(
      'admin-stats',
      async () => {
        const supabase = createServerClient();

        // 병렬로 모든 통계 조회 (5개 쿼리를 동시에)
        const [total, active, contracting, completed, pendingContacts] = await Promise.all([
          supabase.from('listings').select('id', { count: 'exact', head: true }),
          supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', '공개'),
          supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', '계약중'),
          supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', '계약완료'),
          supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('status', '접수'),
        ]);

        return {
          totalListings: total.count || 0,
          activeListings: active.count || 0,
          contractingListings: contracting.count || 0,
          completedListings: completed.count || 0,
          pendingContacts: pendingContacts.count || 0,
        };
      },
      60_000,     // 60초 fresh
      600_000,    // 10분 stale 허용
      5_000,      // 5초 타임아웃
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
    });
  } catch (error) {
    console.error('통계 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '통계 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}
