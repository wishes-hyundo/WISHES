// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: POST /api/admin/upload-video - 동영상 업로드
// Cloudflare R2 + MIME/용량 가드
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 지원 포맷: MP4 (H.264/HEVC), WebM, QuickTime MOV
// 최대 용량: 50MB (핸드폰 1080p 약 1분 분량 기준)
// 처리: 현재는 트랜스코딩 없이 원본 저장 (ffmpeg 의존성 회피)
//        용량이 크면 "업로드 전 짧게 잘라주세요" 안내로 유도
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { storage } from '@/lib/storage';
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';

// Next.js route config: 기본 1MB body 제한 상향
export const maxDuration = 60; // seconds
export const dynamic = 'force-dynamic';

const VALID_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',     // .mov (iPhone)
  'video/webm',
  'video/x-m4v',
  'video/x-matroska',    // .mkv (가끔)
];

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

function mimeToExt(mime: string, fallbackName?: string): string {
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/x-m4v') return 'm4v';
  if (mime === 'video/x-matroska') return 'mkv';
  // 파일명 확장자 폴백
  if (fallbackName) {
    const ext = fallbackName.split('.').pop()?.toLowerCase();
    if (ext && /^(mp4|mov|webm|m4v|mkv)$/.test(ext)) return ext;
  }
  return 'mp4';
}

/**
 * POST /api/admin/upload-video - 매물 동영상 업로드
 * @body file - 동영상 파일 (multipart/form-data)
 * @body listingId - 매물 ID (선택)
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

    // MIME 검증 (브라우저가 quicktime 대신 빈 문자열 주는 경우 파일명으로 폴백)
    const mime = file.type || 'application/octet-stream';
    const nameLower = (file.name || '').toLowerCase();
    const extMatch = /\.(mp4|mov|webm|m4v|mkv)$/.test(nameLower);
    if (!VALID_MIME_TYPES.includes(mime) && !extMatch) {
      return NextResponse.json(
        { success: false, error: '지원하지 않는 파일 형식입니다 (MP4, MOV, WebM)' },
        { status: 400 }
      );
    }

    // 용량 가드
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 최대 50MB 까지 업로드 가능합니다. 더 짧게 잘라서 다시 올려주세요.`,
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const ext = mimeToExt(mime, file.name);
    const fileName = `listings/video-${timestamp}-${random}.${ext}`;

    // R2 업로드 (ContentType 은 원본 MIME 그대로 전달)
    const effectiveMime = VALID_MIME_TYPES.includes(mime)
      ? mime
      : (ext === 'mov' ? 'video/quicktime' : `video/${ext === 'm4v' ? 'x-m4v' : ext}`);
    const publicUrl = await storage.upload(buffer, fileName, effectiveMime);

    // DB 저장 (listingId 가 있을 때만)
    let insertedId: number | null = null;
    if (listingId) {
      const listingIdNum = parseInt(listingId);
      if (!isNaN(listingIdNum)) {
        const supabase = createServerClient();
        const { data, error: insertError } = await supabase
          .from('listing_videos')
          .insert({
            listing_id: listingIdNum,
            url: publicUrl,
            mime_type: effectiveMime,
            file_size: file.size,
            alt: file.name,
            sort_order: 0,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('동영상 정보 저장 오류:', insertError);
        } else if (data) {
          insertedId = data.id;
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: insertedId,
          url: publicUrl,
          path: fileName,
          fileName: fileName,
          mimeType: effectiveMime,
          size: file.size,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('동영상 업로드 오류:', error);
    return NextResponse.json(
      { success: false, error: '동영상 업로드에 실패했습니다' },
      { status: 500 }
    );
  }
}
