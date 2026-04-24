import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

/**
 * Kakao Roadview proxy
 * ====================
 * Kakao JS SDK `kakao.maps.Roadview` 는 `rv.map.kakao.com/roadview-search/v2/*`
 * 엔드포인트를 호출하는데, 이 엔드포인트는 Referer 가 map.kakao.com 이 아니면
 * 모두 503 으로 응답한다 (도메인 게이팅). 결과적으로 wishes.co.kr 에 임베드한
 * SDK 의 로드뷰는 항상 빈 화면으로 표시된다.
 *
 * 이 라우트는 해당 엔드포인트를 서버 사이드에서 대신 호출하며
 * Referer: https://map.kakao.com/ 헤더를 주입하여 정상 응답을 가져온다.
 * 클라이언트 측에서는 map-main.js 에서 XHR/fetch 를 몽키패치하여
 *   https://rv.map.kakao.com/<path>?<query>
 *     →  /api/kakao-rv/<path>?<query>
 * 로 리라이트한다.
 */

export const runtime = 'edge'; // 저지연 프록시
export const dynamic = 'force-dynamic';

const TARGET_BASE = 'https://rv.map.kakao.com';
const FAKE_REFERER = 'https://map.kakao.com/';
const FAKE_ORIGIN = 'https://map.kakao.com';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=60, s-maxage=300',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // L-sec72 (2026-04-22): Kakao 로드뷰 할당량 보호
    //   5분 60회/IP cap. 로드뷰 타일 fan-out 을 감안해 일반 엔드포인트보다 높게.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `kakao-rv:ip:${_ip}`, limit: 60, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { error: 'rate_limited' },
        { status: 429, headers: { ...CORS_HEADERS, 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const { path } = await params;
    const pathStr = (path || []).join('/');

    // L-sec14 (2026-04-22): 공개 프록시 오용 방지. Kakao 로드뷰 SDK 가
    //   실제로 호출하는 path 만 통과시켜 attacker 가 임의의
    //   rv.map.kakao.com 엔드포인트를 wishes.co.kr 경유로 호출하지 못하게 차단.
    //   현재 SDK 는 roadview-search/v2/* 만 사용.
    const ALLOWED_PATH_RE = /^roadview-search\/v2\/[a-zA-Z0-9_\-/.]+$/;
    if (!ALLOWED_PATH_RE.test(pathStr)) {
      return NextResponse.json(
        { error: 'path_not_allowed' },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // L-sec14: query string 도 길이 상한으로 cap (할당량 고갈 방지)
    const rawSearch = request.nextUrl.search || '';
    const search = rawSearch.length > 500 ? rawSearch.slice(0, 500) : rawSearch;
    const targetUrl = `${TARGET_BASE}/${pathStr}${search}`;

    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Referer: FAKE_REFERER,
        Origin: FAKE_ORIGIN,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        Accept: '*/*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      // 5초 타임아웃
      signal: AbortSignal.timeout(5000),
    });

    const body = await upstream.arrayBuffer();
    const contentType =
      upstream.headers.get('content-type') || 'application/json; charset=utf-8';

    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': contentType,
      },
    });
  } catch (err: any) {
    // L-sec72 (2026-04-22): 내부 에러 메시지 prod 노출 차단
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: 'proxy_error', ...(isDev && { message: err?.message || String(err) }) },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}
