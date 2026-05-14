// 외부 이미지 프록시 API
// GET /api/img-proxy?url=ENCODED_URL[&raw=1]

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const ALLOWED_HOSTS = [
  'd4k1brqee4emz.cloudfront.net',
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  'wishes-image-proxy.wishes-img.workers.dev',
  // L-imgproxy-zigbang (2026-05-09): 온하우스/직방/네모 협업 CDN
  'resource.zigbang.io',
  // L-imgproxy-fix-2026-05-10 (사장님 발견 2,801 매물 broken 썸네일):
  //   사장님 prod 캡처에서 CSP violation + img-proxy 403 host_not_allowed 다수.
  //   DB SQL 측정: 19,178 사진 (2,801 매물) 가 아래 4 host 라 broken.
  'img.nemoapp.kr',          // 네모 앱 (11,427 사진 / 1,840 매물)
  'ic.zigbang.com',           // 직방 다른 subdomain (6,830 사진 / 793 매물)
  'blob.nemoapp.kr',          // 네모 blob (671 사진 / 117 매물)
  'gsc.gongsilclub.com',      // 공실클럽 자체 사이트 (250 사진 / 51 매물)
];

const REFERER_OVERRIDES: Record<string, string> = {
  'wishes-image-proxy.wishes-img.workers.dev': 'https://wishes.co.kr/search',
};

const CACHE_SECONDS = 86400;

const TRANSPARENT_PNG_1X1 = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05,
  0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

function _transparentFallback(reason: string): NextResponse {
  return new NextResponse(new Uint8Array(TRANSPARENT_PNG_1X1), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Proxied': 'fallback',
      'X-Fallback-Reason': reason,
    },
  });
}

