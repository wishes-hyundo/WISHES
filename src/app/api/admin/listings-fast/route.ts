/**
 * /api/admin/listings-fast — Fix 36c (chunked parallel RPC)
 *
 * 사장님 회귀 분석 (2026-05-11):
 *   v1 의 RPC 호출 1번 (LIMIT 100000) → PostgREST 8s statement_timeout 초과 → 503.
 *   v2: 5000 rows × 12 chunks parallel. 각 chunk 396ms (DB 측정), 모두 8s timeout 안.
 *   chunks 동시 5개 batch → memory 분산, supabase pool 안전.
 *
 * Empty chunk 시 stop (사장님 scope=mine 일 때 보통 3,121 rows = 1 chunk 만 필요).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';
import { unstable_cache } from 'next/cache';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHUNK_SIZE = 5000;
const MAX_TOTAL = 200000;  // safety cap
const PARALLEL_CHUNKS = 5;  // 5 chunks 동시 (supabase pool 안전)

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAuth(request))) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    const scopeParam = (searchParams.get('scope') || 'all').toLowerCase();
    let scope: 'all' | 'mine' = scopeParam === 'mine' ? 'mine' : 'all';
    let scopeUid: string | null = null;
    let scopeAuth: 'ok' | 'failed_degrade_all' | null = null;

    if (scope === 'mine') {
      try {
        const authHdr = request.headers.get('authorization') || '';
        let token = authHdr.replace(/^Bearer\s+/i, '').trim();
        while (token.startsWith('admin_bridge_')) token = token.slice('admin_bridge_'.length);
        if (token.startsWith('eyJ') && token.split('.').length === 3 && token.length > 40) {
          const { data } = await Promise.race([
            supabase.auth.getUser(token),
            new Promise<{ data: { user: null } }>((_, rej) =>
              setTimeout(() => rej(new Error('uid_timeout')), 2000)
            ),
          ]) as { data: { user: { id: string } | null } };
          scopeUid = data?.user?.id ?? null;
        }
      } catch { /* fall through */ }
      if (!scopeUid) {
        scope = 'all';
        scopeAuth = 'failed_degrade_all';
      } else {
        scopeAuth = 'ok';
      }
    }

    const cacheKey: string[] = scope === 'mine'
      ? ['listings-fast-chunked-v1-mine', scopeUid as string]
      : ['listings-fast-chunked-v1'];

    const getCached = unstable_cache(
      async () => {
        const _start = Date.now();
        const allRows: any[] = [];
        let off = 0;
        let stopped = false;
        const errors: string[] = [];

        while (!stopped && off < MAX_TOTAL) {
          // Build batch of N chunks
          const offsets: number[] = [];
          for (let i = 0; i < PARALLEL_CHUNKS && off + i * CHUNK_SIZE < MAX_TOTAL; i++) {
            offsets.push(off + i * CHUNK_SIZE);
          }

          // Parallel call
          const results = await Promise.all(
            offsets.map((o) =>
              supabase.rpc('get_admin_listings_minimal_v1', {
                p_scope_uid: scope === 'mine' ? scopeUid : null,
                p_limit: CHUNK_SIZE,
                p_offset: o,
              })
            )
          );

          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r.error) {
              errors.push(`chunk@${offsets[i]}: ${r.error.message}`);
              stopped = true;
              break;
            }
            if (!Array.isArray(r.data) || r.data.length === 0) {
              stopped = true;
              break;
            }
            allRows.push(...r.data);
            if (r.data.length < CHUNK_SIZE) {
              stopped = true;
              break;
            }
          }

          off += PARALLEL_CHUNKS * CHUNK_SIZE;
        }

        if (errors.length > 0 && allRows.length === 0) {
          return { data: null, error: { message: errors.join(' | ') } };
        }

        console.log('[admin/listings-fast] chunked RPC: ' + allRows.length + ' rows in ' + (Date.now() - _start) + 'ms');

        // Slim — RPC 가 이미 처리. listing_images 형태 변환 + null 제거.
        const slim = allRows.map((row: any) => {
          if (!row || typeof row !== 'object') return null;
          row.listing_images = row.thumb_url ? [{ url: row.thumb_url }] : [];
          delete row.thumb_url;
          const out: any = {};
          for (const k in row) {
            const v = row[k];
            if (v === null || v === undefined || v === '' || v === false) continue;
            if (Array.isArray(v) && v.length === 0) continue;
            out[k] = v;
          }
          return out;
        }).filter((r: any) => r !== null);

        return { data: slim, error: null };
      },
      cacheKey,
      { revalidate: 300, tags: ['listings'] }
    );

    const { data: allData, error: cacheErr } = await getCached();

    if (cacheErr || !allData) {
      return NextResponse.json(
        {
          success: false,
          error: 'RPC failed: ' + (cacheErr ? cacheErr.message : 'unknown'),
          data: [],
          total: 0,
          scope,
          scope_auth: scopeAuth,
          fallback_hint: 'use /api/admin/listings instead',
        },
        { status: 503 }
      );
    }

    const limitParam = searchParams.get('limit');
    const cursorParam = searchParams.get('cursor');
    let pageData = allData;
    let nextCursor: string | null = null;
    if (limitParam && /^\d+$/.test(limitParam)) {
      const limit = Math.min(parseInt(limitParam, 10), 1000);
      let startIdx = 0;
      if (cursorParam && /^\d+$/.test(cursorParam)) {
        const idx = allData.findIndex((r: any) => String(r.id) === cursorParam);
        if (idx >= 0) startIdx = idx + 1;
      }
      pageData = allData.slice(startIdx, startIdx + limit);
      if (startIdx + limit < allData.length && pageData.length > 0) {
        nextCursor = String(pageData[pageData.length - 1].id);
      }
    }

    const bodyStr = JSON.stringify({
      success: true,
      data: pageData,
      total: allData.length,
      ...(nextCursor !== null ? { nextCursor } : {}),
      ...(limitParam ? { paginated: true, returned: pageData.length } : {}),
      scope,
      scope_auth: scopeAuth,
      _source: 'fast-chunked-rpc',
    });

    const etag = '"' + createHash('sha1').update(bodyStr).digest('hex').substring(0, 16) + '"';
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Cache-Control': scope === 'mine' ? 'private, max-age=30' : 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      });
    }

    return new NextResponse(bodyStr, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'ETag': etag,
        'Cache-Control': scope === 'mine' ? 'private, max-age=30' : 'public, s-maxage=3600, stale-while-revalidate=86400',
        'Vary': scope === 'mine' ? 'Accept-Encoding, Authorization' : 'Accept-Encoding',
      },
    });
  } catch (e: any) {
    console.error('[admin/listings-fast] unexpected error:', e);
    return NextResponse.json(
      {
        success: false,
        error: String(e?.message || e),
        error_detail: {
          name: e?.name,
          stack: e?.stack?.substring(0, 500),
        },
        fallback_hint: 'use /api/admin/listings instead',
      },
      { status: 500 }
    );
  }
}
