import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function isAdmin(request: NextRequest): boolean {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.split(' ')[1] === (process.env.ADMIN_TOKEN || 'wishes2026');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const admin = isAdmin(request);

    // Fetch image record
    const { data: image, error } = await supabase
      .from('listing_images')
      .select('image_url, original_url')
      .eq('id', parseInt(id))
      .single();

    if (error || !image) {
      return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 });
    }

    // Admin gets original, public gets watermarked
    const imageUrl = admin && image.original_url ? image.original_url : image.image_url;

    // Redirect to the appropriate image
    return NextResponse.redirect(imageUrl, { status: 302 });
  } catch (error) {
    console.error('Image serve error:', error);
    return NextResponse.json({ error: '오류가 발생했습니다.' }, { status: 500 });
  }
}
