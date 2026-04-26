// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WebVitalsReporter — L-naver-2026vitals1 (2026-04-26)
// Next.js 15 의 useReportWebVitals 훅으로 Core Web Vitals (LCP/INP/CLS/FCP/TTFB)
// 측정 후 Sentry 에 전송.  추가 패키지 (web-vitals) 없이 Next 내장 사용.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { useReportWebVitals } from 'next/web-vitals';

interface VitalMetric {
  id: string;
  name: string;
  value: number;
  delta: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
  label?: string;
  navigationType?: string;
}

export default function WebVitalsReporter() {
  useReportWebVitals((metric: VitalMetric) => {
    try {
      // L-naver-2026vitals1: Core Web Vitals → Sentry custom event.
      const Sentry = (window as unknown as {
        Sentry?: {
          captureMessage?: (m: string, opts?: unknown) => void;
          metrics?: { distribution?: (n: string, v: number, opts?: unknown) => void };
        };
      }).Sentry;

      // Sentry Metrics API (preferred — distribution 으로 분포 측정)
      if (Sentry?.metrics?.distribution) {
        Sentry.metrics.distribution(`webvitals.${metric.name.toLowerCase()}`, metric.value, {
          unit: metric.name === 'CLS' ? 'none' : 'millisecond',
          tags: { rating: metric.rating ?? 'unknown' },
        });
      } else if (Sentry?.captureMessage) {
        // Fallback: simple message
        Sentry.captureMessage(`[WebVitals] ${metric.name}=${metric.value.toFixed(0)} (${metric.rating ?? 'n/a'})`, {
          level: metric.rating === 'poor' ? 'warning' : 'info',
          tags: { metric: metric.name, rating: metric.rating },
          extra: metric,
        });
      }

      // Performance Beacons API (없으면 무시)
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
          const body = JSON.stringify({
            name: metric.name,
            value: metric.value,
            rating: metric.rating,
            id: metric.id,
            url: window.location.pathname,
            ts: Date.now(),
          });
          // 자체 endpoint 가 없어서 일단 console 만; future endpoint 도입 시 교체.
          if (process.env.NODE_ENV === 'development') {
            console.debug('[WebVitals]', body);
          }
        } catch { /*noop*/ }
      }
    } catch {
      // 측정 자체가 사용자 영향 없도록 silent fail
    }
  });

  return null;
}
