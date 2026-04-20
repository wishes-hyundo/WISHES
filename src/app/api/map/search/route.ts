// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/map/search — 자연어 매물 검색 (하이브리드)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 2026 PropTech 표준 (직방·호갱노노 "AI중개사") 에 맞춘 자연어 검색.
//
// 🎯 전략: Hybrid Search (비용 0 → pgvector 보강)
//   Stage 1. ai-match-parser 로 결정적 필터 추출 (deal/type/dong/price/area/rooms)
//   Stage 2. 잔여 키워드는 pg_trgm GIN 인덱스로 title/address/building_name ILIKE
//   Stage 3. (선택) OPENAI_EMBEDDING_API_KEY 있으면 pgvector match_listings 호출 → 재랭킹
//   Stage 4. bounds 교차 필터 후 상위 50건 반환
//
// 응답 shape 은 /api/listings/map 과 동일 (클라이언트 코드 재사용)

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { parseMatchQuery } from '@/lib/ai-match-parser';
import { applyImagePolicy } from '@/lib/image-policy';
import { cached } from '@/lib/cache';

const SEARCH_LIMIT = 50;

interface SearchRow {
  id: number;
  title?: string | null;
  ai_title?: string | null;
  type?: string | null;
  deal?: string | null;
  deposit?: bigint | number | null;
  monthly?: bigint | number | null;
  price?: bigint | number | null;
  lat?: number | null;
  lng?: number | null;
  dong?: string | null;
  thumb_url?: string | null;
  area_pyeong?: number | null;
  source_site?: string | null;
  listing_images?: { url: string }[] | null;
  similarity?: number;
  rank_score?: number;
}

/**
 * OpenAI 임베딩 (text-embedding-3-small, 384 dim).
 * API 키가 없으면 null 반환 → pgvector 단계 스킵.
 */
async function embedQuery(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 384,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    if (!q) {
      return NextResponse.json({ success: true, data: [], total: 0, parsed: null });
    }

    const swLat = parseFloat(searchParams.get('swLat') || 'NaN');
    const swLng = parseFloat(searchParams.get('swLng') || 'NaN');
    const neLat = parseFloat(searchParams.get('neLat') || 'NaN');
    const neLng = parseFloat(searchParams.get('neLng') || 'NaN');
    const hasBounds = ![swLat, swLng, neLat, neLng].some(Number.isNaN);

    // Stage 1: 결정적 파서
    const parsed = parseMatchQuery(q);

    const cacheKey = `search:${q}:${hasBounds ? `${swLat.toFixed(2)},${swLng.toFixed(2)}-${neLat.toFixed(2)},${neLng.toFixed(2)}` : 'any'}`;

    const result = await cached(
      cacheKey,
      async () => {
        const supabase = createServerClient();

        // ── Stage 2: 구조화 필터 + 키워드 검색 (MV 기반) ──
        let base = supabase
          .from('mv_map_listings')
          .select('id, title, ai_title, type, deal, deposit, monthly, price, lat, lng, dong, thumb_url, area_pyeong, source_site, building_name, address, updated_at');
        if (parsed.deal) base = base.eq('deal', parsed.deal);
        if (parsed.type) base = base.eq('type', parsed.type);
        if (parsed.dong) base = base.eq('dong', parsed.dong);
        if (parsed.maxDeposit) base = base.lte('deposit', parsed.maxDeposit);
        if (parsed.minDeposit) base = base.gte('deposit', parsed.minDeposit);
        if (parsed.maxMonthly) base = base.lte('monthly', parsed.maxMonthly);
        if (parsed.minArea) base = base.gte('area_m2', parsed.minArea);
        if (parsed.maxArea) base = base.lte('area_m2', parsed.maxArea);
        if (parsed.rooms) base = base.eq('rooms', parsed.rooms);
        if (parsed.parking) base = base.eq('parking', true);
        if (parsed.elevator) base = base.eq('elevator', true);
        if (parsed.pet) base = base.eq('pet', true);
        if (hasBounds) {
          base = base
            .gte('lat', swLat).lte('lat', neLat)
            .gte('lng', swLng).lte('lng', neLng);
        }

        // 잔여 키워드가 있으면 pg_trgm 계열 ILIKE 로 조건 추가
        const residue = (parsed.residue || '').replace(/\s+/g, ' ').trim();
        if (residue && residue.length >= 2) {
          const pattern = '%' + residue.replace(/%/g, '\\%') + '%';
          base = base.or(
            [
              `title.ilike.${pattern}`,
              `ai_title.ilike.${pattern}`,
              `building_name.ilike.${pattern}`,
              `address.ilike.${pattern}`,
            ].join(','),
          );
        }

        const { data: keywordRows, error: kwErr } = await base
          .order('updated_at', { ascending: false, nullsFirst: false })
          .limit(SEARCH_LIMIT * 2);
        if (kwErr) throw kwErr;

        // ── Stage 3: pgvector 재랭킹 (선택적) ──
        const vec = await embedQuery(q);
        let vectorRows: SearchRow[] = [];
        if (vec) {
          const { data: vr } = await supabase.rpc('match_listings', {
            query_embedding: vec,
            match_threshold: 0.65,
            match_count: SEARCH_LIMIT,
            sw_lat: hasBounds ? swLat : null,
            sw_lng: hasBounds ? swLng : null,
            ne_lat: hasBounds ? neLat : null,
            ne_lng: hasBounds ? neLng : null,
          });
          vectorRows = (vr || []) as SearchRow[];
        }

        // ── Stage 4: 병합 + 랭크 ──
        const byId = new Map<number, SearchRow>();
        for (const r of (keywordRows || []) as SearchRow[]) {
          byId.set(r.id, { ...r, rank_score: 0.5 });
        }
        for (const r of vectorRows) {
          const prev = byId.get(r.id);
          const bonus = r.similarity || 0;
          if (prev) {
            prev.rank_score = (prev.rank_score || 0) + bonus;
            prev.similarity = r.similarity;
          } else {
            byId.set(r.id, { ...r, rank_score: bonus });
          }
        }

        const merged = Array.from(byId.values())
          .sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0))
          .slice(0, SEARCH_LIMIT);

        return merged;
      },
      30_000,
      300_000,
      6_000,
    );

    if (!result) {
      return NextResponse.json(
        { success: true, data: [], total: 0, parsed, stale: true },
        { headers: { 'Cache-Control': 'no-cache' } },
      );
    }

    // listing_images shape 정규화 + 이미지 정책
    const sanitized = result.map((r) => {
      const imgs = r.thumb_url ? [{ url: r.thumb_url }] : [];
      return applyImagePolicy({ ...r, listing_images: imgs });
    });

    return NextResponse.json(
      {
        success: true,
        data: sanitized,
        total: sanitized.length,
        parsed,
        vector_enabled: !!process.env.OPENAI_API_KEY,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    console.error('map/search 오류:', error);
    return NextResponse.json(
      { success: false, error: '검색 실패' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
