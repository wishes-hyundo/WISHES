// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-E (RFC 0001) 베이스라인 단위 테스트 — §125 단계 2
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 목적: PR-G (5 trigger 등록) 후 결과가 바뀌면 즉시 빨간불.
//   기존 pure function 들의 "현재 동작" 을 결정적 입력→출력으로 박는다.
//
// 단계 2 (이번): formatFloorNumber / formatFloorWithTotal sanity 캡처
// 단계 4 (예정): 사회초년생/신혼부부/사업자 50 케이스 (Golden 50)
// 단계 5 (예정): SQL Oracle (API ID 집합 vs 직접 SQL ID 집합 차집합 0)
// 단계 6 (예정): DOM Snapshot 4 페이지 (/, /map, /listings/[id], /about)
//
// 헌법 적용:
//   §96 Two-Phase Doctrine — Phase 1 = 새 기능 0
//   §100 UI 헌법 — 컴포넌트 / 페이지 / 라우트 변경 0 (테스트 파일만)
//   §101 데이터/코드 보존 5 원칙 — 추가 X, 정리·연결·통합·보강만
//   §102 11 줄 자기검증 — RFC 0001 §0 참조
//   §125 PR-E 작업 명세 8 단계 — 본 테스트는 단계 2

import { describe, it, expect } from 'vitest';
import {
  formatFloorNumber,
  formatFloorWithTotal,
} from '@/lib/formatFloor';

// ──────────────────────────────────────────
// formatFloorNumber — 단일 층수 한국어 변환
// ──────────────────────────────────────────
describe('formatFloorNumber (PR-E baseline §125)', () => {
  it.each([
    // [입력, 기대 출력] — 결정적 매핑 박제
    ['', ''],
    ['반지하', '반지하'],
    ['0.5', '반지하'],
    ['0,5', '반지하'],
    ['B1', '지하1층'],
    ['B2', '지하2층'],
    ['b3', '지하3층'],
    ['1', '1층'],
    ['3', '3층'],
    ['10', '10층'],
    ['지하1층', '지하1층'], // 이미 한글 — pass-through
    ['옥탑', '옥탑층'], // 그 외는 "층" 추가 (현재 동작)
  ] as const)(
    'formatFloorNumber(%j) === %j',
    (input, expected) => {
      expect(formatFloorNumber(input)).toBe(expected);
    }
  );
});

// ──────────────────────────────────────────
// formatFloorWithTotal — 현재/전체층 결합 변환
// ──────────────────────────────────────────
describe('formatFloorWithTotal (PR-E baseline §125)', () => {
  it.each([
    // [floor_current, floor_total, 기대 출력]
    [null, null, ''],
    [undefined, undefined, ''],
    ['', '', ''],
    ['3', '5', '3/5층'],
    ['3', null, '3층'],
    ['B1', '5', '지하1/5층'],
    ['반지하', '4', '반지하/4층'],
    ['0.5', '3', '반지하/3층'],
    ['2/4', null, '2/4층'], // 슬래시 포함 입력 — 그대로 사용
    ['2/4', '99', '2/4층'], // 슬래시 우선 — total 무시
    ['10', '15', '10/15층'],
  ] as const)(
    'formatFloorWithTotal(%j, %j) === %j',
    (current, total, expected) => {
      expect(formatFloorWithTotal(current, total)).toBe(expected);
    }
  );
});

// ──────────────────────────────────────────
// sanity — 베이스라인 setup 자체 동작 검증
// ──────────────────────────────────────────
describe('PR-E setup sanity', () => {
  it('vitest 환경 정상 부팅', () => {
    expect(1 + 1).toBe(2);
  });

  it('@/ alias 정상 (@/lib/formatFloor 로드 성공)', () => {
    expect(typeof formatFloorNumber).toBe('function');
    expect(typeof formatFloorWithTotal).toBe('function');
  });
});
