/**
 * L-DirVerify (2026-04-29): 매물 향(direction) 자동 더블체크
 *
 * 사장님 입력 + AI 위성뷰 분석 비교 → 정확도 향상.
 *
 * 방식:
 * 1. 매물 좌표 (lat/lng) 로 카카오 정적 위성뷰 이미지 fetch (무료, 자격 X)
 * 2. Gemini Vision: 위성뷰에서 건물 외형/도로 방향 분석 → 거실(가장 큰 면) 향 추정
 * 3. 사장님 입력 향과 비교 → 일치/불일치 + 신뢰도 반환
 *
 * 데이터 출처: Kakao Maps (무료 위성), Gemini 2.5 Flash Vision (무료)
 * 사장님 자격: 부동산 중개 (모두 OK)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const maxDuration = 25;
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['superadmin', 'master', 'agent', 'crawler_bridge', 'internal_bearer']);
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';

const PROMPT = `한국 부동산 매물 위성뷰 분석. 다음 위성 이미지에서:

1. 가운데 빨간 마커 위치의 건물 식별
2. 건물의 가장 긴 면 / 가장 큰 외벽 / 베란다 / 거실 창 방향 추정
3. 도로(밝은 회색 선)와 건물 위치 관계 분석
4. JSON 만 출력:

{
  "estimatedDirection": "남향" | "북향" | "동향" | "서향" | "남동향" | "남서향" | "북동향" | "북서향" | null,
  "confidence": 0-100,
  "reasoning": "한 줄 설명"
}

위성뷰만으로 판단 어려우면 confidence 낮게. 추측 금지.`;

interface VisionResult {
  estimatedDirection: string | null;
  confidence: number;
  reasoning: string;
}

async function fetchSatelliteAsBase64(lat: number, lng: number): Promise<{ b64: string; mime: string } | null> {
  if (!KAKAO_REST_KEY) return null;
  // 카카오 Static Map API (위성)
  // https://apis-navi.kakaomobility.com 도 있지만 무료 정적 위성은 카카오 공식 X
  // 대안: V-World 위성 정적 이미지 (무료)
  // V-World: https://api.vworld.kr/req/image?service=image&request=GetMap&format=PNG&size=400,400&geomtype=BBOX&style=satellite&...
  try {
    const VWORLD_KEY = process.env.VWORLD_API_KEY || '';
    if (VWORLD_KEY) {
      // V-World GetMap API — 위성뷰
      const delta = 0.0008; // ~80m bbox
      const minX = lng - delta, maxX = lng + delta;
      const minY = lat - delta, maxY = lat + delta;
      const url = `https://api.vworld.kr/req/image?service=image&request=GetMap&key=${VWORLD_KEY}&format=PNG&size=600,600&crs=EPSG:4326&geomtype=BBOX&style=satellite&bbox=${minX},${minY},${maxX},${maxY}`;
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        return { b64: Buffer.from(buf).toString('base64'), mime: 'image/png' };
      }
    }

    // Fallback: Kakao Local 좌표 → 카카오맵 페이지 캡처 X (직접 정적 위성 이미지 API 없음)
    // 대안 — Naver Static Map (네이버 클라우드 가입 필요, 유료)
    // 실용적 대안: open street map static (무료, 위성 X) — 향 추정에 부적합
    return null;
  } catch {
    return null;
  }
}

async function analyzeWithGemini(b64: string, mime: string): Promise<VisionResult | null> {
  if (!GEMINI_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  const body = {
    contents: [{
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: mime, data: b64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 200,
      response_mime_type: 'application/json',
    },
  };
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 18000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const j = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return null;
    try {
      return JSON.parse(text) as VisionResult;
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) as VisionResult : null;
    }
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok || !ALLOWED_ROLES.has(auth.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const lat = parseFloat(sp.get('lat') || '0');
  const lng = parseFloat(sp.get('lng') || '0');
  const userDir = (sp.get('direction') || '').trim();

  if (!isFinite(lat) || !isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) {
    return NextResponse.json({ error: 'Invalid lat/lng (Korea bbox)' }, { status: 400 });
  }

  const sat = await fetchSatelliteAsBase64(lat, lng);
  if (!sat) {
    return NextResponse.json({
      success: false,
      error: 'satellite image fetch failed (VWORLD_API_KEY 환경변수 필요)',
      hint: 'https://www.vworld.kr 회원가입 → 인증키 발급 → Vercel env 추가',
    });
  }

  const vision = await analyzeWithGemini(sat.b64, sat.mime);
  if (!vision) {
    return NextResponse.json({ success: false, error: 'vision analysis failed' });
  }

  // 사장님 입력값과 비교
  let comparison: 'match' | 'mismatch' | 'no_user_input' = 'no_user_input';
  if (userDir && vision.estimatedDirection) {
    comparison = userDir === vision.estimatedDirection ? 'match' : 'mismatch';
  }

  return NextResponse.json({
    success: true,
    userInput: userDir || null,
    aiEstimate: vision.estimatedDirection,
    confidence: vision.confidence,
    reasoning: vision.reasoning,
    comparison,
    source: 'V-World 위성 + Gemini 2.5 Flash Vision',
  });
}
