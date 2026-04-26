// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapErrorBoundary — L-naver-2026error1 (2026-04-26)
// 지도 컴포넌트 트리에서 발생하는 에러를 잡아 graceful fallback.
// AdminRegionOverlay 의 GeoJSON 파싱/Kakao SDK 호출 실패 시 페이지 전체
// crash 대신 작은 알림만 표시.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
}

export class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // L-naver-2026error1: 에러 보고 (Sentry 등 외부 모니터링 hook).
    if (typeof window !== 'undefined' && (window as unknown as { Sentry?: { captureException?: (e: Error, ctx?: unknown) => void } }).Sentry?.captureException) {
      (window as unknown as { Sentry: { captureException: (e: Error, ctx?: unknown) => void } }).Sentry.captureException(error, {
        contexts: { react: { componentStack: info.componentStack } },
      });
    } else {
      console.error('[MapErrorBoundary]', error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 1000,
            background: 'rgba(255,255,255,0.97)',
            border: '1px solid rgba(220,38,38,0.3)',
            borderRadius: 12,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 600,
            color: '#991b1b',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          지도 오류가 발생했어요. 새로고침으로 복구하세요.
        </div>
      );
    }
    return this.props.children;
  }
}

export default MapErrorBoundary;
