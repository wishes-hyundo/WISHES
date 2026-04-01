// ─────────────────────────────────────────────────────────────────────────────────────
// Admin API: POST /api/admin/upload - 이미지 업로드
// Cloudflare R2 + 자동 WebP 압축
// ─────────────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { storage } from '@/lib/storage';
import sharp from 'sharp';

/**
 * 인증 검증 헬퍼 함수
 */
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const password = authHeader?.replace('Bearer ', '');
  return password === 'wishes2026';
}

/**
 * 이미지 압축 및 WebP 변환
 * - 최대 1920x1440 리사이즈
 * - WebP 포맷 변환 (품질 80)
 * - 결과: ~200-300KB
 */
async function compressImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(1920, 1440, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
}

/**
 * POST /api/admin/upload - 매물 이미지 업로드
 * @body file - 이미지 파일 (multipart/form-data)
 * @body listingId - 매물 ID (선택사항)
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

    const maxSize = 10 * 1024 * 1024; // 원본 최대 10MB (압축 후 줄어듦)
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: '파일 크기가 너무 큽니다 (최대 10MB)' },
        { status: 400 }
      );
    }

    // 파일 → Buffer → WebP 압축
    const arrayBuffer = await file.arrayBuffer();
    const originalBuffer = Buffer.from(arrayBuffer);
    const compressedBuffer = await compressImage(originalBuffer);

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
