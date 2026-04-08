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

    // 모델 선택: best = Opus 4 (최고 품질), latest = Sonnet 4 (최신/빠름)
    const model = aiModel === 'best' ? 'claude-opus-4-20250514' : 'claude-sonnet-4-20250514';

    // 매물 정보 요약
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
      buildingInfo?.주용도 ? `주용도: ${buildingInfo.주용도}` : '',
      buildingInfo?.총주차대수 ? `총주차: ${buildingInfo.총주차대수}대` : '',
      buildingInfo?.승용엘리베이터 ? `엘리베이터: ${buildingInfo.승용엘리베이터}대` : '',
    ].filter(Boolean).join('\n');

    // 지역 키워드 추출
    const dongName = dong || '';
    const addressParts = (address || '').split(' ');
    const guName = addressParts.find((p: string) => p.endsWith('구')) || '';
    const cityName = addressParts[0] || '서울';

    const styleGuide = style === 'premium'
      ? '고급스럽고 전문적인 톤으로 작성해주세요. 품격 있고 신뢰감 있는 문체로 작성해주세요.'
      : style === 'clean'
        ? '깔끔하고 간결한 정보 전달 위주로 작성해주세요.'
        : '트렌디하고 캐주얼한 부동산 광고 문체로 작성해주세요. 이모지를 적극 활용하고, 자취생/직장인 타겟으로 캐치프레이즈를 사용해주세요.';

    const prompt = `당신은 한국 서울/경기권 부동산 중개업소의 SEO 전문 매물 광고 카피라이터입니다.
아래 매물 정보를 바탕으로 **부동산 포털 사이트(네이버부동산, 직방, 다방, 피터팬 등)에서 검색 노출이 극대화**되는 매물 제목과 설명을 생성해주세요.

${styleGuide}

[매물 정보]
${listingInfo}

[SEO 최적화 필수 규칙]

**제목 (title) 작성 규칙:**
- 40자 이내
- 핵심 검색 키워드를 앞쪽에 배치 (예: "${dongName} ${type} ${deal}")
- 차별화 포인트 1~2개 포함 (역세권/신축/풀옵션/채광좋은/리모델링 등)
- 고객이 검색할만한 자연스러운 키워드 조합
- 예시 패턴: "[지역] [특장점] [매물유형] [거래유형]"

**설명 (description) 작성 규칙:**
- 500~800자
- 첫 2줄이 가장 중요: 검색 결과 미리보기에 노출되므로 핵심 매력 포인트를 배치
- 자연스럽게 SEO 키워드를 본문에 녹여넣기:
  · 지역 키워드: ${cityName}, ${guName}, ${dongName}, 주변 역이름(추정), 주변 대학교/학교(추정)
  · 매물 키워드: ${type}, ${deal}, 신축/리모델링, 풀옵션, 역세권, 채광, 통풍
  · 생활 키워드: 편의점, 마트, 카페, 병원, 공원, 대중교통
  · 타겟 키워드: 직장인, 자취, 신혼부부, 1인가구, 사무실, 창업
- 아래 정보는 상세페이지에 이미 표시되므로 설명에 포함하지 마세요:
  · 보증금/월세/매매가 금액
  · 전용면적/공급면적 숫자
  · 층수 숫자
  · 정확한 주소
- 포함해야 할 내용:
  · 교통 접근성 (가까운 역/버스 추정)
  · 주변 생활 인프라 (마트/편의점/카페/병원/학교/공원)
  · 건물 상태와 관리 수준
  · 채광/통풍/조망 (방향 정보 기반 추정)
  · 동네 분위기와 안전성
  · 이 매물만의 차별화 포인트
- 마지막에 자연스러운 문의 유도 문구

**SEO 키워드 (keywords) 작성 규칙:**
- 10~15개의 검색 키워드
- 고객이 실제로 검색할 키워드 위주
- 지역명 + 매물유형 + 특성 조합
- 예: "${dongName}${type}", "${guName} ${deal}", "${dongName} 역세권", "${type} 풀옵션"

**해시태그 (tags) 작성 규칙:**
- 10~15개
- # 포함
- 플랫폼 노출용 해시태그
- 지역 + 매물특성 + 타겟고객 조합

반드시 아래 JSON 형식으로만 응답해주세요:
{
  "title": "SEO 최적화된 매물 제목",
  "description": "SEO 키워드가 자연스럽게 녹아든 매물 설명",
  "keywords": ["키워드1", "키워드2", ...],
  "tags": ["#태그1", "#태그2", ...],
  "meta_description": "검색엔진 메타 설명 (160자 이내, 핵심 키워드 포함)"
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

    // JSON 파싱 시도
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
