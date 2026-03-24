// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/stats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * GET /api/admin/stats - 관리자 대시보드 통계
 */
export async function GET(request: NextRequest) {
  try {
    // 인증 검증
    const authHeader = request.headers.get('authorization');
    const password = authHeader?.replace('Bearer ', '');
    if (password !== 'wishes2026') {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // 전체 매물 수
    const { count: totalListings } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true });

    // 상태별 매물 수
    const { count: activeListings } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', '가용');

    const { count: contractingListings } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', '계약중');

    const { count: completedListings } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', '계약완료');

    // 미처리 상담 수
    const { count: pendingContacts } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('status', '접수');

    return NextResponse.json({
      success: true,
      data: {
        totalListings: totalListings || 0,
        activeListings: activeListings || 0,
        contractingListings: contractingListings || 0,
        completedListings: completedListings || 0,
        pendingContacts: pendingContacts || 0,
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
