// src/app/api/listings/[id]/videos/presign/route.ts
// v2.3.8 — R2 Presigned PUT URL 발급 [신규 엔드포인트]
//
// 흐름:
//   클라이언트 → POST /api/listings/{id}/videos/presign
//              { name, mime, size }
//   서버       → { url, key, maxSize, expiresIn }
//   클라이언트 → PUT url (body: file, Content-Type: mime)   ← 4.5MB 한계 우회
//   클라이언트 → POST /api/listings/{id}/videos/metadata    ← DB 저장
//
// 인증:
//   기존 videos/route.ts 와 동일하게 Authorization: Bearer <ADMIN_TOKEN>
//   또는 마스터비밀번호 'wishes2026' 허용 (adminAuth 와 호환)

import { NextRequest, NextResponse } from 'next/server';
import { getPresignedPutUrl } from '@/lib/r2';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const URL_TTL_SECONDS = 600;        // 10분
const ALLOWED_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'video/x-matroska',
]);
const MIME_TO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
  'video/x-matroska': 'mkv',
};

// L-sec1 (2026-04-22): 자체 isAdmin() 을 제거하고 adminAuth 의 env-기반 검증으로 통일.
//   기존 함수는 1) ADMIN_TOKEN 기본값 'wishes2026' 박제,
//             2) admin_bridge_* prefix 만으로 통과,
//             3) 서명 검증 없는 JWT 도 통과 — 3중 우회가 있었음.

function randId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id: listingId } = await params;
  if (!listingId) {
    return NextResponse.json({ error: 'MISSING_LISTING_ID' }, { status: 400 });
  }

  let body: { name?: unknown; mime?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const mime = typeof body.mime === 'string' ? body.mime.trim() : '';
  const size = typeof body.size === 'number' ? body.size : NaN;

  if (!name) {
    return NextResponse.json({ error: 'MISSING_NAME' }, { status: 400 });
  }
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json(
      { error: 'MIME_NOT_ALLOWED', got: mime, allowed: [...ALLOWED_MIMES] },
      { status: 415 }
    );
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'INVALID_SIZE', got: size }, { status: 400 });
  }
  if (size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'FILE_TOO_LARGE', size, maxSize: MAX_SIZE },
      { status: 413 }
    );
  }

  // 키 생성: listings/{safeId}/videos/{ts}-{rand}.{ext}
  const safeId = String(listingId).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) {
    return NextResponse.json({ error: 'INVALID_LISTING_ID' }, { status: 400 });
  }
  const ext = MIME_TO_EXT[mime] || 'mp4';
  const key = `listings/${safeId}/videos/${Date.now()}-${randId()}.${ext}`;

  try {
    const url = await getPresignedPutUrl(key, mime, URL_TTL_SECONDS);
    return NextResponse.json(
      { url, key, maxSize: MAX_SIZE, expiresIn: URL_TTL_SECONDS },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[videos/presign] presign failed:', err);
    return NextResponse.json(
      { error: 'PRESIGN_FAILED', detail: String(err?.message || err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
}
