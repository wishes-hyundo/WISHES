import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/adminAuth';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 제목 후처리 (v2.7): AI 가 상투어·동명 리드를 뚫고 나오는 경우에 대한 방어선
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 금지 어휘 — 공백 기반 삭제. 정규식으로 일괄 치환.
const BANNED_TITLE_PATTERNS: RegExp[] = [
  /따뜻한\s*/g, /따스한\s*/g, /포근한\s*/g, /아늑한\s*/g,
  /역세권\s*/g,
  /편의점\s*30\s*초\s*/g, /편의점\s*코앞\s*/g, /편의점\s*골목\s*/g,
  /대학가\s*중심\s*/g, /대학가\s*한복판\s*/g,
  /의\s*정석/g, /끝판왕/g, /천국/g,
  /생활\s*편리한\s*방/g, /생활의\s*정석/g,
  /혼자만의\s*공간/g, /나만의\s*아지트/g,
  /가성비/g,
  // 추가 AI-슬로건 차단 (v2.7.1)
  /힐링\s*공간/g, /힐링\s*원룸/g,
  /감성\s*원룸/g, /감성\s*살아있는/g, /감성\s*가득/g,
  /보금자리/g,
  /설레는\s*새\s*출발/g,
  /완벽한\s*일상/g, /완벽한\s*주거/g,
  /라이프\s*그\s*자체/g, /그\s*자체/g,
  /특별한\s*하루/g,
  /!!+/g, /♡/g, /★/g, /☆/g,
];

function scrubTitle(raw: string, dongOnly: string, allowDongLead: boolean): string {
  if (!raw) return '';
  let t = String(raw).trim();

  // 1) 금지 어휘 제거
  for (const p of BANNED_TITLE_PATTERNS) t = t.replace(p, '');

  // 2) 동명 리드 제거 (허용 스타일이 아닐 때)
  if (!allowDongLead && dongOnly) {
    // "신림동 …" 또는 "신림동,…" 으로 시작하면 앞부분 제거
    const dongLead = new RegExp('^\\s*' + dongOnly + '[\\s,]+');
    t = t.replace(dongLead, '');
    // 중간의 "… 신림동 …" 도 한 번만 제거 (다른 매물도 이 기능을 공유하는 동네 단어 누적 방지)
    const dongMid = new RegExp('\\s*' + dongOnly + '\\s*', 'g');
    // 단, 동명 허용 스타일이 아니면 기본적으로 제거
    t = t.replace(dongMid, ' ');
  }

  // 3) 중복 공백, 선두/말미 구두점 정리
  t = t.replace(/\s+/g, ' ')
       .replace(/^[\s,·\-—]+/, '')
       .replace(/[\s,·\-—]+$/, '')
       .trim();

  // 4) 너무 짧아지면 호출자가 폴백 처리
  return t;
}

