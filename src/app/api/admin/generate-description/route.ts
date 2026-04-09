import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ★ 재시도 헬퍼: 429/529 에러 시 자동 재시도
async function callAnthropicWithRetry(
    body: object,
    maxRetries = 3
  ): Promise<Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': ANTHROPIC_API_KEY!,
                            'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify(body),
          });

      // 성공 또는 재시도 불가능한 에러
      if (response.ok || (response.status !== 429 && response.status !== 529 && response.status !== 503)) {
              return response;
      }

      // 429/529/503 → 재시도
      if (attempt < maxRetries) {
              const retryAfter = response.headers.get('retry-after');
              const waitMs = retryAfter
                ? Math.min(parseInt(retryAfter, 10) * 1000, 30000)
                        : Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 30000);
              console.log(`[generate-description] Rate limited (${response.status}), retry ${attempt + 1}/${maxRetries} in ${Math.round(waitMs)}ms`);
              await new Promise(resolve => setTimeout(resolve, waitMs));
      } else {
              return response; // 마지막 시도도 실패
      }
    }
    throw new Error('Unreachable');
}

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
      const model = 'claude-sonnet-4-20250514'; // Always use Sonnet (opus disabled for cost)

      // 지역 키워드 추출 (AI에게는 동 이름만 전달, 지번주소 절대 비노출)
      const dongName = dong || '';
          const addressParts = (address || '').split(' ');
          const guName = addressParts.find((p: string) => p.endsWith('구')) || '';
          const cityName = addressParts[0] || '서울';
          // 동 이름만 추출 (번지 제거)
      const dongOnly = addressParts.find((p: string) => p.endsWith('동')) || dongName || '';

      // ★ AI에게 전달하는 정보: 금액/주소/면적/층수는 절대 포함하지 않음
      // 오직 "분위기 파악"에 필요한 정보만 전달
      const contextInfo = [
              `지역: ${guName} ${dongOnly}`,
              `매물유형: ${type || ''}`,
              `거래유형: ${deal || ''}`,
              direction ? `방향: ${direction}` : '',
              rooms ? `방 구조: ${rooms}개` : '',
              features?.length ? `특징: ${features.join(', ')}` : '',
              parking_available ? '주차 가능' : '',
              buildingInfo?.건물명 ? `건물명: ${buildingInfo.건물명}` : '',
              buildingInfo?.사용승인일 ? `준공시기: ${String(buildingInfo.사용승인일).substring(0, 4)}년대` : '',
              buildingInfo?.건물구조 ? `건물구조: ${buildingInfo.건물구조}` : '',
              buildingInfo?.주용도 ? `주용도: ${buildingInfo.주용도}` : '',
              buildingInfo?.승용엘리베이터 ? `엘리베이터: 있음` : '',
            ].filter(Boolean).join('\n');

      // randomSeed로 제목/설명 스타일 다양화
      const randomSeed = Math.floor(Math.random() * 10);
          const titleStyles = [
                  `감성형: 분위기/느낌 중심. 예: "햇살 가득 남향 ${dongOnly} 보금자리", "조용한 골목 안쪽 ${dongOnly} 아늑한 방"`,
                  `타겟형: 추천 대상 중심. 예: "자취 입문자를 위한 ${dongOnly} 역세권 방", "신혼부부 추천 ${dongOnly} 신축 투룸"`,
                  `생활형: 주변 편의 중심. 예: "${dongOnly} 카페골목 바로 옆 깔끔한 방", "공원뷰 산책로 앞 ${dongOnly} 힐링 공간"`,
                  `특장점형: 매물 고유 장점 중심. 예: "풀옵션 완비 ${dongOnly} 바로 입주 가능", "리모델링 완료 ${dongOnly} 깨끗한 방"`,
                  `라이프형: 생활상 상상. 예: "퇴근 후 한강 산책, ${dongOnly} 힐링 원룸", "출근 10분컷 ${dongOnly} 직장인 안식처"`,
                  `감성형: 분위기/느낌 중심. 예: "조용하고 아늑한 ${dongOnly} 나만의 공간", "초록빛 창밖 ${dongOnly} 감성 원룸"`,
                  `타겟형: 추천 대상 중심. 예: "${dongOnly} 대학가 근처 가성비 원룸", "1인 가구 맞춤 ${dongOnly} 풀옵션 방"`,
                  `생활형: 주변 편의 중심. 예: "편의점 30초 ${dongOnly} 생활 편리한 방", "먹자골목 바로 앞 ${dongOnly} 맛집 천국"`,
                  `특장점형: 매물 고유 장점 중심. 예: "채광 끝판왕 ${dongOnly} 남향 원룸", "반려동물 OK ${dongOnly} 펫프렌들리 방"`,
                  `라이프형: 생활상 상상. 예: "주말 브런치 즐기기 좋은 ${dongOnly}", "아침 러닝 후 출근하는 ${dongOnly} 라이프"`
                ];
          const descStyles = [
                  '친근하고 따뜻한 말투 (친구에게 추천하듯)',
                  '전문적이면서 신뢰감 있는 말투 (베테랑 중개사)',
                  '간결하고 팩트 위주 (핵심만 콕콕)',
                  '스토리텔링형 (이 집에서의 하루를 그려주는)',
                  '감성적이면서 세련된 말투 (라이프스타일 매거진)',
                  '활기차고 긍정적인 말투 (설레는 새 출발)',
                  '차분하고 꼼꼼한 분석형 (장단점 솔직 비교)',
                  '유머러스하고 위트있는 말투 (읽는 재미)',
                  '실용적이고 구체적인 말투 (수치와 팩트)',
                  '공감형 (집 구하는 고충을 이해하는)'
                ];
          const selectedTitleStyle = titleStyles[randomSeed];
          const selectedDescStyle = descStyles[randomSeed];

      const prompt = `당신은 서울/경기 현장을 직접 다니며 수백 건의 매물을 봐온 10년차 부동산 전문 중개사입니다.

      ⛔ 절대 금지 사항 (하나라도 위반 시 전체 무효):
      1. 금액 절대 금지: 보증금, 월세, 매매가, "~만원", "~억" 등 금액 관련 숫자/표현 일절 넣지 마세요
      2. 주소 절대 금지: 지번("~번지"), 도로명, 상세주소 절대 넣지 마세요. 동 이름(예: 대치동)까지만 허용
      3. 스펙 수치 절대 금지: 면적(㎡/평), 층수("~층"), 방 개수 등 이미 상세페이지에 있는 숫자 절대 넣지 마세요
      4. 건축물대장 수치 금지: 연면적, 대지면적, 건폐율, 용적률 등 건축물대장 데이터 수치 넣지 마세요
      5. 상투어 금지: "~자랑합니다", "~누릴 수 있습니다", "~우수합니다", "합리적인 조건" 등 광고 상투어 금지

      ✅ 대신 이렇게 써야 합니다:
      - 주변 생활 환경, 교통 편의성, 동네 분위기, 타겟 추천 등 "여기 살면 이런 점이 좋다"에 집중
      - ${dongOnly} 지역의 실제 주변 환경(지하철역, 대학, 공원, 상권, 카페)을 구체적으로 추정해서 작성
      - 매물의 분위기와 느낌을 전달 (숫자가 아닌 감각적 표현)

      [참고 정보 - 분위기 파악용, 이 수치들을 절대 그대로 노출하지 마세요]
      ${contextInfo}

      [제목 작성]
      - 25자 이내
      - 이번 스타일: ${selectedTitleStyle}
      - ⛔ 금액, 층수, 면적 숫자 포함 시 무효
      - ⛔ "월세", "전세", "매매", "보증금" 등 거래유형 단어 포함 시 무효
      - 동 이름 + 분위기/장점 조합으로만 구성

      [설명 작성]
      말투 스타일: ${selectedDescStyle}

      아래 구조를 반드시 따르되, 자연스럽게 작성:

      💬 (한줄 감성 카피 — 이 집에서의 생활을 한 문장으로. "~집", "~공간", "~방" 등으로 마무리)

      ⏱️ 출퇴근 (주요 업무지역 2~3곳 예상 소요시간. 지하철 노선명 포함)

      🏪 도보 생활권 (도보 5분 이내 추정 편의시설. 구체적으로)

      ✅ 추천 포인트 (3가지. 각각 한 줄. ⛔ 면적/층수/금액 수치 절대 불가. 분위기/환경/편의성 중심)

      👤 이런 분께 딱 (구체적 타겟 2~3개)

      추가 지침:
      - 총 350~500자
      - 구조화된 짧은 문장 위주
      - 각 섹션 사이 빈 줄

      [SEO 키워드]
      - 10~15개, 고객이 실제 검색할 키워드
      - "${dongOnly} ${type}", "${guName} ${deal}", "${dongOnly} 역세권" 등

      [해시태그]
      - 10~15개, # 포함

      반드시 아래 JSON으로만 응답:
      {
        "title": "제목 (금액/층수/면적 숫자 절대 불포함)",
          "description": "위 구조대로 작성된 설명 (줄바꿈은 \\n 사용)",
            "keywords": ["키워드1", ...],
              "tags": ["#태그1", ...],
                "meta_description": "검색엔진 메타 설명 (160자 이내, 금액 불포함)"
                }`;

      // ★ 재시도 로직 포함 API 호출
      const response = await callAnthropicWithRetry({
              model,
              max_tokens: 2048,
              messages: [{ role: 'user', content: prompt }],
      });

      if (!response.ok) {
              console.error('[generate-description] API error:', response.status);
              return NextResponse.json(
                { success: false, error: `AI API 오류 (${response.status})` },
                { status: response.status === 429 ? 429 : 500 }
                      );
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
