// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: POST /api/admin/upload - 이미지 업로드
// Cloudflare R2 + 자동 WebP 압축
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { storage } from '@/lib/storage';
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';
// L-photo-pipeline (2026-04-24): Classic Negative + 중앙 WISHES 워터마크 통합.
//   기존 compressImage 는 단순 WebP 변환이었고, 워터마크는 런타임 /api/wm
//   프록시에서만 붙었음. 이제 업로드 시점에 처리된 결과를 영구 저장한다.

/**
 * POST /api/admin/upload - 매물 이미지 업로드
 * @body file - 이미지 파일 (multipart/form-data)
 * @body listingId - 매물 ID (선택사항)
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAuth(request))) {
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

    const maxSize = 10 * 1024 * 1024; // 원본 최대 10MB (압축 후 줄어듦)
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: '파일 크기가 너무 큽니다 (최대 10MB)' },
        { status: 400 }
      );
    }

    // 파일 → Buffer → Classic Negative + 중앙 워터마크 + WebP
    const { processPhotoUpload } = await import('@/lib/photoProcess');
    const arrayBuffer = await file.arrayBuffer();
    const originalBuffer = Buffer.from(arrayBuffer);
    const compressedBuffer = await processPhotoUpload(originalBuffer);

    // 파일명 생성 (timestamp + random, 항상 .webp)
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const fileName = `listings/listing-${timestamp}-${random}.webp`;

    // R2에 업로드
    const publicUrl = await storage.upload(compressedBuffer, fileName, 'image/webp');

    // Supabase DB에 이미지 정보 저장
    if (listingId) {
      const listingIdNum = parseInt(listingId);
      if (!isNaN(listingIdNum)) {
        const supabase = createServerClient();
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
          path: fileName,
          fileName: fileName,
          originalSize: originalBuffer.length,
          compressedSize: compressedBuffer.length,
          compressionRatio: `${Math.round((1 - compressedBuffer.length / originalBuffer.length) * 100)}%`,
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
