/**
 * /api/admin/extract-from-photo
 * 사장님이 매물 광고지 사진 업로드 → Gemini Vision OCR → listings 자동 등록
 * 비용: Gemini 2.5 Flash Vision 무료 일 100K
 *
 * POST { imageUrl: string } → { listing: { type, deal, address, area_m2, ... }, confidence }
 * 신뢰도 90%+ = status='공개' 자동, 미만 = '비공개' (사장님이 listings 페이지에서 일괄 검토)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';

const SYSTEM_PROMPT = `당신은 한국 부동산 매물 광고지 OCR 전문가입니다.
업로드된 이미지(매물 광고지/팩스/스크린샷)에서 매물 정보를 정확히 추출하여 JSON만 출력합니다.

추출 필드:
- type: "원룸"|"투룸"|"쓰리룸"|"아파트"|"오피스텔"|"빌라"|"단독주택"|"다세대"|"상가"|"사무실"|null
- deal: "월세"|"전세"|"매매"|null
- address: 도로명 주소 또는 지번 (정확한 텍스트)
- area_m2: 전용면적 (㎡, 평이면 *3.305 변환)
- floor_current: "1"|"2"|... 또는 "B1"|"옥탑"
- rooms: 방 갯수 (정수)
- bathrooms: 욕실 갯수 (정수)
- deposit: 보증금 (만원, 월세/전세)
- monthly: 월세 (만원, 월세만)
- price: 매매가 (만원, 매매만)
- direction: 방향
- heating_type: 난방
- description: 광고지 본문 텍스트 (300자 이내)
- confidence: 0-100 (광고지 정보 명확도)

불확실한 필드는 null. 추측 X.`;

async function ocrImage(imageUrl: string): Promise<any | null> {
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
          { text: '이 매물 광고지에서 정보 추출해서 JSON 만 출력' },
          { inlineData: { mimeType: mime, data: b64 } },
        ] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1500, responseMimeType: 'application/json' },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return JSON.parse(text);
  } catch (e) {
    console.warn('[extract-from-photo] failed:', e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['superadmin', 'owner', 'admin', 'master', 'broker'].includes(auth.role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!GEMINI_KEY) return NextResponse.json({ error: 'GEMINI_API_KEY 미설정' }, { status: 500 });

  const { imageUrl } = await request.json();
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl 필수' }, { status: 400 });

  const data = await ocrImage(imageUrl);
  if (!data) return NextResponse.json({ error: 'OCR 실패' }, { status: 502 });

  const supabase = createServerClient();

  // confidence 90+ 자동 등록 (status 공개), 미만은 비공개로 INSERT
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
    problematic_reason: confidence < 90 ? `OCR 신뢰도 ${confidence}/100 — 사장님 검토 권장` : null,
    ai_generated_fields: ['type','deal','address','area_m2','description'],
    created_by: auth.email ? null : null, // owner uuid 자동
    raw_fields: { ocr_source: imageUrl, ocr_confidence: confidence, ocr_data: data },
  }).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, listing_id: inserted?.id, confidence, status: insertStatus, extracted: data });
}
