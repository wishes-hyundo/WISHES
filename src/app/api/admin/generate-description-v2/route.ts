// ──────────────────────────────────────────────────────────────────────
// BoB 매물 설명 v2 — RAG + 다양성 + 환각 0
// 작성: 2026-04-27 v3 세션
// 강화: 2026-04-29 — 카카오 좌표 fresh fetch + 위치 환각 검증
// ──────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { buildRagContext, enrichRagWithStations, detectStationHallucination, type ListingFacts } from '@/lib/listing-rag';
import { selectStyle, selectHeadlinePattern, type ListingStyle } from '@/lib/listing-styles';
import { verifyDescription, type VerifyResult } from '@/lib/listing-verify';

export const maxDuration = 30;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';

// ── 1. 프롬프트 빌더 ─────────────────────────────
function buildPrompt(
  facts: ListingFacts,
  style: ListingStyle,
  headlinePattern: string,
  forbiddenTopics: string[]
): string {
  const stationLine = facts.station_name && facts.station_distance
    ? `- 가장 가까운 지하철역: ${facts.station_name} (도보 ${facts.station_distance}분, 카카오 좌표 검증)`
    : '- 지하철 정보: 1.5km 안에 역 없음 → 본문에 역 이름 / "역세권" / "OO역 인근" 등 절대 언급 금지';

  const builtLine = facts.built_year
    ? `- 준공: ${facts.built_year}년${facts.is_new_building ? ' (5년 이내 신축)' : ''}`
    : '';

  const hooks = facts.unique_hooks.length > 0
    ? `- 검증된 차별점: ${facts.unique_hooks.join(', ')}`
    : '';

  const nearby = facts.nearby_known.length > 0
    ? `- 매물 본문에 명시된 주변: ${facts.nearby_known.join(', ')}`
    : '- 주변 시설 정보 없음 (절대 임의로 만들지 마세요)';

  const targetMap = {
    single: '1인 직장인 / 학생 / 사회 초년생',
    couple: '신혼부부 / 2인 거주',
    family: '3~4인 가족 / 자녀 있는 세대',
    business: '사업자 / 자영업자 / 사무용',
    investor: '투자자 / 임대인',
  };

  return `당신은 ${facts.gu} ${facts.dong} 지역에서 10년 넘게 매물을 봐온 부동산 중개사입니다.
페르소나: ${style.persona}
어조: ${style.tone}

[검증된 사실 — 이 정보만 사용하세요]
- 위치: ${facts.gu} ${facts.dong}
- 매물 종류: ${facts.type} (${facts.deal})
${facts.building_name ? `- 건물명: ${facts.building_name}` : ''}
${stationLine}
${builtLine}
${hooks}
${nearby}
- 즉시입주: ${facts.is_immediate_movein ? '가능' : '협의'}
- 추천 타겟: ${targetMap[facts.target_segment]}
- 풀옵션 여부: ${facts.is_full_option ? '풀옵션 매물' : '일반'}
- 엘리베이터: ${facts.has_elevator ? '있음' : '없음'}
- 주차: ${facts.has_parking ? '가능' : '불가/협의'}
${facts.pet_allowed === true ? '- 반려동물: 가능' : facts.pet_allowed === false ? '- 반려동물: 불가' : ''}

[절대 언급 금지]
${forbiddenTopics.map((t) => `- ${t}`).join('\n')}
※ 가격/면적/층수/방수/옵션 14개 나열/주차대수 같은 숫자 정보는 매물 카드에 별도로 표시되니 매물 설명에서는 절대 언급하지 마세요.

[작성 지침]
헤드라인 시작 패턴: "${headlinePattern}"
스타일 예시: "${style.example}"

목표 — 고객의 "왜 이 매물을 계약해야 하는가?" 의문에 답하는 마케팅 카피.
- 숫자/스펙 나열 X (이미 표에 있음)
- 입지의 진짜 가치 + 라이프스타일 매칭 + 차별점 hook
- "추정"하지 말고 위 검증된 사실만 사용
- 사실에 없는 지하철역, 시설, 동네 이름은 절대 만들지 마세요
- ⚠️ 위치 검증: facts 의 station_name 외의 다른 역 이름 (예: "서울대입구역", "강남역" 등) 절대 언급 X
- ⚠️ "역세권", "주요 지하철역과 가깝다" 등의 표현도 facts.station_name 없으면 사용 X
- 출퇴근 / 강남 / 종로 / 인근 노선 등 추측성 광역 표현 금지 (실제 좌표 기반이 아닌 광역 추측)

[금지 표현 (한 단어라도 포함 시 무효)]
- "따뜻한", "포근한", "아늑한", "감성", "보금자리", "힐링"
- "~의 정석", "끝판왕", "천국", "가성비"
- "나만의 공간", "혼자만의 공간", "완벽한"
- 과한 감탄사 (!!, ♡, ★)

[자연스러운 어미]
- ~네요, ~거든요, ~답니다, ~인데요 자연스럽게 섞어쓰기
- "~합니다" 만 반복 X

[형식 — JSON 만 출력. 다른 텍스트 X]
{
  "title": "헤드라인 (15~22자, ${headlinePattern} 패턴)",
  "description": "본문 (250~500자, 단락 사이 빈 줄)",
  "keywords": ["키워드1", "키워드2", "...10~15개"],
  "tags": ["#태그1", "#태그2", "...8~12개"],
  "meta_description": "검색엔진 메타 설명 (140~160자)"
}`;
}

