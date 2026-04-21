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

// 기존 videos/route.ts 의 isAdmin 과 동일 로직 + wishes2026 허용
function isAdmin(request: NextRequest): boolean {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.split(' ')[1];
  const adminToken = process.env.ADMIN_TOKEN || 'wishes2026';
  if (token === adminToken) return true;
  if (token === 'wishes2026') return true; // 마스터 비밀번호
  if (token && token.startsWith('admin_bridge_')) return true; // 브릿지 토큰
  if (token && token.startsWith('eyJ') && token.split('.').length === 3 && token.length > 40) {
    return true; // Supabase JWT
  }
  return false;
}

function randId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdmin(request)) {
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
