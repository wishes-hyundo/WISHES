// generate-description-v2 — Template + LLM hybrid (위치 환각 원천 차단)
// 강화: 2026-04-29 — LLM 은 분위기/차별점만, 위치는 server-side template
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { buildRagContext, enrichRagWithStations, type ListingFacts } from '@/lib/listing-rag';
import { selectStyle, selectHeadlinePattern, type ListingStyle } from '@/lib/listing-styles';
import { verifyDescription, type VerifyResult } from '@/lib/listing-verify';

export const maxDuration = 30;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// ── LLM prompt — 위치 정보 작성 권한 자체 박탈 ──
function buildPrompt(facts: ListingFacts, style: ListingStyle, headlinePattern: string): string {
  const hooks = facts.unique_hooks.length > 0 ? `- 차별점: ${facts.unique_hooks.join(', ')}` : '';
  const targetMap = {
    single: '1인 직장인 / 학생 / 사회 초년생',
    couple: '신혼부부 / 2인 거주',
    family: '3~4인 가족',
    business: '사업자 / 사무용',
    investor: '투자자 / 임대인',
  };

  return `당신은 매물 카피라이터입니다. 매물의 분위기, 차별점, 라이프스타일 매칭 만 작성하세요.
페르소나: ${style.persona}
어조: ${style.tone}

🚨 [절대 작성 금지 — 시스템이 자동 추가]
- 지하철역 이름 (예: 신림역, 강남역) → 시스템이 별도 표시
- 호선 정보 (예: 2호선, 9호선) → 시스템이 별도 표시
- 도보 시간, 도보권, 거리 → 시스템이 별도 표시
- 동/구 이름 (예: 관악구, 신림동, 강남구) → 시스템이 별도 표시
- 광역 지역 (예: 강남, 강북, 종로, 사당, 노량진) → 시스템 X
- 출퇴근 표현 ("강남 출퇴근 빠르다", "역세권") → 사용 X
- 인근 지역 추측 ("도보권 내", "주요 지하철과 가깝다") → 사용 X
- 대학교 이름 (예: 서울대학교) → 시스템 X
- "캠퍼스", "교육특구", "학원가" → 사용 X
※ 본문에 위 키워드 한 단어라도 들어가면 응답 무효 처리

[작성할 내용 — 매물 자체의 가치만]
- 매물 종류: ${facts.type} (${facts.deal})
${facts.building_name ? `- 건물명: ${facts.building_name}` : ''}
${facts.built_year ? `- 준공: ${facts.built_year}년${facts.is_new_building ? ' (5년 이내 신축)' : ''}` : ''}
${hooks}
- 즉시입주: ${facts.is_immediate_movein ? '가능' : '협의'}
- 추천 타겟: ${targetMap[facts.target_segment]}
- 풀옵션: ${facts.is_full_option ? '풀옵션' : '일반'}
- 엘리베이터: ${facts.has_elevator ? '있음' : '없음'}
- 주차: ${facts.has_parking ? '가능' : '불가'}

[작성 지침]
헤드라인 패턴: "${headlinePattern}"
- 매물 분위기 (깨끗, 채광, 구조)
- 차별점 hook (풀옵션, 신축, 리모델링)
- 타겟 라이프스타일 매칭 (위 추천 타겟에 어떤 매력)
- 위치 / 교통 / 인근 지역 / 동네 추측 → 한 문장도 X (시스템 자동)

[금지 표현]
- "따뜻한", "포근한", "감성", "보금자리", "끝판왕", "천국", "가성비", "완벽한"
- 과한 감탄사 (!!, ♡, ★)

[형식 — JSON만]
{
  "title": "헤드라인 (15~22자, 위치 키워드 X)",
  "description": "본문 (200~400자, 위치 키워드 한 단어도 X)",
  "keywords": ["...10~15개 (역명/동/구/광역 X)"],
  "tags": ["#태그..8~12개 (역명/동/구/광역 X)"],
  "meta_description": "메타 (140~160자, 위치 X)"
}`;
}

// ── 후처리: 위치 키워드 발견 시 reject ──
const FORBIDDEN_LOCATION_KEYWORDS = [
  /[가-힣A-Za-z]{1,8}역/,   // 모든 역
  /[0-9]\s*호선|분당선|신분당선|경의중앙선|공항철도/,
  /도보\s*\d+\s*분/,
  /도보권/,
  /역세권/,
  /출퇴근/,
  /[가-힣]{2,4}구\s/,         // OO구 (단어 경계)
  /[가-힣]{1,4}동\s/,         // OO동 (단어 경계)
  /강남|강북|종로|사당|노량진|광화문|시청|을지로|충무로|명동|홍대|신촌|이태원|압구정|청담|건대|성수/,
  /캠퍼스|교육특구|학원가/,
  /대학교/,
  /인근|근처|주변/,            // 광역 추측 표현
];

function detectLocationKeywords(text: string): { found: boolean; keyword?: string } {
  for (const re of FORBIDDEN_LOCATION_KEYWORDS) {
    const m = text.match(re);
    if (m) return { found: true, keyword: m[0] };
  }
  return { found: false };
}