// ── 2. Gemini 2.5 Flash 호출 ─────────────────────
async function callGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          topP: 0.9,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[generate-description-v2] Gemini error:', res.status, errText.slice(0, 200));
      return null;
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || null;
  } catch (e) {
    console.error('[generate-description-v2] Gemini exception:', e);
    return null;
  }
}

// ── 3. Anthropic Haiku 호출 (fallback) ───────────
async function callAnthropic(prompt: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        temperature: 0.9,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[generate-description-v2] Anthropic error:', res.status, errText.slice(0, 200));
      return null;
    }
    const json = await res.json();
    const text = json?.content?.[0]?.text;
    return text || null;
  } catch (e) {
    console.error('[generate-description-v2] Anthropic exception:', e);
    return null;
  }
}

// ── 4. JSON 파싱 ───────────────────────────────────
function parseLLMJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  let cleaned = raw.replace(/^```(?:json)?/gm, '').replace(/```$/gm, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  cleaned = cleaned.substring(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ── 5. 메인 핸들러 ─────────────────────────────────
export async function POST(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rl = checkRateLimit({ key: `gen-desc-v2:${ip}`, limit: 30, windowMs: 15 * 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY 또는 ANTHROPIC_API_KEY 둘 다 미설정' },
      { status: 500 }
    );
  }

  let body: { listingId?: number; force_style_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const listingId = body.listingId;
  if (!listingId || typeof listingId !== 'number') {
    return NextResponse.json({ error: 'listingId required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: listing, error } = await supabase
    .from('listings')
    .select(`
      id, type, deal, status, dong, gu, address, building_name,
      area_m2, area_supply_m2, floor_current, floor_total, rooms, bathrooms,
      direction, heating_type, available_date, built_year,
      parking, parking_spaces, elevator, pet, balcony, full_option,
      maintenance_fee, station_name, station_distance,
      lat, lng, subway_data,
      raw_fields, field_sources
    `)
    .eq('id', listingId)
    .single();

  if (error || !listing) {
    return NextResponse.json({ error: 'listing not found', detail: error?.message }, { status: 404 });
  }

  // RAG context
  let rag = buildRagContext(listing as Record<string, unknown>);

  // L-loc-fix (2026-04-29): 카카오 SW8 직접 호출로 100% 정확한 가장 가까운 역 보장.
  const lat = (listing as { lat?: number }).lat;
  const lng = (listing as { lng?: number }).lng;
  rag = await enrichRagWithStations(rag, lat, lng);

  const style = body.force_style_id
    ? require('@/lib/listing-styles').LISTING_STYLES.find((s: ListingStyle) => s.id === body.force_style_id) || selectStyle(listingId, rag.facts.target_segment)
    : selectStyle(listingId, rag.facts.target_segment);
  const headlinePattern = selectHeadlinePattern(listingId);

  const prompt = buildPrompt(rag.facts, style, headlinePattern, rag.forbidden_topics);

  let raw: string | null = null;
  let used_llm = '';

  if (GEMINI_API_KEY) {
    raw = await callGemini(prompt);
    if (raw) used_llm = 'gemini-2.5-flash';
  }
  if (!raw && ANTHROPIC_API_KEY) {
    raw = await callAnthropic(prompt);
    if (raw) used_llm = 'claude-haiku-4.5';
  }

  if (!raw) {
    return NextResponse.json(
      { error: 'LLM 호출 실패', tried: { gemini: !!GEMINI_API_KEY, anthropic: !!ANTHROPIC_API_KEY } },
      { status: 502 }
    );
  }

  const parsed = parseLLMJson(raw);
  if (!parsed) {
    return NextResponse.json(
      { error: 'LLM 응답 JSON 파싱 실패', raw: raw.slice(0, 500) },
      { status: 502 }
    );
  }

  const title = String(parsed.title || '').trim();
  const description = String(parsed.description || '').trim();
  const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [];
  const tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
  const meta_description = String(parsed.meta_description || '').trim();

  const verify_title: VerifyResult = verifyDescription(title, rag.facts, { minLen: 5, maxLen: 35 });
  const verify_desc: VerifyResult = verifyDescription(description, rag.facts, { minLen: 100, maxLen: 800 });

  // L-loc-fix (2026-04-29): 위치 환각 검증
  const halluTitle = detectStationHallucination(title, rag.facts);
  const halluDesc = detectStationHallucination(description, rag.facts);
  const halluMeta = detectStationHallucination(meta_description, rag.facts);
  const locationHallucinated = halluTitle.hallucinated || halluDesc.hallucinated || halluMeta.hallucinated;

  return NextResponse.json({
    success: !locationHallucinated,
    title,
    description,
    keywords,
    tags,
    meta_description,
    style: { id: style.id, name: style.name_ko },
    headline_pattern: headlinePattern,
    used_llm,
    verify: {
      title: verify_title,
      description: verify_desc,
      passed: verify_title.ok && verify_desc.ok && !locationHallucinated,
      location_hallucinated: locationHallucinated,
      offending_station: halluTitle.offending || halluDesc.offending || halluMeta.offending || null,
    },
    facts_used: {
      gu: rag.facts.gu,
      dong: rag.facts.dong,
      station_name: rag.facts.station_name,
      station_distance: rag.facts.station_distance,
    },
  });
}
