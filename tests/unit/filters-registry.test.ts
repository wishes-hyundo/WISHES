/**
 * SSOT Filter Registry 단위 테스트 — PR-A
 * 매핑 표 §3.2 (RFC 0002) 의 30 케이스를 모두 검증.
 */

import { describe, it, expect } from 'vitest';
import {
  FILTER_REGISTRY,
  TYPE_NORMALIZED,
  normalizeType,
  toDbValues,
  type TypeNormalized,
} from '../../src/filters/registry';

describe('PR-A SSOT — TYPE_NORMALIZED enum', () => {
  it('정확히 10 종', () => {
    expect(TYPE_NORMALIZED).toHaveLength(10);
  });
  it('사장님 결단 enum 포함', () => {
    expect(TYPE_NORMALIZED).toContain('토지');
    expect(TYPE_NORMALIZED).toContain('건물');
  });
  it('정상 8 종 보존', () => {
    for (const t of ['원룸','투룸','쓰리룸','아파트','오피스텔','빌라','상가','사무실']) {
      expect(TYPE_NORMALIZED).toContain(t as TypeNormalized);
    }
  });
});

describe('PR-A normalizeType — 매핑 표 §3.2', () => {
  // §3.2 정상 8 passthrough
  it.each([
    ['원룸', '원룸'],
    ['투룸', '투룸'],
    ['쓰리룸', '쓰리룸'],
    ['아파트', '아파트'],
    ['오피스텔', '오피스텔'],
    ['빌라', '빌라'],
    ['상가', '상가'],
    ['사무실', '사무실'],
  ])('정상 passthrough: "%s" → "%s"', (raw, expected) => {
    expect(normalizeType(raw)).toBe(expected);
  });

  // §3.2 신규 2 종 (사장님 결단)
  it.each([
    ['토지', '토지'],
    ['건물', '건물'],
  ])('신규 enum: "%s" → "%s"', (raw, expected) => {
    expect(normalizeType(raw)).toBe(expected);
  });

  // §3.2 사장님 명시: 원룸 계열
  it.each([
    ['오픈형원룸', '원룸'],
    ['분리형원룸', '원룸'],
    ['주방분리형원룸', '원룸'],
    ['분리형원룸(1룸 1거실)', '원룸'],
    ['복층형원룸', '원룸'],
  ])('원룸 계열: "%s" → "%s"', (raw, expected) => {
    expect(normalizeType(raw)).toBe(expected);
  });

  // §3.2 사장님 명시: 아파트 계열
  it.each([
    ['주거용', '아파트'],
    ['주거용, 전입신고가능', '아파트'],
    ['주거용, 사업자등록가능', '아파트'],
  ])('아파트 계열: "%s" → "%s"', (raw, expected) => {
    expect(normalizeType(raw)).toBe(expected);
  });

  // §3.2 사장님 명시: 빌라 계열
  it('빌라 계열: 주택 → 빌라', () => {
    expect(normalizeType('주택')).toBe('빌라');
  });

  // §3.2 사장님 결단: 사무실 계열
  it.each([
    ['사업자등록가능', '사무실'],
    ['지식산업센터', '사무실'],
    ['사무용', '사무실'],
    ['사무용, 사업자등록가능', '사무실'],
    ['주택겸 사무실', '사무실'],
    ['사업자등록가능, 주택겸 사무실', '사무실'],
    ['사무실/상가', '사무실'],
  ])('사무실 계열: "%s" → "%s"', (raw, expected) => {
    expect(normalizeType(raw)).toBe(expected);
  });

  // §3.2 Claude 제안: 상가 계열
  it.each([
    ['이면도로', '상가'],
    ['대로변', '상가'],
  ])('상가 계열: "%s" → "%s"', (raw, expected) => {
    expect(normalizeType(raw)).toBe(expected);
  });

  // §3.2 사장님 결단: NULL + admin 큐
  it.each([
    ['확인필요', null],
    ['전체', null],
    ['전체, 사업자등록가능', null],
  ])('NULL admin 큐: "%s" → null', (raw, expected) => {
    expect(normalizeType(raw)).toBe(expected);
  });

  // 안전 fallback
  it('미지의 신규 type → null', () => {
    expect(normalizeType('미지의신규타입ZZZ')).toBe(null);
  });
  it('빈 문자열 → null', () => {
    expect(normalizeType('')).toBe(null);
  });
  it('null/undefined → null', () => {
    expect(normalizeType(null)).toBe(null);
    expect(normalizeType(undefined)).toBe(null);
  });
  it('공백 trim', () => {
    expect(normalizeType('  원룸  ')).toBe('원룸');
  });
});

