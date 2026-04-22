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
    // L-sec46 (2026-04-22): parseInt NaN guard + range cap
    const nId = Number(id);
    if (!Number.isFinite(nId) || !Number.isInteger(nId) || nId < 0 || nId > 2_000_000_000) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const admin = await isAdmin(request);

    const { data: image, error } = await supabase
      .from('listing_images')
      .select('image_url')
      .eq('id', nId)
      .single();

    if (error || !image) {
      return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 });
    }

    let targetUrl = image.image_url as string;

    // Admin gets original (non-watermarked) version
    // Derive original path from watermarked path using naming convention
    if (admin && targetUrl && targetUrl.includes('/watermarked/')) {
      targetUrl = targetUrl.replace('/watermarked/', '/originals/');
    }

    // L-sec46: open-redirect defense. Only allow https + whitelisted hosts.
    if (typeof targetUrl !== 'string' || !/^https?:\/\//i.test(targetUrl)) {
      return NextResponse.json({ error: 'Invalid image URL' }, { status: 500 });
    }
    try {
      const host = new URL(targetUrl).host;
      const ALLOW_HOSTS = ['wishes.co.kr', 'www.wishes.co.kr'];
      const ALLOW_SUFFIX = ['.supabase.co', '.r2.cloudflarestorage.com', '.r2.dev'];
      const r2Host = process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).host : '';
      const allowed =
        ALLOW_HOSTS.includes(host) ||
        ALLOW_SUFFIX.some((s) => host.endsWith(s)) ||
        (!!r2Host && host === r2Host);
      if (!allowed) {
        return NextResponse.json({ error: 'Image host not allowed' }, { status: 502 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid image URL' }, { status: 500 });
    }

    return NextResponse.redirect(targetUrl, { status: 302 });
  } catch (error) {
    console.error('Image serve error:', error);
    return NextResponse.json({ error: '오류가 발생했습니다.' }, { status: 500 });
  }
}
