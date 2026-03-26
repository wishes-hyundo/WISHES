import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { uploadToR2, R2_PUBLIC_URL } from '@/lib/r2';

function verifyAuth(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth === 'wishes2026') return true;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.split(' ')[1] === (process.env.ADMIN_TOKEN || 'wishes2026');
  }
  const adminSession = request.cookies.get('admin_session');
  if (adminSession?.value === 'wishes2026') return true;
  return false;
}

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results: { success: string[]; failed: string[]; skipped: string[] } = {
    success: [],
    failed: [],
    skipped: [],
  };

  try {
    // 1. listing_images 테이블에서 모든 이미지 URL 조회
    const { data: images, error } = await supabase
      .from('listing_images')
      .select('id, listing_id, url')
      .order('listing_id');

    if (error) {
      return NextResponse.json({ error: 'DB 조회 실패', detail: error.message }, { status: 500 });
    }

    if (!images || images.length === 0) {
      return NextResponse.json({ message: '마이그레이션할 이미지가 없습니다', results });
    }

    // 2. 각 이미지를 R2로 복사
    for (const img of images) {
      try {
        // 이미 R2 URL이면 스킵
        if (img.url && img.url.includes('r2.dev')) {
          results.skipped.push(img.url);
          continue;
        }

        // Supabase Storage URL에서 이미지 다운로드
        const response = await fetch(img.url);
        if (!response.ok) {
          results.failed.push(img.url + ' (fetch failed: ' + response.status + ')');
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'image/webp';

        // R2 키 생성: listings/{listing_id}/{timestamp}_{id}.webp
        const ext = contentType.includes('webp') ? 'webp' : contentType.includes('png') ? 'png' : 'jpg';
        const key = 'listings/' + img.listing_id + '/' + Date.now() + '_' + img.id + '.' + ext;

        // R2에 업로드
        const r2Url = await uploadToR2(key, buffer, contentType);

        // DB URL 업데이트
        const { error: updateError } = await supabase
          .from('listing_images')
          .update({ url: r2Url })
          .eq('id', img.id);

        if (updateError) {
          results.failed.push(img.url + ' (DB update failed)');
        } else {
          results.success.push(r2Url);
        }
      } catch (err: any) {
        results.failed.push(img.url + ' (' + (err?.message || 'unknown') + ')');
      }
    }

    return NextResponse.json({
      message: '마이그레이션 완료',
      total: images.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: '마이그레이션 실패', detail: err?.message }, { status: 500 });
  }
}