describe('PR-A FILTER_REGISTRY.type.toDbValues', () => {
  it('UI 카테고리 "주거" → 6 type_normalized', () => {
    const values = FILTER_REGISTRY.type.toDbValues(['주거']);
    expect(values).toEqual(expect.arrayContaining(['원룸','투룸','쓰리룸','아파트','오피스텔','빌라']));
    expect(values).toHaveLength(6);
  });
  it('UI 카테고리 "토지/건물" → 토지+건물', () => {
    const values = FILTER_REGISTRY.type.toDbValues(['토지/건물']);
    expect(values).toEqual(expect.arrayContaining(['토지','건물']));
  });
  it('정규화 type 직접 입력 → 그대로', () => {
    const values = FILTER_REGISTRY.type.toDbValues(['원룸','투룸']);
    expect(values).toEqual(expect.arrayContaining(['원룸','투룸']));
  });
  it('legacy raw type 입력 → 정규화', () => {
    const values = FILTER_REGISTRY.type.toDbValues(['주거용','오픈형원룸','주택']);
    expect(values).toEqual(expect.arrayContaining(['아파트','원룸','빌라']));
  });
  it('중복 제거', () => {
    const values = FILTER_REGISTRY.type.toDbValues(['주거','원룸']);
    expect(values).toHaveLength(6); // '주거' 가 이미 원룸 포함
  });
  it('NULL 매핑 입력 → 결과 빈 배열 또는 제외', () => {
    const values = FILTER_REGISTRY.type.toDbValues(['확인필요','전체']);
    expect(values).toHaveLength(0);
  });
});

describe('PR-A FILTER_REGISTRY.type.sqlIn', () => {
  it('SQL 빌더 결과 형태', () => {
    const r = FILTER_REGISTRY.type.sqlIn(['원룸','투룸']);
    expect(r.sql).toBe('type_normalized = ANY($1::text[])');
    expect(r.params).toEqual(['원룸','투룸']);
  });
});

describe('PR-A FILTER_REGISTRY.deal/status', () => {
  it('deal enum 3 종', () => {
    expect(FILTER_REGISTRY.deal.enum).toEqual(['월세','전세','매매']);
  });
  it('status enum 3 종 (Discovery §2.5)', () => {
    expect(FILTER_REGISTRY.status.enum).toEqual(['공개','비공개','중복정리']);
  });
  it('status.publicOnly() 일반 사용자 default', () => {
    const r = FILTER_REGISTRY.status.publicOnly();
    expect(r.params).toEqual(['공개']);
  });
});

describe('PR-A Zod schema (통합 검증)', () => {
  it('TYPE_NORMALIZED 외 값 거부', () => {
    expect(() => FILTER_REGISTRY.type.zod.parse('주거용')).toThrow();
    expect(() => FILTER_REGISTRY.type.zod.parse('확인필요')).toThrow();
  });
  it('정규화 type 통과', () => {
    expect(FILTER_REGISTRY.type.zod.parse('원룸')).toBe('원룸');
    expect(FILTER_REGISTRY.type.zod.parse('토지')).toBe('토지');
  });
});
