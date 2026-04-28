// generate-description (v1) — DEPRECATED → buildBriefing 으로 redirect
// 사장님 명령: 모든 endpoint 가 동일 brifing 사용
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { findStationsForListing } from '@/lib/subway-finder';
import {
  buildBriefingPrompt, detectBriefingHallucination,
  buildSymbolicFallback, buildSymbolicTitle, type BriefingFacts,
} from '@/lib/listing-briefing';

export const maxDuration = 30;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';

async function callGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, topP: 0.85, maxOutputTokens: 1024, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

function parseLLM(raw: string): { title?: string; description?: string } | null {
  if (!raw) return null;
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(raw.substring(s, e + 1)); } catch { return null; }
}

async function generate(listingId: number) {
  const supabase = createServerClient();
  const { data: listing, error } = await supabase
    .from('listings')
    .select('id, type, deal, status, gu, dong, building_name, rooms, available_date, built_year, parking, parking_spaces, full_option, lat, lng, raw_fields')
    .eq('id', listingId).single();
  if (error || !listing) throw new Error('listing not found');

  const stations = await findStationsForListing((listing as { lat: number }).lat, (listing as { lng: number }).lng, 3);
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

  let title = '', description = '', method: 'llm' | 'fallback' = 'fallback';
  for (let i = 0; i < 3; i++) {
    const prompt = buildBriefingPrompt(facts);
    const raw = await callGemini(prompt);
    if (!raw) continue;
    const p = parseLLM(raw);
    if (!p?.description) continue;
    const tT = String(p.title || '').trim();
    const tD = String(p.description || '').trim();
    const hT = detectBriefingHallucination(tT, facts);
    const hD = detectBriefingHallucination(tD, facts);
    if (!hT.hallucinated && !hD.hallucinated) {
      title = tT.slice(0, 30); description = tD; method = 'llm'; break;
    }
  }
  if (!description) {
    title = buildSymbolicTitle(facts); description = buildSymbolicFallback(facts); method = 'fallback';
  }
  return { title, description, method, stations };
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  let body: { listingId?: number } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }
  const lid = body.listingId;
  if (!lid || typeof lid !== 'number') return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  try {
    const r = await generate(lid);
    return NextResponse.json({
      success: true,
      title: r.title, description: r.description,
      meta_description: r.description.slice(0, 160),
      keywords: r.stations.slice(0, 3).map((s) => `${s.name} ${s.line}`),
      tags: ['#매물추천'],
      method: r.method, stations: r.stations.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
