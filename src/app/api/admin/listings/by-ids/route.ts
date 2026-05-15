// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/listings/by-ids
// 매물 ID 배열로 bulk 조회 (관심목록 / 비교 / 인쇄 / AI 등 on-demand fetch 용)
// max 200건/요청
//
// Phase C - 사장님 명령 2026-05-15: 서버 페이지네이션 도입 시 detail-by-id 변환 지원
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/cors';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { isSelfHostedImage, preferSelfHostedImages } from '@/lib/image-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const MAX_IDS = 200;

// page-route 의 SELECT_FIELDS 와 동일 (호환성)
const SELECT_FIELDS = [
  'id', 'title', 'type', 'deal', 'status',
  'deposit', 'monthly', 'price', 'maintenance_fee',
  'area_m2', 'area_supply_m2',
  'floor_current', 'floor_total',
  'rooms', 'bathrooms', 'direction',
  'address', 'address_detail', 'dong',
  'building_name', 'building_dong', 'building_ho',
  'lat', 'lng', 'available_date', 'built_year',
  'parking', 'elevator', 'pet', 'balcony', 'full_option', 'loan_available',
  'business_type', 'goodwill_fee', 'station_name', 'station_distance',
  'created_at', 'created_by', 'last_verified_at', 'source_site', 'updated_at',
  'road_address', 'road_address_fetched_at',
  'building_info',
].join(',');

// [2026-05-15 사장님 명령] CDN host 확장: cloudfront + workers.dev
function shrinkCardImg(url?: string): string | undefined {
  if (!url) return url;
  const isResizable = /d4k1brqee4emz\.cloudfront\.net/i.test(url) ||
                      /\.workers\.dev/i.test(url);
  if (!isResizable) return url;
  if (/[?&]w=\d+/.test(url)) {
    return url.replace(/([?&])w=\d+/g, '$1w=220');
  }
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'w=220';
}

function buildHeroUrl(url?: string): string | undefined {
  if (!url) return url;
  const isResizable = /d4k1brqee4emz\.cloudfront\.net/i.test(url) ||
                      /\.workers\.dev/i.test(url);
  if (!isResizable) return url;
  let h = url;
  if (/[?&]w=\d+/.test(h)) {
    h = h.replace(/([?&])w=\d+/g, '$1w=1200');
  } else {
    h = h + (h.indexOf('?') >= 0 ? '&' : '?') + 'w=1200';
  }
  return '/api/img-proxy?url=' + encodeURIComponent(h) + '&nocap=1';
}

function slimRow(row: any, imgUrl?: string): any {
  row.listing_images = imgUrl
    ? [{ url: shrinkCardImg(imgUrl), hero_url: buildHeroUrl(imgUrl) }]
    : [];
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

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: adminCorsHeaders(req, 'POST, OPTIONS') });
}

export async function POST(request: NextRequest) {
  const cors = adminCorsHeaders(request, 'POST, OPTIONS');
  const _t0 = Date.now();
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401, headers: cors }
      );
    }

    let body: any = {};
    try { body = await request.json(); } catch { /* empty */ }

    const idsRaw = Array.isArray(body?.ids) ? body.ids : [];
    const ids: number[] = idsRaw
      .map((x: any) => parseInt(x, 10))
      .filter((x: number) => Number.isInteger(x) && x > 0)
      .slice(0, MAX_IDS);

    if (ids.length === 0) {
      return NextResponse.json(
        { success: true, data: [], _ms: Date.now() - _t0 },
        { headers: { ...cors, 'Cache-Control': 'private, no-store' } }
      );
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('listings')
      .select(SELECT_FIELDS)
      .in('id', ids);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message, _ms: Date.now() - _t0 },
        { status: 500, headers: cors }
      );
    }

    // 이미지 (id → first url) 매칭
    const imageByListing: Record<string, string> = {};
    try {
      const { data: imgs } = await supabase
        .from('listing_images')
        .select('listing_id, url, sort_order')
        .in('listing_id', ids)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .limit(MAX_IDS * 5);
      if (imgs) {
        for (const im of imgs as any[]) {
          const lid = String(im.listing_id);
          if (!imageByListing[lid] && im.url) imageByListing[lid] = im.url;
        }
      }
    } catch { /* images optional */ }

    const transformed: any[] = [];
    for (const row of (data || [])) {
      const imgUrl = imageByListing[String(row.id)];
      transformed.push(slimRow(row, imgUrl));
    }

    // 입력 순서 보존 (Map 순서 vs DB 응답 순서 차이 보정)
    const byId: Record<string, any> = {};
    for (const r of transformed) byId[String(r.id)] = r;
    const ordered = ids
      .map(i => byId[String(i)])
      .filter(Boolean);

    return NextResponse.json(
      { success: true, data: ordered, total: ordered.length, _ms: Date.now() - _t0 },
      { headers: { ...cors, 'Cache-Control': 'private, no-store', 'Vary': 'Authorization' } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'unknown', _ms: Date.now() - _t0 },
      { status: 500, headers: cors }
    );
  }
}
