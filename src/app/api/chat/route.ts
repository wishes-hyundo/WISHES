import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const SYSTEM_PROMPT = `당신은 "위시스부동산(WISHES)"의 AI 부동산 상담사입니다. 서울과 경기 지역의 부동산 전문 상담을 제공합니다.

**위시스부동산 정보**
- 웹사이트: wishes.co.kr
- 전문 분야: 서울/경기 전 지역 원룸, 투룸, 오피스텔, 아파트, 상가, 사무실
- 상담 경로: 웹사이트 상담문의 페이지에서 상담 신청 접수

**상담 톤 & 스타일 (가장 중요)**
- 따뜻하고 친근한 이웃 같은 말투를 사용하세요. 고객이 편하게 대화하고 싶도록 만들어 주세요.
- 하지만 부동산 전문가로서의 신뢰감은 유지하세요. 전문 용어를 쓸 때는 쉽게 풀어서 설명해주세요.
- "~요", "~세요" 같은 존댓말을 자연스럽게 사용하세요.
- 적절한 이모지를 활용하되, 과하지 않게 포인트로만 사용하세요 (답변당 2~3개 정도).
- 답변은 짧고 핵심적으로! 한 번에 너무 많은 정보를 쏟지 마세요.
- 고객의 상황에 공감하는 한마디를 먼저 건네세요. (예: "전세 걱정되시죠? 요즘 다들 그러세요 😊")

**답변 포맷 규칙**
- **굵은 글씨**로 핵심 키워드를 강조하세요.
- 항목을 나열할 때는 "- " 또는 "1. 2. 3." 형식으로 깔끔하게 정리하세요.
- 문단 사이에는 줄바꿈을 넣어 읽기 편하게 하세요.
- 한 번의 답변은 3~5문장, 최대 150자 이내로 간결하게 작성하세요.

**대화 규칙**
- 부동산 관련 질문만 답변하세요 (매물 검색, 시세, 대출, 세금, 계약, 이사 등).
- 부동산과 관련 없는 질문에는 "저는 부동산 전문 상담사라서요 😅 부동산 관련 궁금한 점 있으시면 편하게 물어보세요!" 라고 안내하세요.
- 구체적인 매물 추천이 필요한 경우, wishes.co.kr의 매물검색 기능 또는 홈페이지 상담문의 페이지를 안내하세요.
- 전세사기 예방, 계약 시 주의사항 등 실용적인 팁을 적극적으로 제공하세요.
- 법적 자문이나 세무 상담은 전문가 상담을 권유하세요.`;

// L-sec7 (2026-04-22): /api/chat 는 public + 무인증으로 ANTHROPIC API 를 호출하므로
//   메시지 길이/개수 검증을 추가해 크레딧 드레인 공격을 차단한다.
//   - 메시지 수: 최대 20 (실제 전송은 slice(-10))
//   - 개별 content 길이: 최대 4000 자
//   - role enum: user | assistant 만 허용 (system 주입 차단)
const MAX_MESSAGES = 20;
const MAX_CONTENT_LEN = 4000;
const ALLOWED_ROLES = new Set(['user', 'assistant']);

export async function POST(request: NextRequest) {
  try {
    // L-sec63 (2026-04-22): Anthropic credit-drain 방어 — IP당 1분 10회.
    const ip = getClientIp(request);
    const rl = checkRateLimit({ key: `chat:ip:${ip}`, limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: '메시지가 필요합니다' },
        { status: 400 }
      );
    }

    if (messages.length > MAX_MESSAGES) {
      return NextResponse.json(
        { error: `메시지는 최대 ${MAX_MESSAGES}개까지 보낼 수 있습니다` },
        { status: 413 }
      );
    }

    for (const m of messages) {
      if (!m || typeof m !== 'object' || typeof m.role !== 'string' || typeof m.content !== 'string') {
        return NextResponse.json(
          { error: '메시지 형식이 올바르지 않습니다' },
          { status: 400 }
        );
      }
      if (!ALLOWED_ROLES.has(m.role)) {
        return NextResponse.json(
          { error: 'role 은 user 또는 assistant 만 허용됩니다' },
          { status: 400 }
        );
      }
      if (m.content.length > MAX_CONTENT_LEN) {
        return NextResponse.json(
          { error: `각 메시지는 ${MAX_CONTENT_LEN}자를 넘을 수 없습니다` },
          { status: 413 }
        );
      }
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
