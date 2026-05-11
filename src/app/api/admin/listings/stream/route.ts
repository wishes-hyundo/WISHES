// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET /api/admin/listings/stream
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 옵션 Z Step 1 — Streaming Response (사장님 명령 2026-05-11).
//
// 진단 결과:
//   28초 분해: TTFB 12.2초 + Download 1.4초 + Parse+Render 13.8초
//   JSON 원본 47.7MB (압축 5.9MB)
//   60K 매물 한 번에 처리 = 본질적 병목
//
// 목적:
//   매물 NDJSON streaming → 클라이언트가 first chunk 1-2초 안에 받아 즉시 render.
//   TTFB 12초 → first byte 100-500ms (chunked transfer encoding).
//
// 응답 형식 (NDJSON — newline-delimited JSON):
//   {"type":"header","ts":1234567890}\n
//   {"id":"...","title":"...","listing_images":[...],...}\n  ← 매물 1건
//   {"id":"...","title":"...",...}\n
//   ...
//   {"type":"footer","total":62418,"pages":7}\n
//
// Streaming 흐름:
//   - DB chunked fetch (10K × 7 pages) — 각 page 받자마자 stream 으로 송신
//   - listing_images IN query 도 page 마다 수행
//   - 첫 page (10K rows) 약 1.5초 → client 즉시 첫 매물 보기
//   - 총 7-10초 안 60K 전체 stream 완료
//
// 회귀 회피 (회귀 9번 학습):
//   - 새 endpoint → 기존 /api/admin/listings, /mv, /fast, /search 안 건드림
//   - cache key 충돌 X (no-store)
//   - 등록 안 하면 prod 영향 0
//   - 인증: verifyAdminAuth 필수 (기존과 동일)
//   - selectFields: /api/admin/listings?fields=minimal 과 100% 동일 (회귀 회피)
//
// 보안:
//   - verifyAdminAuth 필수
//   - parameterized query (supabase-js)
//   - X-Content-Type-Options: nosniff

import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/cors';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { isSelfHostedImage, preferSelfHostedImages } from '@/lib/image-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: adminCorsHeaders(req, 'GET, OPTIONS') });
}

const SELECT_FIELDS = [
  'id', 'title', 'type', 'deal', 'status',
  'deposit', 'monthly', 'price',
  'maintenance_fee',
  'area_m2', 'area_supply_m2',
  'floor_current', 'floor_total',
  'rooms', 'bathrooms', 'direction',
  'address', 'address_detail', 'dong',
  'building_name',
  'building_dong', 'building_ho',
  'lat', 'lng',
  'available_date', 'built_year',
  'parking', 'elevator', 'pet', 'balcony', 'full_option', 'loan_available',
  'business_type', 'goodwill_fee',
  'station_name', 'station_distance',
  'created_at',
  'created_by',
  'last_verified_at',
  'source_site',
  'updated_at',
  'building_info',
].join(',');

function slimRow(row: any, imgUrl?: string): any {
  // listing_images 설정
  row.listing_images = imgUrl ? [{ url: imgUrl }] : [];

  // image-policy: 크롤링 매물 외부 호스트 이미지 처리
  if (row.source_site) {
    const policed = preferSelfHostedImages({
      source_site: row.source_site,
      listing_images: row.listing_images || [],
    });
    row.listing_images = policed.listing_images;
    if (row.thumbnail_url && !isSelfHostedImage(row.thumbnail_url)) {
      row.thumbnail_url = null;
    }
  }

  // building_info 슬림 (도로명/지번만)
  if (row.building_info && typeof row.building_info === 'object') {
    const bi = row.building_info;
    const newBi: any = {};
    if (bi['도로명주소']) newBi['도로명주소'] = bi['도로명주소'];
    if (bi['지번주소']) newBi['지번주소'] = bi['지번주소'];
    row.building_info = newBi;
  }

  // in-place null/empty delete (응답 size 20-30% 절감)
  for (const k in row) {
    const v = row[k];
    if (v === null || v === undefined || v === '' || v === false) {
      delete row[k];
    } else if (Array.isArray(v) && v.length === 0) {
      delete row[k];
    } else if (typeof v === 'object' && !Array.isArray(v) && v !== null && Object.keys(v).length === 0) {
      delete row[k];
    }
  }
  return row;
}

