import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `당신은 "위시스부동산(WISHES)" 전문 AI 상담사입니다. 서울·경기 지역 종합부동산 중개법인의 공식 AI 어시스턴트로서, 고객과 중개업자 모두에게 전문적이고 친근하게 응대합니다.

## 기본 정보
- 회사명: 주식회사 위시스 (WISHES Corp.)
- 사업자등록번호: 445-86-01981
- 위치: 서울특별시 관악구 신림로64길 23, 8층
- 웹사이트: wishes.co.kr
- 서비스 지역: 서울 및 경기 전 지역

## 취급 매물 유형
원룸, 투룸, 쓰리룸+, 오피스텔, 아파트, 상가, 사무실

## 거래 유형
전세, 월세, 매매

## 응대 원칙
1. **전문성**: 부동산 관련 법률, 세금, 대출, 시세 등에 대해 정확한 정보를 제공합니다.
2. **친근함**: 존댓말을 사용하되 딱딱하지 않게, 편안한 상담 분위기를 만듭니다.
3. **실용성**: 고객의 질문에 구체적이고 실행 가능한 답변을 합니다.
4. **안내**: 매물 검색, 상담 신청, 방문 예약 등 사이트 기능을 적극 안내합니다.

## 주요 상담 영역
- 매물 추천 및 검색 안내
- 전세/월세/매매 시세 정보
- 부동산 거래 절차 안내 (계약서 작성, 잔금, 이사 등)
- 주택담보대출, 전세자금대출 기본 안내
- 취득세, 양도세 등 부동산 세금 기초 안내
- 임대차보호법, 전세사기 예방 등 법률 상식
- 인테리어, 이사 관련 팁
- 지역 정보 (학군, 교통, 생활 인프라)

## 응답 규칙
- 한국어로 응답합니다.
- 법률/세금 관련 답변 시 "정확한 사항은 전문가 상담을 권장합니다"를 덧붙입니다.
- 구체적인 매물 상담이 필요한 경우 "상담문의 페이지에서 신청해주세요"를 안내합니다.
- 답변은 간결하되 핵심을 담아 3~5문장 이내로 합니다.
- 이모지를 적절히 활용하여 친근감을 줍니다.
`;

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: '메시지가 필요합니다' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // API 키가 없으면 기본 응답
      return NextResponse.json({
        role: 'assistant',
        content: getDefaultResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: messages.slice(-10).map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API 오류:', errorData);
      return NextResponse.json({
        role: 'assistant',
        content: getDefaultResponse(messages[messages.length - 1]?.content || ''),
      });
    }

    const data = await response.json();
    const assistantMessage = data.content?.[0]?.text || '죄송합니다. 잠시 후 다시 시도해주세요.';

    return NextResponse.json({
      role: 'assistant',
      content: assistantMessage,
    });
  } catch (error) {
    console.error('챗봇 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

/**
 * API 키가 없을 때 기본 응답 생성
 */
function getDefaultResponse(userMessage: string): string {
  const msg = userMessage.toLowerCase();

  if (msg.includes('전세') || msg.includes('월세') || msg.includes('매매')) {
    return '🏠 매물 검색은 상단 메뉴의 "매물검색" 또는 "지도검색"에서 원하시는 조건으로 찾아보실 수 있습니다. 구체적인 매물 상담이 필요하시면 상담문의 페이지에서 신청해주세요!';
  }
  if (msg.includes('대출') || msg.includes('담보') || msg.includes('이자')) {
    return '💰 대출 관련 기본 시뮬레이션은 상단 메뉴의 "대출계산기"에서 확인하실 수 있습니다. 정확한 대출 한도와 금리는 은행별로 다르므로, 여러 은행에 문의해보시는 것을 권장합니다.';
  }
  if (msg.includes('세금') || msg.includes('취득세') || msg.includes('양도세')) {
    return '📋 부동산 세금은 거래 유형과 보유 기간, 주택 수에 따라 달라집니다. 대략적인 세금 계산은 국세청 홈택스에서 확인하실 수 있으며, 정확한 사항은 세무사 상담을 권장합니다.';
  }
  if (msg.includes('계약') || msg.includes('절차')) {
    return '📝 부동산 거래 기본 절차: ①매물확인 → ②가계약금 → ③계약서작성 → ④중도금 → ⑤잔금/이전등기입니다. 각 단계별 자세한 안내가 필요하시면 상담문의를 남겨주세요!';
  }
  if (msg.includes('전세사기') || msg.includes('보호')) {
    return '🔒 전세사기 예방 체크리스트: ①등기부등본 확인 ②선순위 권리 확인 ③전세보증보험 가입 ④공인중개사 자격 확인이 필수입니다. 위시스부동산은 안전한 거래를 위해 항상 최선을 다합니다!';
  }
  if (msg.includes('위치') || msg.includes('주소') || msg.includes('어디')) {
    return '📍 위시스부동산은 서울특별시 관악구 신림로64길 23, 8층에 위치해 있습니다. 방문 상담도 환영합니다! 상담문의 페이지에서 예약해주세요.';
  }
  if (msg.includes('안녕') || msg.includes('하이') || msg.includes('반가')) {
    return '안녕하세요! 😊 위시스부동산 AI 상담사입니다. 서울·경기 지역 부동산에 대해 궁금한 점이 있으시면 편하게 물어봐주세요! 매물 검색, 시세, 대출, 세금, 계약 절차 등 다양한 상담이 가능합니다.';
  }

  return '안녕하세요! 😊 위시스부동산 AI 상담사입니다. 부동산 관련 궁금한 점을 물어봐주세요! 매물검색, 시세정보, 대출안내, 세금상담, 계약절차 등 다양한 상담이 가능합니다. 구체적인 매물 상담은 상담문의 페이지에서 신청하실 수 있습니다.';
}
