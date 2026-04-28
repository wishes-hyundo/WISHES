// auto-regenerate-ai-desc — Template + LLM hybrid (위치 환각 원천 차단)
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { buildRagContext, enrichRagWithStations, type ListingFacts } from '@/lib/listing-rag';
import { selectStyle, selectHeadlinePattern, type ListingStyle } from '@/lib/listing-styles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
const BATCH_SIZE = 30;

const FORBIDDEN_LOC = [
  /[가-힣A-Za-z]{1,8}역/,
  /[0-9]\s*호선|분당선|신분당선|경의중앙선|공항철도/,
  /도보\s*\d+\s*분/,
  /도보권/, /역세권/, /출퇴근/,
  /[가-힣]{2,4}구\s/, /[가-힣]{1,4}동\s/,
  /강남|강북|종로|사당|노량진|광화문|시청|을지로|충무로|명동|홍대|신촌|이태원|압구정|청담|건대|성수/,
  /캠퍼스|교육특구|학원가/, /대학교/,
  /인근|근처|주변/,
];

function detectLoc(text: string): { found: boolean; keyword?: string } {
  for (const re of FORBIDDEN_LOC) {
    const m = text.match(re);
    if (m) return { found: true, keyword: m[0] };
  }
  return { found: false };
}

function appendLocation(llm: string, facts: ListingFacts): string {
  const parts: string[] = [];
  if (facts.gu && facts.dong) parts.push(`${facts.gu} ${facts.dong}`);
  if (facts.station_name && facts.station_distance) {
    const line = facts.station_lines && facts.station_lines.length > 0 ? ` (${facts.station_lines[0]})` : '';
    parts.push(`${facts.station_name}역${line} 도보 ${facts.station_distance}분`);
  }
  if (parts.length === 0) return llm;
  return llm.trim() + '\n\n📍 ' + parts.join(' · ');
}

function buildPrompt(facts: ListingFacts, style: ListingStyle, headlinePattern: string): string {
  const hooks = facts.unique_hooks.length > 0 ? `- 차별점: ${facts.unique_hooks.join(', ')}` : '';
  const targetMap = {
    single: '1인 직장인 / 학생 / 사회 초년생',
    couple: '신혼부부 / 2인 거주',
    family: '3~4인 가족',
    business: '사업자 / 사무용',
    investor: '투자자 / 임대인',
  };
  return `당신은 매물 카피라이터입니다. 매물의 분위기, 차별점, 라이프스타일 매칭만 작성하세요.
페르소나: ${style.persona}

🚨 [절대 작성 금지 — 시스템이 자동 추가]
- 지하철역 이름 / 호선 / 도보 시간 / 거리 → 시스템 자동
- 동/구 이름 (관악구, 신림동, 강남구 등) → 시스템 자동
- 광역 지역 (강남, 강북, 종로, 사당, 노량진 등) → X
- 출퇴근 / 역세권 / 도보권 / 인근 / 근처 / 주변 → X
- 대학교 / 캠퍼스 / 교육특구 / 학원가 → X
※ 본문에 한 단어라도 포함되면 무효 처리

[작성할 내용 — 매물 자체의 가치만]
- 매물: ${facts.type} (${facts.deal})
${facts.building_name ? `- 건물명: ${facts.building_name}` : ''}
${facts.built_year ? `- 준공: ${facts.built_year}년${facts.is_new_building ? ' (5년 이내 신축)' : ''}` : ''}
${hooks}
- 즉시입주: ${facts.is_immediate_movein ? '가능' : '협의'}
- 추천 타겟: ${targetMap[facts.target_segment]}
- 풀옵션: ${facts.is_full_option ? '풀옵션' : '일반'}
- 엘리베이터: ${facts.has_elevator ? '있음' : '없음'}
- 주차: ${facts.has_parking ? '가능' : '불가'}

[작성 지침]
헤드라인: "${headlinePattern}"
- 매물 분위기 + 차별점 + 타겟 매칭만
- 위치/교통/광역 추측 한 문장도 X

[금지 표현]
- "따뜻한", "포근한", "감성", "보금자리", "끝판왕", "천국", "가성비", "완벽한"

[형식 — JSON만]
{
  "title": "헤드라인 (15~22자, 위치 X)",
  "description": "본문 (200~400자, 위치 X)",
  "keywords": ["...10~15개 (역명/동/구/광역 X)"],
  "tags": ["#태그..8~12개 (역명/동/구/광역 X)"],
  "meta_description": "메타 (140~160자, 위치 X)"
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
        generationConfig: { temperature: 0.7, topP: 0.85, maxOutputTokens: 2048, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text || null;
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

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (cronSecret && !isUserSecret && !isVercelCron) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!GEMINI_API_KEY) return NextResponse.json({ error: 'no LLM key' }, { status: 500 });

  const supabase = createServerClient();
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
    return NextResponse.json({ success: true, processed: 0 });
  }

  let success = 0, failed = 0, hallucinated = 0;
  const startedAt = Date.now();

  for (const listing of targets) {
    if (Date.now() - startedAt > 50000) break;

    try {
      let rag = buildRagContext(listing as Record<string, unknown>);
      const lat = (listing as { lat?: number }).lat;
      const lng = (listing as { lng?: number }).lng;
      rag = await enrichRagWithStations(rag, lat, lng);

      const style = selectStyle(listing.id as number, rag.facts.target_segment);
      const headlinePattern = selectHeadlinePattern(listing.id as number);

      let title = '', llmDesc = '', meta_description = '';
      let keywords: string[] = [], tags: string[] = [];
      let attempt = 0;
      let violation: { found: boolean; keyword?: string } = { found: false };

      while (attempt < 3) {
        attempt++;
        const prompt = buildPrompt(rag.facts, style, headlinePattern);
        const raw = await callGemini(prompt);
        if (!raw) { violation = { found: true }; break; }
        const parsed = parseLLMJson(raw);
        if (!parsed) { violation = { found: true }; break; }

        title = String(parsed.title || '').trim();
        llmDesc = String(parsed.description || '').trim();
        keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [];
        tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
        meta_description = String(parsed.meta_description || '').trim();

        const vT = detectLoc(title);
        const vD = detectLoc(llmDesc);
        const vM = detectLoc(meta_description);
        if (!vT.found && !vD.found && !vM.found) {
          violation = { found: false };
          break;
        }
        violation = vD.found ? vD : (vT.found ? vT : vM);
      }

      if (violation.found) { hallucinated++; continue; }

      const description = appendLocation(llmDesc, rag.facts);

      await supabase.from('listings').update({
        ai_title: title,
        ai_description: description,
        ai_generated_at: new Date().toISOString(),
        ai_generated_fields: { keywords, tags, station_name: rag.facts.station_name, template: 'hybrid' },
        seo_keywords: keywords,
        seo_meta_description: meta_description,
        seo_tags: tags,
      }).eq('id', listing.id);

      success++;
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
    processed: success,
    failed,
    hallucinated,
    remaining: remaining ?? null,
    duration_ms: Date.now() - startedAt,
  });
}
