// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 유틸리티 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { clsx, type ClassValue } from 'clsx';
import type { DealType, FormattedPrice } from '@/types';

// Tailwind 클래스 병합
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// 가격 포맷팅 (만원 → 억/만원)
export function formatPrice(amount: number): string {
  if (amount >= 10000) {
    const uk = Math.floor(amount / 10000);
    const man = amount % 10000;
    return man > 0 ? `${uk}억 ${man.toLocaleString('ko-KR')}만` : `${uk}억`;
  }
  return `${amount.toLocaleString('ko-KR')}만`;
}

// 거래 유형별 가격 표시
export function getFormattedPrice(
  deal: DealType,
  deposit: number,
  monthly: number | null,
  price: number | null,
): FormattedPrice {
  switch (deal) {
    case '전세':
      return {
        label: '전세',
        main: formatPrice(deposit),
      };
    case '월세':
      return {
        label: '월세',
        main: `${formatPrice(deposit)} / ${monthly?.toLocaleString('ko-KR') ?? 0}만`,
      };
    case '매매':
      return {
        label: '매매',
        main: formatPrice(price ?? 0),
      };
  }
}

// 면적 변환 (㎡ → 평)
export function sqmToPyeong(sqm: number): string {
  return (sqm * 0.3025).toFixed(1);
}

// 거래 유형별 배지 색상
export function getDealColor(deal: DealType): string {
  switch (deal) {
    case '전세': return 'bg-blue-500 text-white';
    case '월세': return 'bg-emerald-500 text-white';
    case '매매': return 'bg-orange-500 text-white';
  }
}

// 상태 배지 색상
export function getStatusColor(status: string): string {
  switch (status) {
    case '가용': return 'bg-green-100 text-green-800';
    case '계약중': return 'bg-yellow-100 text-yellow-800';
    case '계약완료': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

// 전화번호 포맷
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

// 날짜 포맷 (상대 시간)
export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}개월 전`;
  return `${Math.floor(diffDays / 365)}년 전`;
}
