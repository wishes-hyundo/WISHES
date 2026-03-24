// ââââââââââââââââââââââââââââââââââââââââ
// ì í¸ë¦¬í° í¨ì
// ââââââââââââââââââââââââââââââââââââââââ

import { clsx, type ClassValue } from 'clsx';
import type { DealType, FormattedPrice } from '@/types';

// Tailwind í´ëì¤ ë³í©
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// ê°ê²© í¬ë§·í (ë§ì â ìµ/ë§ì)
export function formatPrice(amount: number): string {
  if (amount >= 10000) {
    const uk = Math.floor(amount / 10000);
    const man = amount % 10000;
    return man > 0 ? `${uk}ìµ ${man.toLocaleString()}ë§` : `${uk}ìµ`;
  }
  return `${amount.toLocaleString()}ë§`;
}

// ê±°ë ì íë³ ê°ê²© íì
export function getFormattedPrice(
  deal: DealType,
  deposit: number,
  monthly: number | null,
  price: number | null,
): FormattedPrice {
  switch (deal) {
    case 'ì ì¸':
      return {
        label: 'ì ì¸',
        main: formatPrice(deposit),
      };
    case 'ìì¸':
      return {
        label: 'ìì¸',
        main: `${formatPrice(deposit)} / ${monthly?.toLocaleString() ?? 0}ë§`,
      };
    case 'ë§ ë§¤':
      return {
        label: 'ë§¤ë§¤',
        main: formatPrice(price ?? 0),
      };
  }
}

// ë©´ì  ë³í (ã¡ â í)
export function sqmToPyeong(sqm: number): string {
  return (sqm * 0.3025).toFixed(1);
}

// ê±°ë ì íë³ ë°°ì§ ìì
export function getDealColor(deal: DealType): string {
  switch (deal) {
    case 'ì ì¸': return 'bg-blue-500 text-white';
    case 'ìì¸': return 'bg-emerald-500 text-white';
    case 'ë§¤ë§¤': return 'bg-orange-500 text-white';
  }
}

// ìí ë°°ì§ ìì
export function getStatusColor(status: string): string {
  switch (status) {
    case 'ê°ì©': return 'bg-green-100 text-green-800';
    case 'ê³ì½ì¤': return 'bg-yellow-100 text-yellow-800';
    case 'ê³ì½ìë£': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

// ì íë²í¸ í¬ë§·
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

// ë ì§ í¬ë§· (ìë ìê°)
export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'ì¤ë';
  if (diffDays === 1) return 'ì´ì ';
  if (diffDays < 7) return `${diffDays}ì¼ ì `;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}ì£¼ ì `;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}ê°ì ì `;
  return `${Math.floor(diffDays / 365)}ë ì `;
}
