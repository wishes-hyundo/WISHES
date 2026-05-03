// auto-regenerate-ai-desc — Pure Symbolic (LLM 0%, 환각 0%)
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { findStationsForListing } from '@/lib/subway-finder';
import { buildSymbolicFallback, buildSymbolicTitle, buildKeywords, buildTags, buildMetaDescription, type BriefingFacts } from '@/lib/listing-briefing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 50;

export async function GET(request: NextRequest) {
  // G-86 (2026-05-04): fail-safe — CRON_SECRET 미설정이면 500 (이전엔 fail-open)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = auth === `Bearer ${cronSecret}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (!isUserSecret && !isVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }const supabase = createServerClient();
  const { data: targets, error } = await supabase
    .from('listings')
    .select('id, type, deal, status, gu, dong, building_name, rooms, available_date, built_year, parking, parking_spaces, full_option, lat, lng, raw_fields')
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
      const stations = await findStationsForListing(
        (listing as { lat: number }).lat,
        (listing as { lng: number }).lng,
        3
      );
      const builtYear = parseInt(String(listing.built_year || '').match(/\d{4}/)?.[0] || '0');
      const isNewBuilding = builtYear > 0 && (new Date().getFullYear() - builtYear) <= 5;
      const rawFields = (listing.raw_fields as Record<string, unknown>) || {};
      const isImmediate = /즉시|공실/.test(String(listing.available_date || rawFields['입주가능일'] || ''));
      const rbText = String(rawFields['룸/욕실수'] || '');
      const rbMatch = rbText.match(/룸\s*([\d.]+)/);
      const roomsForTarget = rbMatch ? parseFloat(rbMatch[1]) : ((listing.rooms as number) || null);

      const facts: BriefingFacts = {
        id: listing.id as number,
        type: String(listing.type || ''),
        deal: String(listing.deal || ''),
        is_full_option: !!listing.full_option,
        has_parking: !!listing.parking || ((listing.parking_spaces as number) || 0) > 0,
        is_immediate_movein: isImmediate,
        is_new_building: isNewBuilding,
        rooms_for_target: roomsForTarget,
        station_top3: stations,
        building_name: (listing.building_name as string) || null,
        gu: (listing.gu as string) || null,
        dong: (listing.dong as string) || null,
      };

      if (!facts.type) { failed++; continue; }

      const title = buildSymbolicTitle(facts);
      const description = buildSymbolicFallback(facts);
      if (!description || description.length < 50) { failed++; continue; }

      await supabase.from('listings').update({
        ai_title: title,
        ai_description: description,
        ai_generated_at: new Date().toISOString(),
        ai_generated_fields: ['symbolic-pure', `stations:${stations.length}`],
        seo_keywords: buildKeywords(facts),
        seo_meta_description: buildMetaDescription(facts),
        seo_tags: buildTags(facts),
      }).eq('id', listing.id);

      success++;
    } catch {
      failed++;
    }
  }

  const { count: remaining } = await supabase
    .from('listings').select('id', { count: 'exact', head: true })
    .is('ai_description', null).eq('status', '공개');

  return NextResponse.json({
    success: true, batch: targets.length, processed: success, failed,
    remaining: remaining ?? null, duration_ms: Date.now() - startedAt,
    method: 'symbolic-pure', llm_calls: 0,
  });
}
