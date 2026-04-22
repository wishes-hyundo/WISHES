import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqualStr } from '@/lib/timingSafe';

/**
 * On-demand ISR Revalidation API
 * 매물 추가/수정/삭제 시 캐시를 즉시 갱신
 *
 * Usage:
 *   POST /api/revalidate
 *   Body: { "path": "/listings", "secret": "..." }
 *   or:   { "path": "/listings/1", "secret": "..." }
 */
// L-sec16 (2026-04-22): 하드코드 fallback secret 'wishes-revalidate-2024' 제거.
//   env 가 미설정이면 500 으로 실패 → 무단 revalidate 로 인한 캐시 말살 공격 차단.
//   path 도 allowlist 로 제한 (/listings, /listings/<digits>, /, /map 만 허용).
const ALLOWED_PATH_RE = /^\/(?:listings(?:\/\d+)?|map|mypage|compare)?$/;

export async function POST(request: NextRequest) {
  try {
    const revalidateSecret = process.env.REVALIDATE_SECRET;
    if (!revalidateSecret) {
      // env 미설정은 서버 측 configuration 오류 → 500
      return NextResponse.json({ error: 'revalidate_unconfigured' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const { path, secret } = body as { path?: unknown; secret?: unknown };

    if (typeof secret !== 'string' || !timingSafeEqualStr(secret, revalidateSecret)) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }

    if (typeof path !== 'string' || path.length === 0 || path.length > 200) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    if (!ALLOWED_PATH_RE.test(path)) {
      return NextResponse.json({ error: 'path_not_allowed' }, { status: 400 });
    }

    // 해당 경로의 캐시를 갱신
    revalidatePath(path);

    // 매물 상세 페이지 revalidate 시 목록 페이지도 함께 갱신
    if (path.startsWith('/listings/')) {
      revalidatePath('/listings');
    }

    return NextResponse.json({
      revalidated: true,
      path,
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to revalidate' },
      { status: 500 }
    );
  }
}
