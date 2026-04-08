import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(req: NextRequest) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500 });
    }

    const body = await req.json();
    const {
      address, dong, type, deal, deposit, monthly, price,
      area_m2, area_supply_m2, floor_current, floor_total,
      direction, rooms, bathrooms, features, parking_available,
      buildingInfo, style, aiModel
    } = body;

    // 모델 선택
    const model = aiModel === 'best' ? 'claude-opus-4-20250514' : 'claude-sonnet-4-20250514';

    // 매물 정보 요약 (AI에게 전달용 - 분석 재료)
    let priceInfo = '';
    if (deal === '매매' && price) priceInfo = `매매 ${price}만원`;
    else if (deal === '전세' && deposit) priceInfo = `전세 ${deposit}만원`;
    else if (deal === '월세') priceInfo = `월세 ${deposit || 0}/${monthly || 0}만원`;

    const listingInfo = [
      `주소: ${address || ''}`,
      dong ? `동: ${dong}` : '',
      `매물유형: ${type || ''}`,
      `거래유형: ${deal || ''}`,
      priceInfo ? `가격: ${priceInfo}` : '',
      area_m2 ? `전용면적: ${area_m2}㎡` : '',
      area_supply_m2 ? `공급면적: ${area_supply_m2}㎡` : '',
      floor_current ? `층수: ${floor_current}층${floor_total ? '/' + floor_total + '층' : ''}` : '',
      direction ? `방향: ${direction}` : '',
      rooms ? `방: ${rooms}개` : '',
      bathrooms ? `화장실: ${bathrooms}개` : '',
      features?.length ? `특징: ${features.join(', ')}` : '',
      parking_available ? '주차 가능' : '',
      buildingInfo?.건물명 ? `건물명: ${buildingInfo.건물명}` : '',
      buildingInfo?.사용승인일 ? `사용승인일: ${buildingInfo.사용승인일}` : '',
      buildingInfo?.건물구조 ? `건물구조: ${buildingInfo.건물구조}` : '',
      buildingInfo?.주용도 ? `주용도: ${buildingInfo.주용도}` : '',      buildingInfo?.총주차대수 ? `총주차: ${buildingInfo.총주차대수}대` : '',
      buildingInfo?.승용엘리베이터 ? `엘리베이터: ${buildingInfo.승용엘리베이터}대` : '',
    ].filter(Boolean).join('\n');

    // 지역 키워드 추출
    const dongName = dong || '';
    const addressParts = (address || '').split(' ');
    const guName = addressParts.find((p: string) => p.endsWith('구')) || '';
    const cityName = addressParts[0] || '서울';

    const prompt = `당신은 서울/경기 현장을 직접 다니며 수백 건의 매물을 봐온 10년차 부동산 전문 중개사입니다.
아래 매물 정보를 분석해서, 고객이 "이 중개사는 정말 잘 안다"라고 신뢰할 수 있는 전문가 추천 설명을 작성해주세요.

⚠️ 절대 규칙 (위반 시 무효):
1. 가격(보증금/월세/매매가), 면적(㎡/평수), 층수 숫자, 정확한 주소는 절대 언급하지 마세요 — 이미 상세페이지에 표시됩니다.
2. "~자랑합니다", "~누릴 수 있습니다", "~우수합니다" 같은 광고 상투어를 사용하지 마세요.
3. 모든 정보는 구체적 근거를 함께 제시하세요 (예: "교통 편리" ❌ → "7호선 상도역 도보 4분, 환승 없이 강남 18분" ✅)

[분석할 매물 정보]
${listingInfo}

[제목 작성 규칙]
- 30자 이내, 간결하고 임팩트 있게
- 형식: "[지역] [핵심 차별점 1~2개] · [매물유형]"- 차별점은 이 매물만의 구체적 팩트 (예: "19층 남향", "역 도보3분", "2023 리모델링")
- 이모지 사용 금지
- 예시: "상도동 19층 남향 원룸 · 역세권 풀옵션"

[설명 작성 규칙]
아래 구조를 반드시 따르되, 각 섹션은 해당 매물에 맞는 구체적 내용으로 채워주세요.

구조:
---
💬 (감성 한줄평 — 이 집에서의 생활을 한 문장으로 그리는 카피. "~집", "~공간" 으로 끝내기)

⏱️ 출퇴근
(주요 업무지역 3곳까지의 실제 예상 소요시간. 지하철 노선명 포함. 형식: "강남역 00분(0호선) · 여의도 00분(0호선) · 종로 00분(0호선)")

🏪 도보 생활권
(도보 5분 이내 실제 있을 것으로 추정되는 편의시설. 구체적 상호명 또는 종류. 형식: "가까운역(0호선) · 편의점 · 마트명 · 카페거리 등")

✅ 추천 포인트
(이 매물을 추천하는 구체적 이유 3가지. 각각 한 줄. 반드시 근거 제시.
예시:
· 남향 고층이라 오전~오후 내내 자연광 확보, 조망권 우수
· 2019년 준공 철근콘크리트 구조, 관리 상태 양호
· 풀옵션 구비로 초기 정착 비용 최소화 가능)

👤 이런 분께 딱(이 매물에 가장 잘 맞는 타겟 2~3개. 구체적으로 — "직장인" ❌, "7호선 라인 강남 출퇴근 직장인" ✅)
---

추가 지침:
- 각 섹션 사이 빈 줄로 구분
- 건축물대장 정보(준공연도, 구조, 엘리베이터 등)가 있으면 추천 포인트의 근거로 활용
- ${dongName} 지역의 실제 주변 환경(역, 대학, 공원, 상권)을 구체적으로 추정해서 작성
- 총 400~600자 (간결하게 — 읽는 데 30초 이내)
- 문단이 아닌 구조화된 짧은 문장 위주로

[SEO 키워드]
- 고객이 실제 검색할 키워드 10~15개
- "${dongName} ${type}", "${guName} ${deal}", "${dongName} 역세권" 등 조합 포함

[해시태그]
- 10~15개, # 포함
- 지역 + 매물특성 + 타겟고객 조합

반드시 아래 JSON으로만 응답:
{
  "title": "제목",
  "description": "위 구조대로 작성된 설명 (줄바꿈은 \\n 사용)",
  "keywords": ["키워드1", ...],
  "tags": ["#태그1", ...],
  "meta_description": "검색엔진 메타 설명 (160자 이내)"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[generate-description] API error:', errText);
      return NextResponse.json({ success: false, error: `AI API 오류 (${response.status})` }, { status: 500 });
    }
    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    // JSON 파싱
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          success: true,
          title: parsed.title || '',
          description: parsed.description || text,
          keywords: parsed.keywords || [],
          tags: parsed.tags || [],
          meta_description: parsed.meta_description || '',
          model,
        });
      }
    } catch {
      // JSON 파싱 실패 시 텍스트 그대로 반환
    }

    return NextResponse.json({
      success: true,
      title: '',
      description: text,
      keywords: [],
      tags: [],
      meta_description: '',
      model,
    });
  } catch (error) {
    console.error('[generate-description] error:', error);
    return NextResponse.json(
      { success: false, error: '설명 생성에 실패했습니다' },
      { status: 500 }
    );
  }
}

