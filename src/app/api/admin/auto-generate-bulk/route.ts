import { NextRequest, NextResponse } from 'next/server';
// L-sec155 (2026-04-23): Anthropic 대량 호출 + listings bulk UPDATE 엔드포인트.
//   verifyAdminAuth 는 role=agent JWT 까지 통과 → 중개사 계정이 고비용 Claude 호출
//   + 다른 중개사 매물까지 재생성 가능. superadmin/master/crawler_bridge 만 허용.
import { verifyAdminAuthStrict } from '@/lib/adminAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// L-sec3 (2026-04-22): 박제 ADMIN_TOKEN = 'wishes2026' 제거 →
//   인바운드: verifyAdminAuthStrict (master/superadmin/crawler_bridge only, L-sec155)
//   아웃바운드: WISHES_ADMIN_MASTER_PASSWORD env 로 /auto-generate 자가호출
//     → master 롤로 strict 통과 (Phase3 에서 WISHES_INTERNAL_BEARER 로 분리 예정)
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://wishes.co.kr';
const INTERNAL_BEARER = process.env.WISHES_ADMIN_MASTER_PASSWORD || '';

const ALLOWED_ROLES = new Set(['superadmin', 'master', 'crawler_bridge', 'internal_bearer']);

async function processListing(listingId: string): Promise<{
  id: string;
  success: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(BASE_URL + '/api/admin/auto-generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + INTERNAL_BEARER,
      },
      body: JSON.stringify({
        listingId: listingId,
        generateOptions: {
          excludePrice: true,
          excludeBasicSpecs: true,
          excludeAttachments: true,
          focusOnAttraction: true,
          attractionTopics: [
            'location_advantage',
            'interior_condition',
            'view_light',
            'nearby_facilities',
            'transport_access',
            'investment_value'
          ],
          seoKeywords: true,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { id: listingId, success: false, error: 'HTTP ' + response.status + ': ' + errText.substring(0, 200) };
    }

    const data = await response.json();
    if (data.success) {
      return { id: listingId, success: true };
    } else {
      return { id: listingId, success: false, error: data.error || 'Unknown error' };
    }
  } catch (err) {
    return { id: listingId, success: false, error: String(err) };
  }
}

async function processBatch(
  listingIds: string[],
  concurrency: number = 3,
  delayMs: number = 500
): Promise<{ results: Array<{ id: string; success: boolean; error?: string }>; totalSuccess: number; totalFailed: number }> {
  const results: Array<{ id: string; success: boolean; error?: string }> = [];
  let idx = 0;

  async function worker() {
    while (idx < listingIds.length) {
      const currentIdx = idx++;
      const result = await processListing(listingIds[currentIdx]);
      results.push(result);
      if (delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, listingIds.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const totalSuccess = results.filter(r => r.success).length;
  const totalFailed = results.filter(r => !r.success).length;

  return { results, totalSuccess, totalFailed };
}

export async function POST(request: NextRequest) {
  // L-sec84 (2026-04-22): 배치 job, 고비용 Claude 연속 호출. 1h 5회/IP.
  const _ip = getClientIp(request);
  const _rl = checkRateLimit({ key: `auto-gen-bulk:ip:${_ip}`, limit: 5, windowMs: 60 * 60_000 });
  if (!_rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
    );
  }
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok || !ALLOWED_ROLES.has(auth.role || '')) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      listingIds,
      concurrency = 3,
      delayMs = 500,
    } = body;

    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
      return NextResponse.json(
        { error: 'listingIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    const maxBatchSize = 50;
    const batch = listingIds.slice(0, maxBatchSize);
    const truncated = listingIds.length > maxBatchSize;

    const { results, totalSuccess, totalFailed } = await processBatch(
      batch,
      Math.min(concurrency, 5),
      Math.max(delayMs, 300)
    );

    return NextResponse.json({
      success: true,
      processed: batch.length,
      totalRequested: listingIds.length,
      truncated,
      totalSuccess,
      totalFailed,
      results,
    });
  } catch (error) {
    console.error('Bulk auto-generate error:', error);
    // L-sec47 (2026-04-22): prod 에서 details 스택 누출 방지
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      isDev
        ? { error: 'Bulk processing failed', details: String(error) }
        : { error: 'Bulk processing failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok || !ALLOWED_ROLES.has(auth.role || '')) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  return NextResponse.json({
    endpoint: '/api/admin/auto-generate-bulk',
    method: 'POST',
    description: 'Bulk auto-generate titles and descriptions for multiple listings',
    body: {
      listingIds: 'string[] - Array of listing IDs to process',
      concurrency: 'number (default: 3, max: 5) - Parallel workers',
      delayMs: 'number (default: 500, min: 300) - Delay between requests per worker',
    },
    limits: {
      maxBatchSize: 50,
      note: 'Send multiple requests for larger batches',
    },
  });
      }
