// auto-regenerate-ai-desc — Pure Symbolic Briefing (LLM 0%, 환각 0%)
// 작성: 2026-04-29 사장님 명령 "단 하나의 거짓도 없이 + 추가 가치 정보만"
//
// LLM 미사용 → 환각 수학적 0% 보장
// 검증된 enrich 데이터 + station_top3 + 매물 등록자 입력 사실만 사용
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { findStationsForListing } from '@/lib/subway-finder';
import { buildBriefing, type BriefingInput } from '@/lib/listing-briefing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 50;  // LLM 0% 라 빠름, 50건 가능

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (cronSecret && !isUserSecret && !isVercelCron) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient();
  const { data: targets, error } = await supabase
    .from('listings')
    .select(`
      id, type, deal, status, gu, dong,
      rooms, bathrooms, built_year,
      parking, parking_spaces, elevator, full_option,
      lat, lng, available_date,
      rtms_avg_price, rtms_data, land_price_per_m2,
      academy_count, school_count, school_zone_score, school_zone_data,
      commercial_score, crime_safety_score,
      air_quality_avg, air_quality_data,
      trust_score, grade, last_verified_at, enriched_at,
      raw_fields
    `)
    .is('ai_description', null)
    .eq('status', '공개')
    .not('lat', 'is', null)
    .order('id', { ascending: false })
    .limit(BATCH_SIZE);

  if (error || !targets || targets.length === 0) {
    return NextResponse.json({ success: true, processed: 0, error: error?.message });
  }

  let success = 0, failed = 0;
  const startedAt = Date.now();

  for (const listing of targets) {
    if (Date.now() - startedAt > 50000) break;

    try {
      // PostGIS + 카카오 모빌리티 도보 routing (정확한 위치)
      const stations = await findStationsForListing(
        (listing as { lat: number }).lat,
        (listing as { lng: number }).lng,
        3
      );

      // 신축 판정
      const builtYearStr = String(listing.built_year || '');
      const builtYear = parseInt(builtYearStr.match(/\d{4}/)?.[0] || '0');
      const isNewBuilding = builtYear > 0 && (new Date().getFullYear() - builtYear) <= 5;

      // 즉시입주 판정
      const availableDate = String(listing.available_date || '');
      const rawFields = (listing.raw_fields as Record<string, unknown>) || {};
      const isImmediate = /즉시|공실/.test(availableDate) ||
        /즉시|공실/.test(String(rawFields['입주가능일'] || ''));

      const input: BriefingInput = {
        type: String(listing.type || ''),
        deal: String(listing.deal || ''),
        is_immediate_movein: isImmediate,
        is_full_option: !!listing.full_option,
        has_elevator: !!listing.elevator,
        has_parking: !!listing.parking || ((listing.parking_spaces as number) || 0) > 0,
        rooms: (listing.rooms as number) || null,
        bathrooms: (listing.bathrooms as number) || null,
        built_year: builtYearStr || null,
        is_new_building: isNewBuilding,
        station_top3: stations,
        rtms_avg_price: listing.rtms_avg_price as number | null,
        rtms_data: listing.rtms_data as Record<string, unknown> | null,
        land_price_per_m2: listing.land_price_per_m2 as number | null,
        academy_count: listing.academy_count as number | null,
        school_count: listing.school_count as number | null,
        school_zone_score: listing.school_zone_score as number | null,
        school_zone_data: listing.school_zone_data as Record<string, unknown> | null,
        commercial_score: listing.commercial_score as number | null,
        crime_safety_score: listing.crime_safety_score as number | null,
        air_quality_avg: listing.air_quality_avg as number | null,
        air_quality_data: listing.air_quality_data as Record<string, unknown> | null,
        trust_score: listing.trust_score as number | null,
        grade: listing.grade as string | null,
        last_verified_at: listing.last_verified_at as string | null,
        enriched_at: listing.enriched_at as string | null,
        special_notes: String(rawFields['특이사항'] || '') || null,
      };

      const briefing = buildBriefing(input);

      // 사실 0개 = 데이터 부족 → 저장 안 함 (사장님 정책 — 빈 안내 표시 X)
      if (briefing.facts_count === 0) {
        failed++;
        continue;
      }

      // 헤드라인 추출 (가장 강한 추천 사유 1번)
      const title = briefing.recommendation_reasons[0] || '검증된 매물';

      await supabase.from('listings').update({
        ai_title: title.slice(0, 35),
        ai_description: briefing.description,
        ai_generated_at: new Date().toISOString(),
        ai_generated_fields: briefing.sources_used,  // text[] 호환
        seo_keywords: briefing.recommendation_reasons.slice(0, 10),
        seo_meta_description: title.slice(0, 160),
        seo_tags: briefing.sources_used.map((s) => `#${s.replace(/\s/g, '')}`),
      }).eq('id', listing.id);

      success++;
    } catch {
      failed++;
    }
  }

  const { count: remaining } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .is('ai_description', null)
    .eq('status', '공개');

  return NextResponse.json({
    success: true,
    batch: targets.length,
    processed: success,
    failed,
    remaining: remaining ?? null,
    duration_ms: Date.now() - startedAt,
    method: 'pure-symbolic-briefing',
    llm_calls: 0,  // LLM 미사용 — 환각 수학적 0%
  });
}
