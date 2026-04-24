import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  if (!(await verifyAuth(request))) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Add original_url column to listing_images if it doesn't exist
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: "ALTER TABLE listing_images ADD COLUMN IF NOT EXISTS original_url TEXT;"
    });

    if (alterError) {
      // If rpc doesn't exist, try direct approach
      // Just try to insert and see if column exists
      const { data: testData, error: testError } = await supabase
        .from('listing_images')
        .select('original_url')
        .limit(1);
      
      if (testError && testError.code === '42703') {
        // Column doesn't exist - need to add it via Supabase Dashboard
        return NextResponse.json({
          success: false,
          message: 'original_url 컬럼이 없습니다. Supabase Dashboard에서 추가해주세요.',
          sql: 'ALTER TABLE listing_images ADD COLUMN original_url TEXT;'
        });
      }

      return NextResponse.json({
        success: true,
        message: 'original_url 컬럼이 이미 존재합니다.',
      });
    }

    return NextResponse.json({
      success: true,
      message: 'original_url 컬럼 추가 완료',
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: '마이그레이션 오류' }, { status: 500 });
  }
}
