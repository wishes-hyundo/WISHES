import { describe, it, expect } from 'vitest';
import { normalizePhone } from './normalizePhone';

describe('normalizePhone', () => {
  describe('mobile 010/011/016~019', () => {
    it('formats raw 11 digits with 010', () => {
      expect(normalizePhone('01012345678')).toBe('010-1234-5678');
    });
    it('strips spaces and re-formats', () => {
      expect(normalizePhone('010 1234 5678')).toBe('010-1234-5678');
    });
    it('strips parentheses and dots', () => {
      expect(normalizePhone('(010).1234.5678')).toBe('010-1234-5678');
    });
    it('handles 011', () => {
      expect(normalizePhone('01112345678')).toBe('011-1234-5678');
    });
    it('handles 019', () => {
      expect(normalizePhone('01912345678')).toBe('019-1234-5678');
    });
    it('rejects 012/013/014/015 (no formatting, returns sanitized)', () => {
      // 012 is not a valid prefix → returns trimmed input
      expect(normalizePhone('01212345678')).toBe('01212345678');
    });
  });

  describe('인터넷전화 070', () => {
    it('formats 070', () => {
      expect(normalizePhone('07012345678')).toBe('070-1234-5678');
    });
    it('formats 070 with hyphens', () => {
      expect(normalizePhone('070-1234-5678')).toBe('070-1234-5678');
    });
  });

  describe('서울 02', () => {
    it('formats 10-digit 02 (modern)', () => {
      expect(normalizePhone('0234567890')).toBe('02-3456-7890');
    });
    it('formats 9-digit 02 (legacy)', () => {
      expect(normalizePhone('023456789')).toBe('02-345-6789');
    });
    it('strips hyphens then re-formats', () => {
      expect(normalizePhone('02-3456-7890')).toBe('02-3456-7890');
    });
  });

  describe('지방 광역 0XX', () => {
    it('formats 11-digit 031', () => {
      expect(normalizePhone('03112345678')).toBe('031-1234-5678');
    });
    it('formats 11-digit 051', () => {
      expect(normalizePhone('05112345678')).toBe('051-1234-5678');
    });
    it('formats 11-digit 064', () => {
      expect(normalizePhone('06412345678')).toBe('064-1234-5678');
    });
    it('formats 10-digit legacy 031', () => {
      expect(normalizePhone('0311234567')).toBe('031-123-4567');
    });
    it('rejects invalid area code 030 (returns sanitized input)', () => {
      expect(normalizePhone('03012345678')).toBe('03012345678');
    });
  });

  describe('전국대표번호 (15XX/16XX/18XX)', () => {
    it('formats 1588-XXXX', () => {
      expect(normalizePhone('15881234')).toBe('1588-1234');
    });
    it('formats 1644-XXXX', () => {
      expect(normalizePhone('16441234')).toBe('1644-1234');
    });
    it('formats 1899-XXXX', () => {
      expect(normalizePhone('18991234')).toBe('1899-1234');
    });
    it('does not format 17XX (not commonly used)', () => {
      expect(normalizePhone('17881234')).toBe('17881234');
    });
  });

  describe('안심번호 050X', () => {
    it('formats 12-digit 0505', () => {
      expect(normalizePhone('050512345678')).toBe('0505-1234-5678');
    });
    it('formats 12-digit 0507', () => {
      expect(normalizePhone('050712345678')).toBe('0507-1234-5678');
    });
  });

  describe('edge cases', () => {
    it('handles null/undefined → empty string', () => {
      expect(normalizePhone(null)).toBe('');
      expect(normalizePhone(undefined)).toBe('');
    });
    it('handles empty string', () => {
      expect(normalizePhone('')).toBe('');
    });
    it('returns trimmed input when no digits', () => {
      expect(normalizePhone('  abc ')).toBe('abc');
    });
    it('returns sanitized input for unmatched length (e.g., 7 digits)', () => {
      expect(normalizePhone('1234567')).toBe('1234567');
    });
    it('strips leading/trailing whitespace', () => {
      expect(normalizePhone('  01012345678  ')).toBe('010-1234-5678');
    });
    it('handles unicode/full-width digits as non-digit (stripped)', () => {
      // 전각숫자 ０１０... → \D 매칭, 모두 제거됨 → 공백·기호 정리만 남음
      const result = normalizePhone('０１０１２３４５６７８');
      // 결과는 공백 제거된 원본. 조건: len(digits)=0 → input.trim() 반환
      expect(result).toBe('０１０１２３４５６７８');
    });
  });
});