// ── Server-side template: 위치 정보 자동 추가 ──
function appendLocationLine(llmDescription: string, facts: ListingFacts): string {
  const parts: string[] = [];
  if (facts.gu && facts.dong) parts.push(`${facts.gu} ${facts.dong}`);
  if (facts.station_name && facts.station_distance) {
    const lineInfo = facts.station_lines && facts.station_lines.length > 0 ? ` (${facts.station_lines[0]})` : '';
    parts.push(`${facts.station_name}역${lineInfo} 도보 ${facts.station_distance}분`);
  }
  if (parts.length === 0) return llmDescription;
  return llmDescription.trim() + '\n\n📍 ' + parts.join(' · ');
}

async function callGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, topP: 0.85, maxOutputTokens: 2048, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

async function callAnthropic(prompt: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048, temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.content?.[0]?.text || null;
  } catch { return null; }
}

function parseLLMJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  let cleaned = raw.replace(/^```(?:json)?/gm, '').replace(/```$/gm, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  cleaned = cleaned.substring(start, end + 1);
  try { return JSON.parse(cleaned); } catch { return null; }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const ip = getClientIp(request);
  const rl = checkRateLimit({ key: `gen-desc-v2:ip:${ip}`, limit: 30, windowMs: 15 * 60_000 });
  if (!rl.ok) return NextResponse.json({ error: '요청 너무 많음' }, { status: 429 });
  if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) return NextResponse.json({ error: 'no LLM key' }, { status: 500 });

  let body: { listingId?: number; force_style_id?: string } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }
  const listingId = body.listingId;
  if (!listingId || typeof listingId !== 'number') return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  const supabase = createServerClient();
  const { data: listing, error } = await supabase
    .from('listings')
    .select(`
      id, type, deal, status, dong, gu, address, building_name,
      area_m2, area_supply_m2, floor_current, floor_total, rooms, bathrooms,
      direction, heating_type, available_date, built_year,
      parking, parking_spaces, elevator, pet, balcony, full_option,
      maintenance_fee, lat, lng, raw_fields, field_sources
    `)
    .eq('id', listingId)
    .single();
  if (error || !listing) return NextResponse.json({ error: 'listing not found' }, { status: 404 });

  let rag = buildRagContext(listing as Record<string, unknown>);
  const lat = (listing as { lat?: number }).lat;
  const lng = (listing as { lng?: number }).lng;
  rag = await enrichRagWithStations(rag, lat, lng);

  const style = body.force_style_id
    ? require('@/lib/listing-styles').LISTING_STYLES.find((s: ListingStyle) => s.id === body.force_style_id) || selectStyle(listingId, rag.facts.target_segment)
    : selectStyle(listingId, rag.facts.target_segment);
  const headlinePattern = selectHeadlinePattern(listingId);

  // retry 3회 — 위치 키워드 발견 시 재생성
  let title = '', llmDescription = '', meta_description = '';
  let keywords: string[] = [], tags: string[] = [];
  let used_llm = '';
  let attempt = 0;
  let lastViolation: { found: boolean; keyword?: string } = { found: false };

  while (attempt < 3) {
    attempt++;
    const prompt = buildPrompt(rag.facts, style, headlinePattern);
    let raw: string | null = null;
    if (GEMINI_API_KEY) { raw = await callGemini(prompt); if (raw) used_llm = 'gemini-2.5-flash'; }
    if (!raw && ANTHROPIC_API_KEY) { raw = await callAnthropic(prompt); if (raw) used_llm = 'claude-haiku-4.5'; }
    if (!raw) return NextResponse.json({ error: 'LLM 호출 실패' }, { status: 502 });

    const parsed = parseLLMJson(raw);
    if (!parsed) return NextResponse.json({ error: 'JSON 파싱 실패' }, { status: 502 });

    title = String(parsed.title || '').trim();
    llmDescription = String(parsed.description || '').trim();
    keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [];
    tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
    meta_description = String(parsed.meta_description || '').trim();

    // 위치 키워드 검증
    const vTitle = detectLocationKeywords(title);
    const vDesc = detectLocationKeywords(llmDescription);
    const vMeta = detectLocationKeywords(meta_description);
    if (!vTitle.found && !vDesc.found && !vMeta.found) {
      lastViolation = { found: false };
      break;
    }
    lastViolation = vDesc.found ? vDesc : (vTitle.found ? vTitle : vMeta);
  }

  if (lastViolation.found) {
    return NextResponse.json({
      success: false,
      error: 'LLM 이 위치 키워드 작성 — 3회 retry 실패',
      offending_keyword: lastViolation.keyword,
      attempts: attempt,
    }, { status: 502 });
  }

  // Server-side template: 위치 정보 자동 추가
  const description = appendLocationLine(llmDescription, rag.facts);

  const verify_title: VerifyResult = verifyDescription(title, rag.facts, { minLen: 5, maxLen: 35 });
  const verify_desc: VerifyResult = verifyDescription(description, rag.facts, { minLen: 100, maxLen: 800 });

  return NextResponse.json({
    success: true,
    title,
    description,
    keywords,
    tags,
    meta_description,
    style: { id: style.id, name: style.name_ko },
    headline_pattern: headlinePattern,
    used_llm,
    attempts: attempt,
    verify: { title: verify_title, description: verify_desc, passed: verify_title.ok && verify_desc.ok },
    facts_used: {
      gu: rag.facts.gu, dong: rag.facts.dong,
      station_name: rag.facts.station_name, station_distance: rag.facts.station_distance,
    },
    template: { location_appended: true },
  });
}
