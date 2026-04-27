// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// externalContact — 외부 연결 (카톡 채널 / 네이버 예약 / 전화) 단일 진입점
//
// L-naver-2026contact1 (2026-04-27): 담당자 모달 3개 액션 BoB 통합.
//   · 카톡 문의: pf.kakao.com/{channelId}/chat — 모바일=앱 딥링크, PC=웹채팅
//   · 방문 예약: booking.naver.com/booking/6/bizes/{bizId} — 네이버 예약 직링크
//   · 전화: tel: 스킴 — 모바일에서 즉시 전화 앱 실행
//
// L-naver-2026contact2 (2026-04-27): hardcoded 위시스부동산 default — env 미설정
//   환경(Vercel build 등)에서도 즉시 동작. env 설정 시 그것이 우선.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 위시스부동산 카카오 채널 (default — env override 가능)
const DEFAULT_KAKAO_CHANNEL = 'https://pf.kakao.com/_DxdSJs';

// 위시스부동산 네이버 예약 (default — env override 가능)
const DEFAULT_NAVER_BOOKING = 'https://booking.naver.com/booking/6/bizes/798626';

/**
 * 카카오톡 채널 chat URL.
 *   ENV: NEXT_PUBLIC_KAKAO_CHANNEL=https://pf.kakao.com/_xxxxx (옵셔널)
 *   chat 진입은 항상 /chat suffix 부착.
 */
export function getKakaoChannelChatUrl(): string {
  const base = process.env.NEXT_PUBLIC_KAKAO_CHANNEL || DEFAULT_KAKAO_CHANNEL;
  const clean = base.replace(/\/+$/, '');
  return `${clean}/chat`;
}

/**
 * 네이버 예약 URL.
 *   ENV: NEXT_PUBLIC_NAVER_BOOKING_URL (옵셔널)
 */
export function getNaverBookingUrl(): string {
  return process.env.NEXT_PUBLIC_NAVER_BOOKING_URL || DEFAULT_NAVER_BOOKING;
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
 *   항상 true 반환 (default fallback 보장).
 */
export function openKakaoChannelChat(): boolean {
  if (typeof window === 'undefined') return false;
  const url = getKakaoChannelChatUrl();
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * 네이버 예약 페이지 열기.
 */
export function openNaverBooking(): boolean {
  if (typeof window === 'undefined') return false;
  window.open(getNaverBookingUrl(), '_blank', 'noopener,noreferrer');
  return true;
}
