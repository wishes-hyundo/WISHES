// L-sec132 (2026-04-23): L-sec62 rate limiter 회귀 방지.
//   H-2 / admin mutation rate-limit 의 실동작이 여기서 보장됨.
//   이 테스트가 깨지면 429 응답이 사라졌거나 윈도우 회복 로직이 변경됨.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit } from './rateLimit';

describe('checkRateLimit — sliding window', () => {
  beforeEach(() => {
    // 모든 test 는 고유 key 사용 (공유 Map 전역 상태 오염 방지)
  });

  it('allows calls up to the limit', () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit({ key, limit: 5, windowMs: 60_000 });
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(5 - (i + 1));
    }
  });

  it('blocks the (limit+1)-th call with retryAfterSec > 0', () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      checkRateLimit({ key, limit: 3, windowMs: 60_000 });
    }
    const blocked = checkRateLimit({ key, limit: 3, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('isolates counters per key (no cross-key bleed)', () => {
    const keyA = `test-A:${Math.random()}`;
    const keyB = `test-B:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      checkRateLimit({ key: keyA, limit: 3, windowMs: 60_000 });
    }
    // keyA 소진 상태에서도 keyB 는 전혀 영향 없어야 함
    const r = checkRateLimit({ key: keyB, limit: 3, windowMs: 60_000 });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it('recovers after window slides past the oldest timestamp', () => {
    const key = `test-recover:${Math.random()}`;
    vi.useFakeTimers();
    try {
      const t0 = new Date('2026-04-23T00:00:00Z').getTime();
      vi.setSystemTime(t0);

      // 3회 소진
      for (let i = 0; i < 3; i++) {
        checkRateLimit({ key, limit: 3, windowMs: 10_000 });
      }
      expect(checkRateLimit({ key, limit: 3, windowMs: 10_000 }).ok).toBe(false);

      // 11초 경과 → 윈도우 밖으로 이전 타임스탬프 밀려남
      vi.setSystemTime(t0 + 11_000);
      const recovered = checkRateLimit({ key, limit: 3, windowMs: 10_000 });
      expect(recovered.ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('remaining never goes negative', () => {
    const key = `test-negclamp:${Math.random()}`;
    // limit 1 상황에서 연속 호출 — 차단 응답에서 remaining 은 0 고정
    checkRateLimit({ key, limit: 1, windowMs: 60_000 });
    const r1 = checkRateLimit({ key, limit: 1, windowMs: 60_000 });
    const r2 = checkRateLimit({ key, limit: 1, windowMs: 60_000 });
    expect(r1.remaining).toBe(0);
    expect(r2.remaining).toBe(0);
  });
});
