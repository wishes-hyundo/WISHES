import { NextRequest, NextResponse } from 'next/server';

const ADMIN_TOKEN = 'wishes2026';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://wishes.co.kr';

function checkAuth(request: NextRequest): boolean {
  const auth = request.headers.get('authorization');
  return auth === 'Bearer ' + ADMIN_TOKEN;
}

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
        'Authorization': 'Bearer ' + ADMIN_TOKEN,
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
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    return NextResponse.json(
      { error: 'Bulk processing failed', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
