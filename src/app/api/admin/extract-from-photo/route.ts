/**
 * /api/admin/extract-from-photo (Phase 6 단계 1, 단순)
 * 매물 광고지 사진 → Gemini Vision OCR → listings 자동 등록
 * 의존성 0 (Gemini API direct fetch)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';

const SYSTEM_PROMPT = `한국 부동산 매물 광고지 OCR 전문가. 이미지에서 매물 정보를 JSON만 출력.
필드:
- type: "원룸"|"투룸"|"아파트"|"오피스텔"|"빌라"|"단독주택"|"상가"|"사무실"|null
- deal: "월세"|"전세"|"매매"|null
- address: text|null
- area_m2: number|null
- floor_current: text|null
- rooms: int|null
- bathrooms: int|null
- deposit: int (만원)|null
- monthly: int (만원)|null
- price: int (만원)|null
- direction: text|null
- heating_type: text|null
- description: text (300자 이내)|null
- confidence: 0-100
불확실한 필드는 null. 추측 X.`;

interface OcrResult {
  type?: string | null;
  deal?: string | null;
  address?: string | null;
  area_m2?: number | null;
  floor_current?: string | number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  deposit?: number | null;
  monthly?: number | null;
  price?: number | null;
  direction?: string | null;
  heating_type?: string | null;
  description?: string | null;
  confidence?: number;
}

async function ocrImage(imageUrl: string): Promise<OcrResult | null> {
  if (!GEMINI_KEY) return null;
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const buf = await imgRes.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    const mime = imgRes.headers.get('content-type') || 'image/jpeg';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [
          { text: '이 매물 광고지에서 정보 추출' },
          { inlineData: { mimeType: mime, data: b64 } },
        ] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1500, responseMimeType: 'application/json' },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return JSON.parse(text) as OcrResult;
  } catch (e) {
    console.warn('[extract-from-photo] failed:', e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['superadmin', 'owner', 'admin', 'master', 'broker', 'agent'].includes(auth.role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // L-fix-rate-limit (2026-04-28): Gemini Vision 비용 abuse 방어 — 시간당 20회/IP
  const ip = getClientIp(request);
  const rl = checkRateLimit({ key: `extract-from-photo:ip:${ip}`, limit: 20, windowMs: 60 * 60_000 });
  if (!rl.ok) return NextResponse.json({ error: '요청이 너무 많습니다 (시간당 20회)' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  // L-fix-error-redact (2026-04-28): env 이름 노출 X (production 정보 누출 방지)
  if (!GEMINI_KEY) return NextResponse.json({ error: '서버 설정 오류 — 관리자에게 문의' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const imageUrl: string = body?.imageUrl || '';
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl 필수' }, { status: 400 });

  const data = await ocrImage(imageUrl);
  if (!data) return NextResponse.json({ error: 'OCR 실패' }, { status: 502 });

  const supabase = createServerClient();
  const confidence = Number(data.confidence) || 0;
  const insertStatus = confidence >= 90 ? '공개' : '비공개';

  const { data: inserted, error } = await supabase.from('listings').insert({
    type: data.type || null,
    deal: data.deal || null,
    address: data.address || '',
    area_m2: data.area_m2 || null,
    floor_current: data.floor_current ? String(data.floor_current) : null,
    rooms: data.rooms || null,
    bathrooms: data.bathrooms || null,
    deposit: data.deposit || null,
    monthly: data.monthly || null,
    price: data.price || null,
    direction: data.direction || null,
    heating_type: data.heating_type || null,
    description: data.description || null,
    status: insertStatus,
    is_problematic: confidence < 90,
    problematic_reason: confidence < 90 ? `OCR 신뢰도 ${confidence}/100` : null,
    ai_generated_fields: ['type','deal','address','area_m2','description'].filter(f => (data as Record<string, unknown>)[f] != null),
    raw_fields: { ocr_source: imageUrl, ocr_confidence: confidence, ocr_data: data },
  }).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, listing_id: inserted?.id, confidence, status: insertStatus, extracted: data });
}
