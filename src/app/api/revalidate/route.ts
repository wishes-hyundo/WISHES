import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

/**
 * On-demand ISR Revalidation API
 * 매물 추가/수정/삭제 시 캐시를 즉시 갱신
 *
 * Usage:
 *   POST /api/revalidate
 *   Body: { "path": "/listings", "secret": "..." }
 *   or:   { "path": "/listings/1", "secret": "..." }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path, secret } = body;

    // 간단한 시크릿 키 검증 (환경변수로 관리)
    const revalidateSecret = process.env.REVALIDATE_SECRET || 'wishes-revalidate-2024';
    if (secret !== revalidateSecret) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }

    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
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
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to revalidate' },
      { status: 500 }
    );
  }
}
