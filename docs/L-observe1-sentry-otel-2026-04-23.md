# L-observe1 — Sentry / OpenTelemetry 도입 가이드

_Owner: 플랫폼 / Date: 2026-04-23 / Status: draft_

## 배경

현재 wishes-v2 는 `console.error` 만으로 오류를 추적한다.
L-sec70~117 로 prod error 누출을 전부 가렸기 때문에, 이제는
운영자가 Vercel 로그를 열지 않는 한 장애를 감지할 수단이 없다.

- 공개 엔드포인트 5xx 가 Vercel Serverless log 에 머무르고 알람 전달 안 됨
- Supabase Auth admin ops 실패 시 관리자 도구에서 재현이 어려움
- rate-limit 429 스파이크가 장기간 드러나지 않으면 크롤러 IP 화이트 리스트 관리 지연
- /map 클라이언트 예외 (deck.gl/Kakao SDK) 가 user-reported 되어야만 파악

## 목표

1. prod 5xx 와 rate-limited 429 를 10분 이내에 채널로 알림
2. prod 클라이언트 React 에러 boundary 와 unhandled promise rejection 수집
3. p95/p99 latency 와 Supabase 호출 지연을 대시보드화
4. PII/token 이 원격으로 전송되지 않는 것을 증명 가능하게 필터링

## 선택지

- Sentry SaaS (추천, 기본 plan 무료 5k events/month)
- Vercel Analytics Observability (얇고 alerting 약함)
- Grafana Cloud + OpenTelemetry SDK (완전 제어, 구축 비용 큼)

본 문서는 Sentry 를 primary, OTel 을 Supabase/Next.js RSC traces 용으로 병행하는 안.

## DSN / 키

| env | 변수 | 예 |
|---|---|---|
| prod | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | `https://<key>@o<org>.ingest.sentry.io/<project>` |
| preview | 동일 — Vercel environment=Preview 에 별도 project 권장 | |
| dev | 비워두면 SDK no-op | |

`SENTRY_AUTH_TOKEN` 은 sourcemap 업로드에만 쓰이므로 Vercel Build-only env scope.

## Next.js 15 instrumentation.ts 스켈레톤

```ts
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./instrumentation.edge');
  }
}
```

```ts
// src/instrumentation.node.ts
import * as Sentry from '@sentry/nextjs';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN && process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.0,
  ignoreErrors: ['AbortError', 'uid_timeout'],
  beforeSend(event) {
    // PII masking
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    if (event.user) {
      delete event.user.ip_address;
      delete event.user.email;
    }
    return event;
  },
});
```

```ts
// src/app/global-error.tsx — 이미 있음. Sentry.captureException 추가
'use client';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return <html><body><h2>문제가 발생했습니다</h2><button onClick={reset}>재시도</button></body></html>;
}
```

## 알람 정책

| 이벤트 | 조건 | 알람 채널 |
|---|---|---|
| 5xx rate | 5분간 > 5회 | Slack #ops |
| 429 spike | 10분간 > 50회 in single endpoint | Slack #ops |
| unhandled rejection | 발생 즉시 | Slack #frontend |
| Supabase admin ops error | 1건 | Slack #ops |
| Kakao Local API 4xx | 5분간 > 10회 (할당량 근접 경고) | Slack #ops |

## 롤아웃

1. Sentry org + projects 2개 (prod/preview) 생성 → DSN 을 Vercel env 에 투입
2. `@sentry/nextjs` 설치 (next 15.2 호환 ^8) → instrumentation.ts 커밋
3. preview 배포에서 Synthetic 5xx 1건 던져 대시보드 도달 확인
4. prod 승격 + alert 채널 5분간 watch
5. 1주 후 tracesSampleRate 0.1 → 0.25 로 올리고 비용 확인

## OpenTelemetry (phase 2)

- `@vercel/otel` 로 Supabase postgres span 자동 trace
- Collector 는 Grafana Cloud free tier 로 충분 (100GB/month)
- p95 latency heatmap 은 `/api/admin/*`, `/api/map/*`, `/api/listings/*` 그룹화

## 리스크

- sourcemap 업로드가 build 를 10초 정도 늘림 — 허용
- Sentry free plan 5k events/month 초과 가능성 → 샘플링 + error grouping 로 완화
- PII 유출 위험 → `beforeSend` 에서 auth header / email / ip 필터링 강제
- 429 스파이크 시 alerting 이 루프 돌 수 있음 → rate-limit endpoint/ip 별 dedup key

## 체크리스트

- [ ] Sentry org 2개 (prod/preview) 생성
- [ ] DSN 을 Vercel env 에 설정 (prod/preview/dev=비움)
- [ ] `@sentry/nextjs` 의존성 추가 + instrumentation.ts 커밋
- [ ] global-error.tsx 에 captureException 삽입
- [ ] beforeSend PII 필터 테스트 (이메일/token 을 일부러 throw 해 이벤트 확인)
- [ ] alert 5종 채널 연결
- [ ] 1주 후 비용/샘플링 재검토

