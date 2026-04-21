import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAuth } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// L-sec3 (2026-04-22): 박제 ADMIN_TOKEN fallback 'wishes2026' 제거 → verifyAdminAuth
async function isAdmin(request: NextRequest): Promise<boolean> {
  return verifyAdminAuth(request);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const admin = await isAdmin(request);

    const { data: image, error } = await supabase
      .from('listing_images')
      .select('image_url')
      .eq('id', parseInt(id))
      .single();

    if (error || !image) {
      return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 });
    }

    let targetUrl = image.image_url;

    // Admin gets original (non-watermarked) version
    // Derive original path from watermarked path using naming convention
    if (admin && targetUrl && targetUrl.includes('/watermarked/')) {
      targetUrl = targetUrl.replace('/watermarked/', '/originals/');
    }

    return NextResponse.redirect(targetUrl, { status: 302 });
  } catch (error) {
    console.error('Image serve error:', error);
    return NextResponse.json({ error: '오류가 발생했습니다.' }, { status: 500 });
  }
}
