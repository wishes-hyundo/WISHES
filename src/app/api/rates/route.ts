import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// GET: 최신 금리 조회
export async function GET() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('loan_rates')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data?.[0] || null,
      message: data?.length ? '최신 금리 조회 성공' : '등록된 금리 정보가 없습니다',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: '금리 조회 실패' },
      { status: 500 }
    );
  }
}

// POST: 금리 업데이트 (관리자용)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mortgage_rates, jeonse_rates, admin_key } = body;

    // 간단한 관리자 인증
    if (admin_key !== process.env.ADMIN_API_KEY) {
      return NextResponse.json(
        { success: false, message: '권한이 없습니다' },
        { status: 401 }
      );
    }

    if (!mortgage_rates || !jeonse_rates) {
      return NextResponse.json(
        { success: false, message: '금리 데이터가 필요합니다' },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from('loan_rates')
      .insert({
        mortgage_rates,
        jeonse_rates,
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data?.[0],
      message: '금리가 성공적으로 업데이트되었습니다',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: '금리 업데이트 실패' },
      { status: 500 }
    );
  }
}