function buildFallbackTitle(input: {
  type?: string; direction?: string; rooms?: number; floor_current?: string;
  parking_available?: boolean; features?: string[]; buildingInfo?: any;
}): string {
  const parts: string[] = [];
  // 건물명 우선
  const bname = String(input?.buildingInfo?.건물명 || '').trim();
  if (bname && !/^(지하|\d+호|\d+동)/.test(bname)) parts.push(bname);
  // 방향 + 유형
  const seg: string[] = [];
  if (input.direction) seg.push(`${input.direction}향`);
  if (input.rooms && input.rooms >= 2) seg.push(`${input.rooms}룸`);
  if (input.type) seg.push(input.type);
  if (seg.length) parts.push(seg.join(' '));
  // 훅
  const hooks: string[] = [];
  if (input.parking_available) hooks.push('주차');
  const fs = Array.isArray(input.features) ? input.features : [];
  if (fs.length >= 6) hooks.push('옵션완비');
  if (hooks.length) parts.push('· ' + hooks.join(' · '));
  const out = parts.filter(Boolean).join(' — ').trim();
  return out || '매물';
}

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
          // L-sec3 (2026-04-22): 인증 미보호 → verifyAdminAuth 추가 (Anthropic API 비용 보호)
          if (!(await verifyAdminAuth(req))) {
                  return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
          }
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
      const model = 'claude-haiku-4-5-20251001'; // Haiku for cost efficiency

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

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // randomSeed로 제목/설명 스타일 다양화 (v2.7 — 단조 패턴 탈피)
      // 사용자 피드백 (2026-04): "봉천동 신림동 이런식으로 계속 동이 들어간다",
      //                        "제목이 다양성이 하나도 없네"
      // → 동명 강제 포함 중단. 시작 어형·각도·어휘를 20종으로 분산.
      //   '따뜻한 / 대학가 / 역세권 / 편의점 30초 / 아늑한' 등 상투어 금지 사전 박제.
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const randomSeed = Math.floor(Math.random() * 20);
          const titleStyles = [
                  // 0) 건물명 리드 — 동명 불필요
                  `건물명을 앞에 놓고 한 줄로 짧게. 예: "라온스테이 남동향 투룸", "한빛빌 오피스텔, 리모델링 방금"`,
                  // 1) 타겟 직격 — "이런 분한테" 톤
                  `누가 살기 좋은지 툭 던지듯. 예: "1인 직장인 퇴근 후 쉬기 딱", "신혼부부 첫 집 후보"`,
                  // 2) 강점 선두 — 한 단어로 "훅"
                  `매물의 가장 강한 장점 한 단어로 시작. 예: "남향 통창 — 오후까지 해 들어옴", "리모델링 끝난지 한 달"`,
                  // 3) 교통 리드 — 역·노선 명시
                  `역·노선을 맨 앞에. "역세권" 대신 실제 역명/분. 예: "2호선 도보 3분 투룸", "강남역 환승 라인 오피스텔"`,
                  // 4) 라이프스타일 — 동선 묘사
                  `거주자의 구체적인 하루 동선. 예: "퇴근 후 공원 산책 가능한 라인", "아침 러닝 후 출근"`,
                  // 5) 감각·분위기 — 조용함/채광 등 체감
                  `조용함/채광/바람 같은 체감. 상투어 말고 구체. 예: "골목 안쪽이라 차 소리 없음", "오후에 해 잘 드는 남동향"`,
                  // 6) 대비 — 두 요소 붙이기
                  `두 요소를 짧게 붙여 대비. 예: "중심가인데 안쪽이라 조용", "출근 10분 / 주말 여유"`,
                  // 7) 옵션 나열 — feature 기반
                  `실옵션 2~3개만 간결하게. 예: "풀옵션·주차·엘베", "드럼세탁기·인덕션·에어컨 다 있음"`,
                  // 8) 연식·상태 — 신축·리모델링·준공년도
                  `상태를 있는 그대로. 예: "2023년 준공 신축", "작년 리모델링 끝낸 컨디션"`,
                  // 9) 방 구조 — 분리형/복층/베란다
                  `평면 특성 한 줄. 예: "분리형 투룸 — 침실 따로", "복층 오피스텔 — 위층 업무공간"`,
                  // 10) 출퇴근 매칭 — 업무지역 기준
                  `주요 업무지역 접근성. 예: "여의도 출근 30분 라인", "테헤란로 근무자용"`,
                  // 11) 조망 — 창 밖 풍경
                  `창 밖 묘사로 구체적으로. 예: "9층 시티뷰 투룸", "공원 정면뷰 남향"`,
                  // 12) 컨셉 해시태그 — 한 번만
                  `해시태그 1개 + 한줄. 예: "#혼자살기좋은집 심플 원룸", "#커플첫집 분리형 투룸"`,
                  // 13) 실속형 — 금액 단어 금지
                  `조건 대비 실속을 "알짜·실속" 수준으로. 예: "알짜 조건 투룸, 교통까지", "실속 원룸 — 조용한 라인"`,
                  // 14) 랜드마크 — 고유명 허용 (동명 허용)
                  `구체 랜드마크를 넣어도 됨. 예: "낙성대공원 도보권 조용 라인", "서울대입구역 라인 깔끔 원룸"`,
                  // 15) 입주 타이밍 — 즉시/협의
                  `입주 가능 시점을 앞에. 예: "즉시입주 가능 — 짐만 들고", "다음 달 입주 협의 투룸"`,
                  // 16) 허용 조건 — 반려동물·장기
                  `반려동물/장기거주 허용 여부. 예: "반려견 OK — 1층 테라스", "장기 거주 환영 조용 라인"`,
                  // 17) 구조 분위기 — 숫자 없이 방감
                  `"넉넉한/분리형/심플" 같은 체감어. 예: "넉넉한 투룸, 수납 분리", "심플 원룸, 혼자살기"`,
                  // 18) 홈오피스 — 재택 적합
                  `재택·업무공간 확보 각도. 예: "재택 전용 분리 업무공간", "홈오피스 OK 투룸 구조"`,
                  // 19) 감성 지역형 — 동명 허용
                  `동명을 자연스럽게. 예: "${dongOnly || '동네'} 안쪽 골목 조용한 라인", "${dongOnly || '동네'} 구석, 아는 사람만 아는 위치"`,
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
          const selectedTitleStyle = titleStyles[randomSeed % titleStyles.length];
          const selectedDescStyle = descStyles[Math.floor(Math.random() * descStyles.length)];

      const prompt = `당신은 서울/경기 현장을 직접 다니며 수백 건의 매물을 봐온 10년차 부동산 전문 중개사입니다.
      오늘 이 매물을 직접 보고 나와서, 단골 손님에게 카톡으로 짧게 알려주듯 써주세요.

      🎯 최우선 지침 — "사람냄새" (★ 이것이 다른 모든 지침보다 우선):
      1. 당신이 쓰는 제목은 "AI가 만든 제목" 처럼 보이면 안 됩니다.
         → "정석", "끝판왕", "힐링 공간", "감성 원룸", "나만의 공간" 같은 SEO 슬로건 금지.
         → 부동산 광고지·블로그 상투어 금지.
      2. 동일한 템플릿 두 번 쓰지 마세요. 같은 지역/조건 매물이라도 완전히 다른 각도로.
      3. 문장의 "시작 단어"가 매번 달라야 합니다.
         (어떤 때는 상태어 "리모델링", 어떤 때는 역명 "2호선", 어떤 때는 타겟 "1인 직장인",
          어떤 때는 건물명 "라온스테이", 어떤 때는 구조어 "분리형" …)
      4. 실제 사람이 "아, 이집은…" 하고 말문을 여는 느낌.
         예) "2호선 3분, 짐 풀면 바로 출근"  /  "분리형 투룸 — 업무공간 확보 되는 구조"
              "리모델링 방금 끝난 매물"     /  "라온스테이 남동향 오피스텔"
              "즉시입주 OK, 주차 2대까지"    /  "재택근무자 시선 끄는 구조"
         NG) "따뜻한 봉천동 혼자만의 공간"  /  "신림동 대학가 중심, 편의점 골목 생활의 정석"
              → 이건 AI가 쓴 티가 너무 남.
      5. 과한 수사·감탄사(!!, ♡, ★) 금지. 깔끔한 구어체만.

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
      - 22자 이내 (공백 포함)
      - 이번 스타일: ${selectedTitleStyle}
      - ⛔ 금액, 층수, 면적 숫자 포함 시 무효
      - ⛔ "월세", "전세", "매매", "보증금" 등 거래유형 단어 포함 시 무효

      🚫 금지 어휘 (완전 박제 — 절대 사용 금지):
         "따뜻한", "따스한", "포근한", "아늑한",
         "역세권" (단, 실제 역명+분 단위로 대체 예: "2호선 3분"),
         "편의점 30초", "편의점 코앞", "편의점 골목",
         "대학가 중심", "대학가 한복판",
         "~의 정석", "~끝판왕", "~천국",
         "생활 편리한 방", "생활의 정석",
         "혼자만의 공간", "나만의 아지트" (과사용 방지),
         "가성비" (대신 "실속", "알짜", "조건 좋은")
         — 위 표현이 한 단어라도 들어가면 무효.

      📌 동명(${dongOnly}) 포함 규칙 (★ 매우 중요):
         - 이번 스타일이 "감성 지역형 (동명 허용)" 또는 "랜드마크형" 인 경우에만 동명을 써도 됨.
         - 그 외 스타일에서는 동명(${dongOnly})을 ★제목에 절대 넣지 말 것★ — 넣으면 무효.
         - 대신 건물명, 역명, 업무지역명, 매물 특성 등을 선두에 배치.

      📐 시작 어형 규칙:
         - 매 제목은 서로 다른 첫 단어 유형으로 시작해야 함.
           (건물명 / 타겟(1인·커플) / 옵션(풀옵션·리모델링) / 역·노선 / 뷰 / 컨셉(#) / 구조(분리형·복층) / 해시태그 / 숫자 없는 상태어 중)
         - "${dongOnly} 으로 시작" 금지 (위 허용 스타일 제외).

      ✏️ 형식:
         - 감성형·타겟형은 자연스러운 구어체 한 문장
         - 특장점·옵션형은 "—"(em-dash) 또는 "·" 로 2~3요소를 나열
         - 컨셉형은 "#" 한 개까지 허용

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

      // JSON 파싱 + 제목 후처리 (상투어·동명 리드 스크러빙)
      try {
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        // ★ 제목 방어선: AI 가 상투어/동명 리드를 뚫고 나왔을 때 최종 정리
                        //   허용 스타일(19번 "감성 지역형" / 14번 "랜드마크형") 일 때만 동명 리드 허용
                        const allowDongLead = randomSeed === 19 || randomSeed === 14;
                        let finalTitle = scrubTitle(parsed.title || '', dongOnly, allowDongLead);
                        if (!finalTitle || finalTitle.length < 5) {
                                 finalTitle = buildFallbackTitle({
                                     type, direction, rooms, floor_current,
                                     parking_available, features, buildingInfo,
                                 });
                        }
                        if (finalTitle.length > 28) finalTitle = finalTitle.slice(0, 27) + '…';

                        return NextResponse.json({
                                    success: true,
                                    title: finalTitle,
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
