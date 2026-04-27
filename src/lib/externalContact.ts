// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// externalContact — 외부 연결 (카톡 채널 / 네이버 예약 / 전화) 단일 진입점
//
// L-naver-2026contact1 (2026-04-27): 담당자 모달 3개 액션 BoB 통합.
//   · 카톡 문의: pf.kakao.com/{channelId}/chat — 모바일=앱 딥링크, PC=웹채팅
//   · 방문 예약: booking.naver.com/booking/6/bizes/{bizId} — 네이버 예약 직링크
//   · 전화: tel: 스킴 — 모바일에서 즉시 전화 앱 실행
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 카카오톡 채널 URL (env 또는 폴백).
 *   ENV: NEXT_PUBLIC_KAKAO_CHANNEL=https://pf.kakao.com/_xxxxx
 *   chat 진입은 항상 /chat suffix 추가.
 */
export function getKakaoChannelChatUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_KAKAO_CHANNEL;
  if (!base) return null;
  // 끝의 / 제거 후 /chat 부착
  const clean = base.replace(/\/+$/, '');
  return `${clean}/chat`;
}

/**
 * 네이버 예약 (위시스부동산).
 *   biz 798626 — 환경변수로 오버라이드 가능.
 */
export function getNaverBookingUrl(): string {
  const override = process.env.NEXT_PUBLIC_NAVER_BOOKING_URL;
  if (override) return override;
  return 'https://booking.naver.com/booking/6/bizes/798626';
}

/**
 * 전화 tel: URI 생성 (하이픈/공백 제거).
 */
export function getTelHref(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const cleaned = String(phone).replace(/[^0-9+]/g, '');
  return cleaned ? `tel:${cleaned}` : undefined;
}

/**
 * 카카오톡 채널 채팅 열기.
 *   모바일: KakaoTalk 앱 자동 딥링크
 *   PC: 새 창에 웹 채팅 페이지
 *   설정 안 된 경우: false 반환 (호출 측에서 폴백 처리)
 */
export function openKakaoChannelChat(): boolean {
  const url = getKakaoChannelChatUrl();
  if (!url) return false;
  if (typeof window === 'undefined') return false;
  // _blank + noopener: 보안 + 브라우저 백버튼 보존
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * 네이버 예약 페이지 열기.
 */
export function openNaverBooking(): boolean {
  const url = getNaverBookingUrl();
  if (typeof window === 'undefined') return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
