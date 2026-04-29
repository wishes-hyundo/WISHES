// auto-generate — Pure Symbolic (LLM 0%, 환각 수학적 0%)
// 2026-04-29 사장님 명령 "확실한 기능만"
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { findStationsForListing } from '@/lib/subway-finder';
import { buildSymbolicFallback, buildSymbolicTitle, buildKeywords, buildTags, buildMetaDescription, type BriefingFacts } from '@/lib/listing-briefing';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  let body: { listingId?: number | string; saveToDb?: boolean; regenerate?: boolean } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }
  const lidRaw = body.listingId;
  const lid = typeof lidRaw === 'number' ? lidRaw : (typeof lidRaw === 'string' ? parseInt(lidRaw, 10) : 0);
  if (!lid || isNaN(lid) || lid <= 0) return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  const supabase = createServerClient();
  const { data: listing, error } = await supabase
    .from('listings')
    .select('id, type, deal, status, gu, dong, address, building_name, building_purpose, rooms, available_date, built_year, parking, parking_spaces, full_option, lat, lng, raw_fields')
    .eq('id', lid).single();
  if (error || !listing) return NextResponse.json({ error: 'listing not found' }, { status: 404 });

  // L-aitype (2026-04-29): listing.type vs 정부 건축물대장 주용도 모순 자동 보정.
  //   사장님 명령: "원룸으로 표기됐지만 주용도가 아파트 → 잘못된 정보"
  let resolvedType = String(listing.type || '').trim();
  const dbPurpose = (listing as any).building_purpose ? String((listing as any).building_purpose).trim() : '';
  if (dbPurpose) {
    resolvedType = dbPurpose;
  } else {
    try {
      const addr = String((listing as any).address || '').trim();
      if (addr) {
        const { data: cached } = await supabase
          .from('building_registry_cache')
          .select('units_data')
          .eq('address', addr)
          .maybeSingle();
        const items: any[] = (cached as any)?.units_data || [];
        const head = items.find((it: any) => it && it.mainPurpsCdNm);
        if (head?.mainPurpsCdNm) resolvedType = String(head.mainPurpsCdNm).trim();
      }
    } catch { /* 캐시 없음 OK */ }
  }

  const stations = await findStationsForListing((listing as { lat: number }).lat, (listing as { lng: number }).lng, 3);
  const builtYear = parseInt(String(listing.built_year || '').match(/\d{4}/)?.[0] || '0');
  const isNewBuilding = builtYear > 0 && (new Date().getFullYear() - builtYear) <= 5;
  const rawFields = (listing.raw_fields as Record<string, unknown>) || {};
  const isImmediate = /즉시|공실/.test(String(listing.available_date || rawFields['입주가능일'] || ''));
  const rbText = String(rawFields['룸/욕실수'] || '');
  const rbMatch = rbText.match(/룸\s*([\d.]+)/);
  const roomsForTarget = rbMatch ? parseFloat(rbMatch[1]) : ((listing.rooms as number) || null);

  // L-aitype: rooms 기반 룸타입 정답 (rooms=2 인데 type='원룸' 등 모순 차단)
  if (roomsForTarget != null && roomsForTarget >= 2 && /^원룸$/.test(resolvedType)) {
    resolvedType = roomsForTarget >= 3 ? '쓰리룸' : '투룸';
  } else if (roomsForTarget != null && roomsForTarget < 2 && /^(투룸|쓰리룸|포룸)$/.test(resolvedType)) {
    resolvedType = '원룸';
  }

  const facts: BriefingFacts = {
    id: (listing.id as number) + Math.floor(Date.now() / 1000),  // 매번 다른 시드 (수동 호출)
    type: resolvedType || String(listing.type || ''),
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

  // Pure Symbolic — 환각 가능성 수학적 0%
  const title = buildSymbolicTitle(facts);
  const description = buildSymbolicFallback(facts);

  if (body.saveToDb !== false) {
    // L-aitype: resolvedType 이 listing.type 와 다르면 type 컬럼도 함께 업데이트.
    const updates: Record<string, any> = {
      ai_title: title,
      ai_description: description,
      ai_generated_at: new Date().toISOString(),
      ai_generated_fields: ['symbolic-pure', `stations:${stations.length}`],
      seo_keywords: buildKeywords(facts),
      seo_meta_description: buildMetaDescription(facts),
      seo_tags: buildTags(facts),
    };
    const originalType = String(listing.type || '').trim();
    if (resolvedType && resolvedType !== originalType) {
      updates.type = resolvedType;
    }
    await supabase.from('listings').update(updates).eq('id', lid);
  }

  const responsePayload = {
    title, description,
    meta_description: buildMetaDescription(facts),
    keywords: buildKeywords(facts),
    tags: buildTags(facts),
    method: 'symbolic-pure', stations: stations.length,
  };
  return NextResponse.json({ success: true, ...responsePayload, result: responsePayload });
}