export async function GET(request: NextRequest) {
  const _t0 = Date.now();

  // 인증 (streaming 전에 먼저 확인)
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);

  // scope 처리
  const scopeParam = (searchParams.get('scope') || 'all').toLowerCase();
  let scope: 'all' | 'mine' = scopeParam === 'mine' ? 'mine' : 'all';
  let scopeUid: string | null = null;
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
    } catch { /* degrade */ }
    if (!scopeUid) scope = 'all';
  }

  const encoder = new TextEncoder();
  const PAGE_SIZE = 10000;
  const MAX_PAGES = 10;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Header chunk (즉시 송신, TTFB 단축) ──
        controller.enqueue(encoder.encode(JSON.stringify({
          type: 'header',
          ts: Date.now(),
          scope,
        }) + '\n'));

        let totalSent = 0;
        let pageCount = 0;

        for (let i = 0; i < MAX_PAGES; i++) {
          const from = i * PAGE_SIZE;
          const to = from + PAGE_SIZE - 1;
          const _pageStart = Date.now();

          // 1) listings page query
          let q: any = supabase
            .from('listings')
            .select(SELECT_FIELDS)
            .order('created_at', { ascending: false })
            .range(from, to);
          if (scope === 'mine' && scopeUid) q = q.eq('created_by', scopeUid);

          const { data, error } = await q;
          pageCount++;

          if (error) {
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'error',
              page: pageCount,
              error: error.message,
            }) + '\n'));
            break;
          }

          if (!data || data.length === 0) break;

          // 2) listing_images IN query (이 page 의 ids 만)
          const ids = data.map((r: any) => r.id);
          const imageByListing: Record<string, string> = {};
          try {
            const { data: imgs } = await supabase
              .from('listing_images')
              .select('listing_id, url, sort_order')
              .in('listing_id', ids)
              .order('sort_order', { ascending: true, nullsFirst: false })
              .limit(50000);
            if (imgs) {
              for (const im of imgs as any[]) {
                const lid = String(im.listing_id);
                if (!imageByListing[lid] && im.url) imageByListing[lid] = im.url;
              }
            }
          } catch (e) {
            // image fetch 실패해도 listings 는 stream (degrade)
          }

          const _pageDbMs = Date.now() - _pageStart;

          // 3) Transform + stream each row (NDJSON line-by-line)
          for (const row of data) {
            const imgUrl = imageByListing[String(row.id)];
            const slim = slimRow(row, imgUrl);
            controller.enqueue(encoder.encode(JSON.stringify(slim) + '\n'));
          }
          totalSent += data.length;

          // Page progress chunk (선택 — client 가 progress bar 그리도록)
          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'page',
            page: pageCount,
            rows: data.length,
            total_sent: totalSent,
            page_ms: _pageDbMs,
            elapsed_ms: Date.now() - _t0,
          }) + '\n'));

          if (data.length < PAGE_SIZE) break;
        }

        // ── Footer chunk ──
        controller.enqueue(encoder.encode(JSON.stringify({
          type: 'footer',
          total: totalSent,
          pages: pageCount,
          total_ms: Date.now() - _t0,
          done: true,
        }) + '\n'));

        controller.close();
      } catch (e: any) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'fatal',
            error: e?.message || 'unknown',
          }) + '\n'));
        } catch { /* already closed */ }
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Accel-Buffering': 'no',         // disable nginx buffering (Vercel)
      'X-Content-Type-Options': 'nosniff',
      'Transfer-Encoding': 'chunked',
      'Vary': 'Authorization',
    },
  });
}
