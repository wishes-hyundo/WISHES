'use client';

/**
 * Next.js global-error.tsx
 * Root layout 자체가 crash 했을 때의 마지막 fallback (very rare).
 * 일반 에러는 src/app/error.tsx (root) + src/app/admin/error.tsx 가 catch.
 *
 * 작성: 2026-04-28 사장님 정밀 검수 명령 — 단 하나도 안 빠뜨리고
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          background: '#f5f3eb',
          color: '#1a1a1a',
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            padding: '40px 24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 64,
              marginBottom: 16,
              opacity: 0.85,
            }}
            aria-hidden="true"
          >
            🔧
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              margin: '0 0 12px',
              color: '#2D5A27',
            }}
          >
            잠시 문제가 생겼습니다
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              margin: '0 0 24px',
              color: '#666',
            }}
          >
            서비스 연결에 문제가 발생했습니다.
            <br />
            잠시 후 다시 시도해주세요.
          </p>
          {error?.digest && (
            <p
              style={{
                fontSize: 11,
                color: '#999',
                margin: '0 0 24px',
                fontFamily: 'monospace',
              }}
            >
              에러 코드: {error.digest}
            </p>
          )}
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                background: '#2D5A27',
                color: '#fff',
                border: 0,
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              다시 시도
            </button>
            <a
              href="/"
              style={{
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                background: '#fff',
                color: '#2D5A27',
                border: '1px solid #2D5A27',
                borderRadius: 10,
                textDecoration: 'none',
              }}
            >
              홈으로
            </a>
          </div>
          <p
            style={{
              fontSize: 12,
              color: '#999',
              marginTop: 32,
            }}
          >
            지속되면{' '}
            <a href="mailto:wishes@wishes.co.kr" style={{ color: '#2D5A27' }}>
              wishes@wishes.co.kr
            </a>
            로 문의해주세요.
          </p>
        </div>
      </body>
    </html>
  );
}
