// generate-description v1 — Pure Symbolic (LLM 0%)
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { findStationsForListing } from '@/lib/subway-finder';
import { buildSymbolicFallback, buildSymbolicTitle, type BriefingFacts } from '@/lib/listing-briefing';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  let body: { listingId?: number | string; regenerate?: boolean } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }
  const lidRaw = body.listingId;
  const lid = typeof lidRaw === 'number' ? lidRaw : (typeof lidRaw === 'string' ? parseInt(lidRaw, 10) : 0);
  if (!lid || isNaN(lid) || lid <= 0) return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  const supabase = createServerClient();
  const { data: listing, error } = await supabase
    .from('listings')
    .select('id, type, deal, status, gu, dong, building_name, rooms, available_date, built_year, parking, parking_spaces, full_option, lat, lng, raw_fields')
    .eq('id', lid).single();
  if (error || !listing) return NextResponse.json({ error: 'listing not found' }, { status: 404 });

  const stations = await findStationsForListing((listing as { lat: number }).lat, (listing as { lng: number }).lng, 3);
  const builtYear = parseInt(String(listing.built_year || '').match(/\d{4}/)?.[0] || '0');
  const isNewBuilding = builtYear > 0 && (new Date().getFullYear() - builtYear) <= 5;
  const rawFields = (listing.raw_fields as Record<string, unknown>) || {};
  const isImmediate = /즉시|공실/.test(String(listing.available_date || rawFields['입주가능일'] || ''));
  const rbText = String(rawFields['룸/욕실수'] || '');
  const rbMatch = rbText.match(/룸\s*([\d.]+)/);
  const roomsForTarget = rbMatch ? parseFloat(rbMatch[1]) : ((listing.rooms as number) || null);

  const facts: BriefingFacts = {
    id: (listing.id as number) + Math.floor(Date.now() / 1000),  // 매번 다른 시드 (수동 호출)
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

  const title = buildSymbolicTitle(facts);
  const description = buildSymbolicFallback(facts);
  return NextResponse.json({
    success: true, title, description,
    meta_description: description.slice(0, 160),
    keywords: stations.slice(0, 3).map((s) => `${s.name} ${facts.type}`),
    tags: [`#${facts.type}`, `#${facts.deal}`],
    method: 'symbolic-pure', stations: stations.length,
  });
}
