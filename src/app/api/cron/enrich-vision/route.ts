/**
 * /api/cron/enrich-vision — Gemini 2.5 Flash Vision 무료 한도 (일 100K)
 * direction (98.9% NULL) + heating_type (83.2% NULL) 자동 추출
 * 매물 사진 1장 → Gemini Vision → 발코니/평면도 분석
 * Phase 1-10 (사장님 명령 2026-04-28: 비용 0)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';

async function analyzeImage(imageUrl: string): Promise<{ direction?: string; heating_type?: string } | null> {
  if (!GEMINI_KEY) return null;
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const buf = await imgRes.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    const mime = imgRes.headers.get('content-type') || 'image/jpeg';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
    const body = {
      contents: [{
        parts: [
          { text: `이 부동산 매물 사진(또는 평면도)을 분석해서 JSON으로만 응답해주세요. 추측 가능한 항목만 답하고, 불확실하면 null:
{"direction": "남향|동향|서향|북향|남동향|남서향|북동향|북서향 중 하나 또는 null",
"heating_type": "도시가스|개별난방|중앙난방|지역난방|기름보일러|LPG 중 하나 또는 null"}
JSON만 출력. 설명 없이.` },
          { inlineData: { mimeType: mime, data: b64 } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 100 },
    };
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      direction: parsed.direction && parsed.direction !== 'null' ? parsed.direction : undefined,
      heating_type: parsed.heating_type && parsed.heating_type !== 'null' ? parsed.heating_type : undefined,
    };
  } catch (e) {
    console.warn('[enrich-vision] one failed:', e);
    return null;
  }
}

export async function GET(request: NextRequest) {
  // L-fix-cron-secret (2026-04-28): CRON_SECRET 미설정 시 fail-safe (이전: 통과)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const auth = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (auth !== cronSecret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!GEMINI_KEY) {
    return NextResponse.json({ success: false, error: 'GEMINI_API_KEY 미설정' }, { status: 500 });
  }

  const supabase = createServerClient();
  const { data: targets } = await supabase
    .from('listings')
    .select('id, listing_images(url)')
    .eq('status', '공개')
    .or('direction.is.null,heating_type.is.null')
    .not('listing_images', 'is', null)
    .limit(50);

  let updated = 0;
  for (const t of (targets || []) as any[]) {
    const url = t.listing_images?.[0]?.url;
    if (!url) continue;
    const result = await analyzeImage(url);
    if (!result) continue;
    const patch: Record<string, any> = {};
    if (result.direction) patch.direction = result.direction;
    if (result.heating_type) patch.heating_type = result.heating_type;
    if (Object.keys(patch).length === 0) continue;
    patch.updated_at = new Date().toISOString();
    patch.ai_generated_fields = ['direction', 'heating_type'].filter(f => patch[f]);
    const { error } = await supabase.from('listings').update(patch).eq('id', t.id);
    if (!error) updated++;
  }

  return NextResponse.json({ success: true, scanned: targets?.length || 0, updated, ts: new Date().toISOString() });
}
