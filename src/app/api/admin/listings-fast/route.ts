/**
 * /api/admin/listings-fast — Fix 36 (옵션 2)
 *
 * 사장님 명령 2026-05-11 "옵션 2 어떻게든 해결":
 *   기존 /api/admin/listings 그대로 보존 + 새 endpoint 로 RPC 사용.
 *   v348 patch (URL redirect) 가 fetch 를 이쪽으로 라우팅.
 *   회귀 시 patch 만 disable → 즉시 기존 endpoint fallback (위험 0).
 *
 * RPC: get_admin_listings_minimal_v1(p_scope_uid, p_limit, p_offset)
 *   - DB 측정: 1000 rows 94ms / 60K 6.9s
 *   - 기존 paginated query 18s 대비 2.6배 빠름
 *   - Slim building_info + thumb_url 자동 처리 (Fix 32b 효과 포함)
 *
 * 응답 형태: 기존과 100% 동일 (success / data / total / scope / scope_auth)
 *   - listing_images: thumb_url → [{url}] 변환
 *
 * Cache: 기존 endpoint 와 동일 (public, s-maxage=3600)
 *   vercel.json /api/admin/listings(.*) wildcard 에 의해 자동 적용
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';
import { unstable_cache } from 'next/cache';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

    // Scope 처리 (기존 endpoint 와 동일)
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

    // unstable_cache 로 Node 레벨 메모이제이션 (300s)
    const cacheKey: string[] = scope === 'mine'
      ? ['listings-fast-mv-v1-mine', scopeUid as string]
      : ['listings-fast-mv-v1'];

    const getCached = unstable_cache(
      async () => {
        const _start = Date.now();
        const { data: rpcData, error: rpcErr } = await supabase
          .rpc('get_admin_listings_minimal_v1', {
            p_scope_uid: scope === 'mine' ? scopeUid : null,
            p_limit: 100000,
            p_offset: 0,
          });

        if (rpcErr) {
          console.error('[admin/listings-fast] RPC error:', rpcErr);
          return { data: null, error: rpcErr };
        }

        const rows = Array.isArray(rpcData) ? rpcData : [];
        console.log('[admin/listings-fast] RPC returned', rows.length, 'rows in', (Date.now() - _start) + 'ms');

        // Slim 처리 — RPC 가 이미 building_info slim + thumb_url 처리
        // 추가로: thumb_url -> listing_images: [{url}] 형태 변환 (기존 응답 형태 호환)
        // null/undefined/false/empty 제거 (기존 응답과 동일)
        const slim = rows.map((row: any) => {
          if (!row || typeof row !== 'object') return null;

          // thumb_url -> listing_images 형태 변환
          if (row.thumb_url) {
            row.listing_images = [{ url: row.thumb_url }];
          } else {
            row.listing_images = [];
          }
          delete row.thumb_url;

          // null/undefined/false/empty 제거 (응답 size 절감)
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
      // RPC fail → 즉시 기존 endpoint 응답 형태로 빈 배열 반환 (client 가 fallback 가능)
      return NextResponse.json(
        {
          success: false,
          error: 'RPC failed: ' + (cacheErr ? JSON.stringify(cacheErr) : 'unknown'),
          data: [],
          total: 0,
          scope,
          scope_auth: scopeAuth,
          fallback_hint: 'use /api/admin/listings instead',
        },
        { status: 503 }
      );
    }

    // Pagination (기존 endpoint 와 동일)
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
      _source: 'fast-rpc',
    });

    const etag = '"' + createHash('sha1').update(bodyStr).digest('hex').substring(0, 16) + '"';
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Cache-Control': scope === 'mine'
            ? 'private, max-age=30'
            : 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      });
    }

    return new NextResponse(bodyStr, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'ETag': etag,
        'Cache-Control': scope === 'mine'
          ? 'private, max-age=30'
          : 'public, s-maxage=3600, stale-while-revalidate=86400',
        'Vary': scope === 'mine' ? 'Accept-Encoding, Authorization' : 'Accept-Encoding',
      },
    });
  } catch (e: any) {
    console.error('[admin/listings-fast] unexpected error:', e);
    return NextResponse.json(
      {
        success: false,
        error: String(e?.message || e),
        fallback_hint: 'use /api/admin/listings instead',
      },
      { status: 500 }
    );
  }
}
