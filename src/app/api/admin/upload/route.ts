// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: POST /api/admin/upload - 이미지 업로드
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * 인증 검증 헬퍼 함수
 */
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const password = authHeader?.replace('Bearer ', '');
  return password === 'wishes2026';
}

/**
 * POST /api/admin/upload - 매물 이미지 업로드
 * @body file - 이미지 파일 (multipart/form-data)
 * @body listingId - 매물 ID (선택사항, 저장하지 않으면 임시 파일로 저장)
 */
export async function POST(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const listingId = formData.get('listingId') as string;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '파일이 필요합니다' },
        { status: 400 }
      );
    }

    // 파일 검증
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validMimeTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: '지원하지 않는 파일 형식입니다 (JPEG, PNG, WebP, GIF)' },
        { status: 400 }
      );
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: '파일 크기가 너무 큽니다 (최대 5MB)' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // 파일명 생성 (timestamp + random)
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const ext = file.name.split('.').pop();
    const fileName = `listing-${timestamp}-${random}.${ext}`;

    // Supabase Storage에 업로드
    const { data, error } = await supabase.storage
      .from('listing-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('파일 업로드 오류:', error);
      return NextResponse.json(
        { success: false, error: '파일 업로드에 실패했습니다' },
        { status: 500 }
      );
    }

    // 공개 URL 생성
    const {
      data: { publicUrl },
    } = supabase.storage.from('listing-images').getPublicUrl(data.path);

    // listingId가 제공된 경우 listing_images 테이블에 저장
    if (listingId) {
      const listingIdNum = parseInt(listingId);
      if (!isNaN(listingIdNum)) {
        const { error: insertError } = await supabase
          .from('listing_images')
          .insert({
            listing_id: listingIdNum,
            url: publicUrl,
            alt: file.name,
            sort_order: 0,
            is_thumbnail: false,
          });

        if (insertError) {
          console.error('이미지 정보 저장 오류:', insertError);
          // 업로드는 성공했으므로 URL 반환
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          url: publicUrl,
          path: data.path,
          fileName: fileName,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('파일 업로드 오류:', error);
    return NextResponse.json(
      { success: false, error: '파일 업로드에 실패했습니다' },
      { status: 500 }
    );
  }
}
