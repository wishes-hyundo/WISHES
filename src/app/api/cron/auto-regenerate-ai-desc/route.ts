// /api/cron/auto-regenerate-ai-desc — ai_description NULL 매물 백그라운드 재생성
// 작성: 2026-04-29 사장님 명령 "전매물 재생성 내가 하나하나 못 함"
//
// 정책:
//   - ai_description IS NULL 매물 매 호출당 N건씩 처리
//   - generate-description-v2 직접 함수 호출 (self-call 없음)
//   - 100% 보장 위치 데이터 (PostGIS subway_stations + 카카오 모빌리티 도보)
//   - 실패 시 다음 호출에서 재시도
//   - Vercel cron 매 5분 자동 발동 (사장님 손 0)
//
// 비용:
//   - Gemini 2.5 Flash 무료 일 100K 호출
//   - 매 5분 30건 = 1일 8,640건. 13,835건 → 약 1.6일 소요
//   - 1회 호출 maxDuration 60초

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { buildRagContext, enrichRagWithStations, detectStationHallucination, type ListingFacts } from '@/lib/listing-rag';
import { selectStyle, selectHeadlinePattern, type ListingStyle } from '@/lib/listing-styles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const BATCH_SIZE = 30;

function buildPrompt(
  facts: ListingFacts,
  style: ListingStyle,
  headlinePattern: string,
  forbiddenTopics: string[]
): string {
  const stationLine = facts.station_name && facts.station_distance
    ? `- 가장 가까운 지하철역: ${facts.station_name} (도보 ${facts.station_distance}분, 카카오 좌표 검증)`
    : '- 지하철 정보: 1.5km 안에 역 없음 → 본문에 역 이름 / "역세권" / "OO역 인근" 등 절대 언급 금지';
  const builtLine = facts.built_year ? `- 준공: ${facts.built_year}년${facts.is_new_building ? ' (5년 이내 신축)' : ''}` : '';
  const hooks = facts.unique_hooks.length > 0 ? `- 검증된 차별점: ${facts.unique_hooks.join(', ')}` : '';
  const nearby = facts.nearby_known.length > 0 ? `- 매물 본문에 명시된 주변: ${facts.nearby_known.join(', ')}` : '- 주변 시설 정보 없음 (절대 임의로 만들지 마세요)';
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

[검증된 사실 — 이 정보만 사용]
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

[절대 언급 금지]
${forbiddenTopics.map((t) => `- ${t}`).join('\n')}

[작성 지침]
헤드라인 패턴: "${headlinePattern}"
- 숫자/스펙 나열 X
- facts 의 station_name 외 다른 역 이름 절대 언급 X
- "역세권" / "OO역 인근" 도 facts.station_name 없으면 사용 X

[금지 표현]
- "따뜻한", "포근한", "아늑한", "감성", "보금자리"
- "끝판왕", "천국", "가성비", "완벽한"

[형식 — JSON 만 출력]
{
  "title": "헤드라인 (15~22자)",
  "description": "본문 (250~500자)",
  "keywords": ["키워드1", "키워드2", "...10~15개"],
  "tags": ["#태그1", "#태그2", "...8~12개"],
  "meta_description": "검색엔진 메타 (140~160자)"
}`;
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
        generationConfig: { temperature: 0.9, topP: 0.9, maxOutputTokens: 2048, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    return null;
  }
}

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

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (cronSecret && !isUserSecret && !isVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'no LLM key' }, { status: 500 });
  }

  const supabase = createServerClient();

  // 1) ai_description NULL 매물 N개 가져옴 (status='공개' 우선)
  const { data: targets, error } = await supabase
    .from('listings')
    .select(`
      id, type, deal, status, dong, gu, address, building_name,
      area_m2, area_supply_m2, floor_current, floor_total, rooms, bathrooms,
      direction, heating_type, available_date, built_year,
      parking, parking_spaces, elevator, pet, balcony, full_option,
      maintenance_fee, lat, lng, raw_fields
    `)
    .is('ai_description', null)
    .eq('status', '공개')
    .not('lat', 'is', null)
    .order('id', { ascending: false })
    .limit(BATCH_SIZE);

  if (error || !targets || targets.length === 0) {
    return NextResponse.json({ success: true, processed: 0, remaining: 0, error: error?.message });
  }

  let success = 0, failed = 0, hallucinated = 0;
  const startedAt = Date.now();

  for (const listing of targets) {
    if (Date.now() - startedAt > 50000) break; // 50초 안전 한도

    try {
      let rag = buildRagContext(listing as Record<string, unknown>);
      const lat = (listing as { lat?: number }).lat;
      const lng = (listing as { lng?: number }).lng;
      rag = await enrichRagWithStations(rag, lat, lng);

      const style = selectStyle(listing.id as number, rag.facts.target_segment);
      const headlinePattern = selectHeadlinePattern(listing.id as number);
      const prompt = buildPrompt(rag.facts, style, headlinePattern, rag.forbidden_topics);

      const raw = await callGemini(prompt);
      if (!raw) { failed++; continue; }
      const parsed = parseLLMJson(raw);
      if (!parsed) { failed++; continue; }

      const title = String(parsed.title || '').trim();
      const description = String(parsed.description || '').trim();
      const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [];
      const tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
      const meta_description = String(parsed.meta_description || '').trim();

      // 환각 검증
      const halluTitle = detectStationHallucination(title, rag.facts);
      const halluDesc = detectStationHallucination(description, rag.facts);
      const halluMeta = detectStationHallucination(meta_description, rag.facts);
      if (halluTitle.hallucinated || halluDesc.hallucinated || halluMeta.hallucinated) {
        hallucinated++;
        // 환각 발견 — 저장 X (다음 호출에서 재시도)
        continue;
      }

      // DB 저장
      await supabase.from('listings').update({
        ai_title: title,
        ai_description: description,
        ai_generated_at: new Date().toISOString(),
        ai_generated_fields: { keywords, tags, station_name: rag.facts.station_name },
        seo_keywords: keywords,
        seo_meta_description: meta_description,
        seo_tags: tags,
      }).eq('id', listing.id);

      success++;
    } catch {
      failed++;
    }
  }

  // 잔여 카운트
  const { count: remaining } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .is('ai_description', null)
    .eq('status', '공개');

  return NextResponse.json({
    success: true,
    batch: targets.length,
    processed: success,
    failed,
    hallucinated,
    remaining: remaining ?? null,
    duration_ms: Date.now() - startedAt,
  });
}
