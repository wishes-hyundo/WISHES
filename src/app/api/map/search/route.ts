// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/map/search — 자연어 매물 검색 (하이브리드 · 소프트필터)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 2026 PropTech 표준 (직방·호갱노노 "AI중개사") 자연어 검색.
//
// 🎯 전략: Hybrid Search + Soft Filter
//   - HARD 필터 (사용자가 명시한 수치 상한/하한만): 보증금·월세·가격·면적·방수
//   - SOFT 필터 (구조적 선호 → 랭크 부스트만, 제외하지 않음):
//       거래유형(deal), 매물유형(type), 지역(dong), 옵션(parking/elevator/pet)
//   - Stage 1. ai-match-parser 로 구조화 힌트 추출 (수치/키워드)
//   - Stage 2. MV 후보 풀 (HARD 필터만 적용) + pg_trgm 잔여 키워드
//   - Stage 3. OPENAI_EMBEDDING 있으면 pgvector match_listings 병행 호출
//   - Stage 4. 구조 부스트 (type/deal/parking/…) + 유사도 결합 → 상위 50건
//
// 응답 shape 은 /api/listings/map 과 동일 (클라이언트 코드 재사용)

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { parseMatchQuery } from '@/lib/ai-match-parser';
import { applyImagePolicy } from '@/lib/image-policy';
import { cached } from '@/lib/cache';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

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
  parking?: boolean | null;
  elevator?: boolean | null;
  pet?: boolean | null;
  rooms?: number | null;
  listing_images?: { url: string }[] | null;
  similarity?: number;
  rank_score?: number;
  match_reasons?: string[];
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

    // L-sec68 (2026-04-22): 유료 API 종단 보호
    //   OPENAI embeddings + pgvector + pg_trgm 이 매 요청마다 도는 나감.
    //   5분 40회/IP cap 으로 OpenAI 토큰/Supabase 비용 보호.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `map:search:ip:${_ip}`, limit: 40, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: '검색이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    // L-sec23 (2026-04-22): 공개 GET. q 가 OpenAI embeddings API 로 흘러가
    //   호출 비용이 사용자당 누적됨. 장문 페이로드로 할당량 고갈 방지.
    //   실사용 자연어 질의는 100자 이내.
    if (q.length > 500) {
      return NextResponse.json(
        { success: false, error: 'query too long' },
        { status: 400 }
      );
    }

    const swLatRaw = parseFloat(searchParams.get('swLat') || 'NaN');
    const swLngRaw = parseFloat(searchParams.get('swLng') || 'NaN');
    const neLatRaw = parseFloat(searchParams.get('neLat') || 'NaN');
    const neLngRaw = parseFloat(searchParams.get('neLng') || 'NaN');
    // L-sec23: 위/경도 범위 검증 (한국 기준: lat 33~39, lng 124~132 여유).
    //   Infinity/NaN/말도 안 되는 좌표로 PostgREST 를 흔들지 못하게 차단.
    const inLat = (v: number) => Number.isFinite(v) && v >= -90 && v <= 90;
    const inLng = (v: number) => Number.isFinite(v) && v >= -180 && v <= 180;
    const boundsValid =
      inLat(swLatRaw) && inLat(neLatRaw) && inLng(swLngRaw) && inLng(neLngRaw);
    const swLat = boundsValid ? swLatRaw : NaN;
    const swLng = boundsValid ? swLngRaw : NaN;
    const neLat = boundsValid ? neLatRaw : NaN;
    const neLng = boundsValid ? neLngRaw : NaN;
    const hasBounds = boundsValid;

    // Stage 1: 결정적 파서
    const parsed = parseMatchQuery(q);

    const cacheKey = `search:v2:${q}:${hasBounds ? `${swLat.toFixed(2)},${swLng.toFixed(2)}-${neLat.toFixed(2)},${neLng.toFixed(2)}` : 'any'}`;

    const result = await cached(
      cacheKey,
      async () => {
        const supabase = createServerClient();
        const hasVector = !!process.env.OPENAI_API_KEY;

        // ── Stage 2: HARD 필터 (수치 상·하한만) ──
        //   type/deal/dong/parking/... 은 의도적으로 제외 (랭크에서 부스트)
        let base = supabase
          .from('mv_map_listings')
          .select(
            'id, title, ai_title, type, deal, deposit, monthly, price, lat, lng, dong, thumb_url, area_pyeong, source_site, building_name, address, parking, elevator, pet, rooms, updated_at',
          );

        // 수치 bound — 사용자가 명시한 상·하한이므로 HARD
        if (parsed.maxDeposit) base = base.lte('deposit', parsed.maxDeposit);
        if (parsed.minDeposit) base = base.gte('deposit', parsed.minDeposit);
        if (parsed.maxMonthly) base = base.lte('monthly', parsed.maxMonthly);
        if (parsed.minArea) base = base.gte('area_m2', parsed.minArea);
        if (parsed.maxArea) base = base.lte('area_m2', parsed.maxArea);

        // 벡터 없는 폴백 모드: 구조 필터를 HARD로 적용해 노이즈 억제
        //   (벡터가 있으면 구조 부스트로 대체)
        if (!hasVector) {
          if (parsed.deal) base = base.eq('deal', parsed.deal);
          if (parsed.type) base = base.eq('type_normalized', parsed.type);
          if (parsed.dong) base = base.eq('dong', parsed.dong);
          if (parsed.rooms) base = base.eq('rooms', parsed.rooms);
          if (parsed.parking) base = base.eq('parking', true);
          if (parsed.elevator) base = base.eq('elevator', true);
          if (parsed.pet) base = base.eq('pet', true);
        }

        if (hasBounds) {
          base = base
            .gte('lat', swLat).lte('lat', neLat)
            .gte('lng', swLng).lte('lng', neLng);
        }

        // 잔여 키워드 pg_trgm ILIKE
        const residue = (parsed.residue || '').replace(/\s+/g, ' ').trim();
        if (residue && residue.length >= 2) {
          // L-sec106 (2026-04-22): PostgREST .or() filter injection 차단 — L-sec106 로직 참조
          //   (listings/route.ts 와 동일 패턴).
          const rEscaped = residue.replace(/"/g, '""').replace(/%/g, '\\%');
          const pattern = '"%' + rEscaped + '%"';
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
          .limit(SEARCH_LIMIT * 4);
        if (kwErr) throw kwErr;

        // ── Stage 3: pgvector 재랭킹 (선택적) ──
        const vec = hasVector ? await embedQuery(q) : null;
        let vectorRows: SearchRow[] = [];
        if (vec) {
          const { data: vr } = await supabase.rpc('match_listings', {
            query_embedding: vec,
            match_threshold: 0.35, // 소프트필터 전환으로 임계값 완화 (0.65→0.35)
            match_count: SEARCH_LIMIT * 2,
            sw_lat: hasBounds ? swLat : null,
            sw_lng: hasBounds ? swLng : null,
            ne_lat: hasBounds ? neLat : null,
            ne_lng: hasBounds ? neLng : null,
          });
          vectorRows = (vr || []) as SearchRow[];
        }

        // ── Stage 4: 구조 부스트 + 병합 랭크 ──
        const BOOST = {
          type: 0.25,
          deal: 0.20,
          dong: 0.18,
          parking: 0.10,
          elevator: 0.05,
          pet: 0.05,
          rooms: 0.12,
        };

        const applyBoost = (r: SearchRow): SearchRow => {
          const reasons: string[] = [];
          let boost = 0;
          if (parsed.type && r.type === parsed.type) {
            boost += BOOST.type; reasons.push(parsed.type);
          }
          if (parsed.deal && r.deal === parsed.deal) {
            boost += BOOST.deal; reasons.push(parsed.deal);
          }
          if (parsed.dong && r.dong && r.dong.includes(parsed.dong)) {
            boost += BOOST.dong; reasons.push(parsed.dong);
          }
          if (parsed.parking && r.parking) {
            boost += BOOST.parking; reasons.push('주차');
          }
          if (parsed.elevator && r.elevator) {
            boost += BOOST.elevator; reasons.push('엘리베이터');
          }
          if (parsed.pet && r.pet) {
            boost += BOOST.pet; reasons.push('반려가능');
          }
          if (parsed.rooms && r.rooms === parsed.rooms) {
            boost += BOOST.rooms; reasons.push(`${parsed.rooms}룸`);
          }
          const base = r.rank_score ?? (r.similarity ?? 0.3);
          return { ...r, rank_score: base + boost, match_reasons: reasons };
        };

        const byId = new Map<number, SearchRow>();
        for (const r of (keywordRows || []) as SearchRow[]) {
          // 키워드 매치는 기본 0.4 (벡터 유사도와 동등 수준으로 시작)
          byId.set(r.id, applyBoost({ ...r, rank_score: 0.4 }));
        }
        for (const r of vectorRows) {
          const prev = byId.get(r.id);
          const sim = r.similarity ?? 0;
          if (prev) {
            // 벡터도 맞으면 유사도만큼 추가 가산
            prev.rank_score = (prev.rank_score || 0) + sim * 0.6;
            prev.similarity = sim;
          } else {
            byId.set(r.id, applyBoost({ ...r, rank_score: sim }));
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
