// ─────────────────────────────────────────────────────────────────────────
// L-sec62 (2026-04-22): in-memory sliding-window rate limiter.
//
// 목적: /api/auth/login, /register, /delete-account 등 민감 엔드포인트의
//   brute-force / credential-stuffing / enumeration 비용을 높이기 위한
//   defense-in-depth. 기존 인증 로직은 건드리지 않고 선조건으로만 추가.
//
// 한계 (명시):
//   - Vercel 서버리스는 인스턴스가 수평 스케일되므로, 본 제한은
//     인스턴스 로컬 메모리에만 존재 → 이론적 최대 허용률 = N(활성 인스턴스) × limit.
//     저사양 공격자/스크립트 키디에는 효과적, 대규모 분산 공격에는 불충분.
//   - 최종 해결은 Upstash Redis/Supabase table backed counter 로의 전환(후속 task).
//   - 프로세스 재시작 시 카운터 초기화됨 (cold start).
//
// API 가이드:
//   const r = checkRateLimit({ key: `login:${ip}:${email}`, limit: 5, windowMs: 15*60_000 });
//   if (!r.ok) return 429 with r.retryAfterSec.
//
//   key 는 조합해서 사용 (ex: 'login:ip:1.2.3.4:alice@example.com').
//   limit 은 window 내 최대 허용 횟수, windowMs 는 슬라이딩 윈도우 길이(ms).
// ─────────────────────────────────────────────────────────────────────────

import type { NextRequest } from 'next/server';

type Bucket = { timestamps: number[] };

// key → bucket. Map 은 JS 런타임 레벨 구조라 모듈 import 순간 단일 인스턴스 공유.
const buckets = new Map<string, Bucket>();

// 주기적 GC: 마지막 기록이 windowMs*2 초과한 키 제거 (메모리 누수 방지).
// Vercel 에서 setInterval 이 살아남는 건 보장되지 않으나, lazy cleanup 으로도 충분.
let lastGcAt = 0;
const GC_EVERY_MS = 60_000;

function gc(now: number) {
  if (now - lastGcAt < GC_EVERY_MS) return;
  lastGcAt = now;
  // 가장 큰 window(1h=3600_000) 의 2배를 cutoff 로 잡음.
  const cutoff = now - 2 * 3600_000;
  for (const [k, b] of buckets.entries()) {
    if (b.timestamps.length === 0 || b.timestamps[b.timestamps.length - 1] < cutoff) {
      buckets.delete(k);
    }
  }
  // 지나치게 커지면 강제 정리(abuse 방지: key space flooding)
  if (buckets.size > 10000) {
    const excess = buckets.size - 5000;
    let i = 0;
    for (const k of buckets.keys()) {
      if (i++ >= excess) break;
      buckets.delete(k);
    }
  }
}

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
};

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  gc(now);

  const cutoff = now - windowMs;
  const bucket = buckets.get(key) ?? { timestamps: [] };

  // O(n) 필터 — 정상 트래픽은 limit 상수이므로 n 은 작음
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSec };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { ok: true, remaining: limit - bucket.timestamps.length, retryAfterSec: 0 };
}

// ─────────────────────────────────────────────────────────────────────────
// Client IP 추출.
//   우선순위: cf-connecting-ip → x-real-ip → x-forwarded-for(first hop).
//
// L-sec98 (2026-04-22): XFF first-hop 정책 명시.
//   Vercel 환경에서는 Vercel Edge 가 신뢰할 수 있는 클라이언트 IP 를 x-forwarded-for 의
//   제일 앞(first hop) 에 prepend 한다. 따라서 .split(',')[0] 은 Vercel 에서는
//   방어적으로 올바른 선택.
//   단, 비-Vercel 배포(자체 호스팅, 일반 리버스 프록시 뒤)에서는
//   클라이언트가 임의 XFF 를 주입할 수 있으므로 last hop / 신뢰된 프록시 IP 도메인
//   기반 필터와 결합해야 안전. 현재 프로덕션 배포는 Vercel icn1 으로 고정되어 있으므로
//   first-hop 정책 유지.
//
//   아무것도 없으면 'unknown' (로컬 dev 환경).
// ─────────────────────────────────────────────────────────────────────────
export function getClientIp(request: NextRequest): string {
  // L-sec105 (2026-04-22): cf-connecting-ip 맹신 시 스푸핑으로 rate limit 우회 가능.
  //   wishes.co.kr 은 Vercel icn1 직결 (Cloudflare 프런트 없음) — cf-connecting-ip 는
  //   edge 가 절대 설정하지 않으므로, 존재한다면 공격자 주입이다.
  //   cf-* 는 CF-RAY (Cloudflare 가 스스로 붙이는 고유 ID) 가 동반된 경우에만 신뢰.
  //   일반 요청은 x-real-ip (Vercel 이 세팅) 이후 x-forwarded-for first-hop 사용.
  const cf = request.headers.get('cf-connecting-ip');
  const cfRay = request.headers.get('cf-ray');
  if (cf && cfRay) return cf.trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}
