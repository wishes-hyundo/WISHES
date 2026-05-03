/**
 * /api/cron/enrich-text — Gemini 2.5 Flash 무료 한도
 * description (88.8% NULL) + seo_tags (80.5% NULL) 자동 생성
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';

async function generateText(listing: any): Promise<{ description?: string; seo_tags?: string[] } | null> {
  if (!GEMINI_KEY) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
    const facts = [
      listing.type, listing.deal,
      listing.address, listing.dong, listing.gu,
      listing.area_m2 ? `${listing.area_m2}㎡` : '',
      listing.floor_current ? `${listing.floor_current}층` : '',
      listing.rooms ? `방${listing.rooms}` : '',
      listing.bathrooms ? `욕실${listing.bathrooms}` : '',
      listing.deposit ? `보증금 ${listing.deposit}만원` : '',
      listing.monthly ? `월세 ${listing.monthly}만원` : '',
      listing.price ? `가격 ${listing.price}만원` : '',
      listing.parking ? '주차가능' : '',
      listing.elevator ? '엘리베이터' : '',
      listing.direction || '',
      listing.heating_type || '',
    ].filter(Boolean).join(' / ');

    const body = {
      contents: [{ parts: [{ text: `한국 부동산 매물 정보:\n${facts}\n\n위 정보로 다음을 JSON만 출력 (설명 X):\n{"description": "한국어 매물 설명 150자 내외, 가격/위치/특징 강조, 환각 X, 주어진 사실만",\n"seo_tags": ["검색용 한글 태그 5개 배열"]}` }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 400 },
    };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return null;
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      description: typeof parsed.description === 'string' ? parsed.description.slice(0, 1000) : undefined,
      seo_tags: Array.isArray(parsed.seo_tags) ? parsed.seo_tags.slice(0, 10).map(String) : undefined,
    };
  } catch (e) { console.warn('[enrich-text] one failed:', e); return null; }
}

export async function GET(request: NextRequest) {
  // G-73 (2026-05-03): fail-safe — CRON_SECRET 미설정이면 500 (이전엔 무인증 통과)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = (request.headers.get('authorization') || '');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!GEMINI_KEY) return NextResponse.json({ success: false, error: 'GEMINI_API_KEY 미설정' }, { status: 500 });

  const supabase = createServerClient();
  const { data: targets } = await supabase
    .from('listings')
    .select('id, type, deal, address, dong, gu, area_m2, floor_current, rooms, bathrooms, deposit, monthly, price, parking, elevator, direction, heating_type, description')
    .eq('status', '공개')
    .or('description.is.null,description.eq.')
    .limit(60);  // L-fix-throughput (2026-04-28): 30→60 (2배). text 호출 빠름.

  let updated = 0;
  for (const t of (targets || []) as any[]) {
    const result = await generateText(t);
    if (!result) continue;
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    const ai_fields: string[] = [];
    if (result.description) { patch.description = result.description; ai_fields.push('description'); }
    if (result.seo_tags) { patch.seo_tags = result.seo_tags; ai_fields.push('seo_tags'); }
    if (ai_fields.length === 0) continue;
    patch.ai_generated_fields = ai_fields;
    const { error } = await supabase.from('listings').update(patch).eq('id', t.id);
    if (!error) updated++;
  }

  return NextResponse.json({ success: true, scanned: targets?.length || 0, updated });
}
