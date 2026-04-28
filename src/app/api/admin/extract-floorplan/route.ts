/**
 * L-Step4 (2026-04-29): Vision LLM 도면 OCR — Gemini 2.5 Flash 무료
 *
 * /api/admin/extract-floorplan (POST)
 *   body: { imageUrl: string } | { imageBase64: string, mime: string }
 *   resp: { success, floorplan: { rooms, bathrooms, balcony, kitchen, layoutType, exclusiveArea, ... }, confidence }
 *
 * /new STEP 3 (사진/도면 업로드) 후 첫 도면 1장을 즉시 분석 → STEP 2 폼 자동 채우기.
 * 사장님 손 가는 작업 0 (자동화 우선 정책).
 *
 * 무료: Gemini 2.5 Flash (Google) 일 100K 호출.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
const ALLOWED_ROLES = new Set(['superadmin', 'master', 'agent', 'crawler_bridge', 'internal_bearer']);

const FLOORPLAN_PROMPT = `한국 부동산 평면도/도면 분석 전문가. 이미지가 주거 평면도라면 JSON 만 출력 (마크다운 X).

필드:
- isFloorplan: boolean (도면이 맞는가?)
- rooms: number|null (방 개수, 거실 제외)
- bathrooms: number|null (화장실 개수)
- balcony: number|null (베란다/발코니 개수)
- kitchen: "open"|"closed"|"none"|null
- layoutType: "원룸"|"1.5룸"|"투룸"|"쓰리룸"|"포룸+"|null
- exclusiveAreaM2: number|null (m² 표기 있으면)
- exclusiveAreaPyeong: number|null (평 표기 있으면)
- direction: "남향"|"북향"|"동향"|"서향"|"남동향"|"남서향"|"북동향"|"북서향"|null
- entryType: "복도식"|"계단식"|null
- features: string[] (drm, pantry, wic 등 있는 그대로)
- notes: string|null (조감/특이점 1문장)
- confidence: 0-100

도면이 아니면: { "isFloorplan": false, "confidence": 0 } 만 출력.`;

interface FloorplanResult {
  isFloorplan: boolean;
  rooms?: number | null;
  bathrooms?: number | null;
  balcony?: number | null;
  kitchen?: string | null;
  layoutType?: string | null;
  exclusiveAreaM2?: number | null;
  exclusiveAreaPyeong?: number | null;
  direction?: string | null;
  entryType?: string | null;
  features?: string[];
  notes?: string | null;
  confidence: number;
}

async function fetchImageBase64(imageUrl: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(imageUrl, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 4 * 1024 * 1024) return null; // 4 MB 제한
    return {
      b64: Buffer.from(buf).toString('base64'),
      mime: res.headers.get('content-type') || 'image/jpeg',
    };
  } catch {
    return null;
  }
}

async function analyze(b64: string, mime: string): Promise<FloorplanResult | null> {
  if (!GEMINI_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  const body = {
    contents: [{
      parts: [
        { text: FLOORPLAN_PROMPT },
        { inline_data: { mime_type: mime, data: b64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 800,
      response_mime_type: 'application/json',
    },
  };
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return null;
    try {
      const parsed = JSON.parse(text) as FloorplanResult;
      return parsed;
    } catch {
      // Try to extract JSON block
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try { return JSON.parse(m[0]) as FloorplanResult; } catch { return null; }
      }
      return null;
    }
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok || !ALLOWED_ROLES.has(auth.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!GEMINI_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  try {
    const body = await request.json() as {
      imageUrl?: string;
      imageBase64?: string;
      mime?: string;
    };

    let payload: { b64: string; mime: string } | null = null;
    if (body.imageBase64 && body.mime) {
      payload = { b64: body.imageBase64, mime: body.mime };
    } else if (body.imageUrl) {
      payload = await fetchImageBase64(body.imageUrl);
    }

    if (!payload) {
      return NextResponse.json({ success: false, error: 'No valid image source' }, { status: 400 });
    }

    const result = await analyze(payload.b64, payload.mime);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Vision analysis failed' });
    }

    return NextResponse.json({ success: true, floorplan: result, confidence: result.confidence });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
