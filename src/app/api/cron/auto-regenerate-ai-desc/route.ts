// auto-regenerate-ai-desc — Hybrid (LLM 산문 + facts 검증 + Symbolic Fallback)
// 위치노출 + 중복 제거 (사장님 명령 반영)
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { findStationsForListing } from '@/lib/subway-finder';
import {
  buildBriefingPrompt,
  detectBriefingHallucination,
  buildSymbolicFallback,
  buildSymbolicTitle,
  type BriefingFacts,
} from '@/lib/listing-briefing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
const BATCH_SIZE = 20;

async function callGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, topP: 0.85, maxOutputTokens: 1024, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

function parseLLMJson(raw: string): { title?: string; description?: string } | null {
  if (!raw) return null;
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(raw.substring(s, e + 1)); } catch { return null; }
}

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
      id, type, deal, status, gu, dong, building_name,
      rooms, available_date, built_year,
      parking, parking_spaces, full_option,
      lat, lng, raw_fields
    `)
    .is('ai_description', null)
    .eq('status', '공개')
    .not('lat', 'is', null)
    .order('id', { ascending: false })
    .limit(BATCH_SIZE);

  if (error || !targets || targets.length === 0) {
    return NextResponse.json({ success: true, processed: 0, error: error?.message });
  }

  let llmSuccess = 0, fallbackUsed = 0, failed = 0;
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

      // 룸 1.5개 같은 소수 보존 (추천 대상 분류 용도)
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

      // ── LLM 호출 (3회 retry) ──
      let title = '', description = '';
      let usedMethod: 'llm' | 'fallback' = 'fallback';

      for (let attempt = 0; attempt < 3; attempt++) {
        const prompt = buildBriefingPrompt(facts);
        const raw = await callGemini(prompt);
        if (!raw) continue;
        const parsed = parseLLMJson(raw);
        if (!parsed || !parsed.description) continue;
        const tT = String(parsed.title || '').trim();
        const tD = String(parsed.description || '').trim();
        const hT = detectBriefingHallucination(tT, facts);
        const hD = detectBriefingHallucination(tD, facts);
        if (!hT.hallucinated && !hD.hallucinated) {
          title = tT.slice(0, 30);
          description = tD;
          usedMethod = 'llm';
          break;
        }
      }

      // LLM 모두 실패 → Symbolic Fallback
      if (!description) {
        title = buildSymbolicTitle(facts);
        description = buildSymbolicFallback(facts);
        usedMethod = 'fallback';
      }

      if (!description || description.length < 50) { failed++; continue; }

      await supabase.from('listings').update({
        ai_title: title,
        ai_description: description,
        ai_generated_at: new Date().toISOString(),
        ai_generated_fields: [usedMethod, `stations:${stations.length}`],
        seo_keywords: stations.slice(0, 3).map((s) => `${s.name} ${facts.type}`),
        seo_meta_description: description.slice(0, 160),
        seo_tags: [`#${facts.type}`, `#${facts.deal}`].filter((t) => t.length > 1),
      }).eq('id', listing.id);

      if (usedMethod === 'llm') llmSuccess++;
      else fallbackUsed++;
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
    llm_success: llmSuccess,
    fallback_used: fallbackUsed,
    failed,
    remaining: remaining ?? null,
    duration_ms: Date.now() - startedAt,
  });
}