// L-imgproxy-magic: magic bytes 로 image type 추론.
function _detectImageMagic(buf: Buffer): string | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
      buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70 &&
      buf[8] === 0x61 && buf[9] === 0x76 && buf[10] === 0x69 && buf[11] === 0x66) return 'image/avif';
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `img-proxy:ip:${_ip}`, limit: 120, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return new NextResponse('rate limited', {
        status: 429,
        headers: { 'Retry-After': String(_rl.retryAfterSec) },
      });
    }

    const url = request.nextUrl.searchParams.get('url');
    if (!url) return new NextResponse('url parameter required', { status: 400 });
    if (url.length > 2048) return new NextResponse('url too long', { status: 413 });
    const raw = request.nextUrl.searchParams.get('raw') === '1';

    let parsed: URL;
    try {
      parsed = new URL(decodeURIComponent(url));
    } catch {
      return new NextResponse('invalid URL', { status: 400 });
    }

    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return new NextResponse('host not allowed', { status: 403 });
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    };
    const refererOverride = REFERER_OVERRIDES[parsed.hostname];
    if (refererOverride) headers['Referer'] = refererOverride;

    // L-imgproxy-resize-fallback (2026-05-09 사장님 매물 78752):
    //   CloudFront Lambda@Edge resize 함수가 큰 size (?w=1920) 처리 시 503.
    //   작은 size (?w=720) 또는 원본은 정상. 자동 size 줄여서 retry.
    const fetchOpts = { headers, cache: 'no-store' as const, signal: AbortSignal.timeout(10_000) };

    // [v378 server cap 2026-05-14 사장님 freeze fix]:
    //   CloudFront image 가 ?w=1200 으로 와서 200-400KB → 매물 카드 표시 109px 인데 너무 큼.
    //   img-proxy 단에서 ?w > 600 이면 ?w=400 으로 강제. CloudFront 작은 image 응답.
    //   client/IDB/Vercel cache 무관 — server 가 fetch 시점에 cap.
    //   modal hero 는 url 에 ?w=1200 명시 + ?nocap=1 query 사용 시 우회 가능 (안전 가드).
    const nocap = request.nextUrl.searchParams.get('nocap') === '1';
    // [v380 사장님 2026-05-14: cap host 확장 — cloudfront + zigbang + nemo + gongsilclub]
    const CAP_HOSTS = new Set([
      'd4k1brqee4emz.cloudfront.net',
      'ic.zigbang.com',
      'resource.zigbang.io',
      'img.nemoapp.kr',
      'blob.nemoapp.kr',
      'gsc.gongsilclub.com',
    ]);
    if (!nocap && CAP_HOSTS.has(parsed.hostname) && parsed.searchParams.has('w')) {
      const w = parseInt(parsed.searchParams.get('w') || '220', 10);
      // [v381b 2026-05-14: cap w>1300 — ?w=1200 hero 통과, ?w=1920 만 cap]
      //   modal hero 의도된 1200 은 그대로 → 선명 유지
      //   매물 카드의 ?w=1920 (DB default) 만 cap → 220 (작게)
      //   server _resizeThumb 가 만든 ?w=400 도 자연 통과
      if (w > 1300) {
        parsed.searchParams.set('w', '220');
      }
    }

    let targetUrl = parsed.toString();
    let res = await fetch(targetUrl, fetchOpts);

    if (!res.ok && res.status === 503 && parsed.searchParams.has('w')) {
      const originalW = parsed.searchParams.get('w');
      const fallbackSizes: (string | null)[] = ['720', '400', null];
      for (const w of fallbackSizes) {
        const fb = new URL(parsed.toString());
        if (w === null) fb.searchParams.delete('w');
        else fb.searchParams.set('w', w);
        try {
          const r2 = await fetch(fb.toString(), fetchOpts);
          if (r2.ok) {
            console.log('[img-proxy] resize fallback: w=' + originalW + ' → ' + (w || 'none'));
            res = r2;
            targetUrl = fb.toString();
            break;
          }
        } catch (_) {}
      }
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[img-proxy] fetch ' + res.status + ' url=' + targetUrl + ' body=' + errBody.substring(0, 200));
      return _transparentFallback('upstream_' + res.status);
    }

    const MAX_BYTES = 15 * 1024 * 1024;
    const lenHdr = parseInt(res.headers.get('content-length') || '0', 10);
    if (lenHdr > MAX_BYTES) {
      return new NextResponse('upstream too large', { status: 413 });
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) {
      return new NextResponse('upstream too large', { status: 413 });
    }
    const imageBuffer = Buffer.from(ab);
    const rawContentType = (res.headers.get('content-type') || 'image/jpeg').toLowerCase();
    const SAFE_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
    let primaryType = rawContentType.split(';')[0].trim();

    if (!SAFE_IMAGE_TYPES.includes(primaryType)) {
      const detected = _detectImageMagic(imageBuffer);
      if (detected) {
        primaryType = detected;
      } else {
        return _transparentFallback('content_type_' + primaryType.replace('/', '_'));
      }
    }
    const contentType = primaryType;

    let outputBuffer: Buffer;
    let outputType: string;
    let resizedFrom = imageBuffer.byteLength;
    let resizedTo = imageBuffer.byteLength;
    if (raw) {
      outputBuffer = imageBuffer;
      outputType = contentType;
    } else {
      // Fix 33 (2026-05-10 사장님 발견 — 외부 host CDN ?w 무시):
      //   nemo CDN 가 ?w=400 무시 (실제 측정 ?w=1920 == ?w=400 동일 size).
      //   server-side sharp resize 로 width=400 강제 + webp 변환 → 30배 ↓.
      const targetW = Math.min(parseInt(parsed.searchParams.get('w') || '400', 10) || 400, 1920);
      // Fix 33b (사장님 모달 화질 복원): width 별 quality 차등.
      //   썸네일 (≤500px): quality 82 — 카드 작은 사진, size 우선.
      //   중간 (501-1024px): quality 88 — 모달 갤러리 썸네일.
      //   hero (>1024px): quality 92 — 모달 큰 화면 hero, 화질 우선.
      const targetQuality = targetW <= 500 ? 82 : (targetW <= 1024 ? 88 : 92);
      const skipResize = imageBuffer.byteLength < 100 * 1024; // 이미 작으면 skip
      if (skipResize || contentType === 'image/gif') {
        outputBuffer = imageBuffer;
        outputType = contentType;
      } else {
        try {
          const sharp = (await import('sharp')).default;
          outputBuffer = await sharp(imageBuffer)
            .rotate() // EXIF orientation
            .resize({ width: targetW, withoutEnlargement: true })
            .webp({ quality: targetQuality, effort: 4 })
            .toBuffer();
          outputType = 'image/webp';
          resizedTo = outputBuffer.byteLength;
        } catch (resizeErr) {
          console.error('[img-proxy] sharp error', resizeErr);
          outputBuffer = imageBuffer;
          outputType = contentType;
        }
      }
    }

    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        'Content-Type': outputType,
        'Cache-Control': 'public, max-age=' + CACHE_SECONDS + ', s-maxage=' + CACHE_SECONDS,
        'X-Proxied': 'true',
        'X-Resized-From': String(resizedFrom),
        'X-Resized-To': String(resizedTo),
      },
    });
  } catch (err) {
    console.error('[img-proxy] error:', err);
    return _transparentFallback('fetch_error');
  }
}






