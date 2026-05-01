// 오프라인 폴백 페이지 — sw.js 가 네트워크 실패 시 캐시에서 반환.
// 정적 경로로 빌드되어 precache 에 포함됨.
//
// Server Component: force-static 으로 빌드 시 한 번 prerender.
// 다시시도 버튼만 Client Component 로 분리 (onClick 제약 회피).

import OfflineRetryButton from './OfflineRetryButton';

export const dynamic = 'force-static';
export const revalidate = false;

export const metadata = {
  title: '오프라인 — WISHES',
  description: '인터넷 연결 후 다시 시도해주세요.',
};

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
        background: '#f4f8f0',
        color: '#1a3a1f',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 420,
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 24,
          padding: '2.5rem 2rem',
          boxShadow: '0 8px 32px rgba(58,125,68,0.12)',
        }}
      >
        <div style={{ fontSize: 52, marginBottom: 16 }}>📡</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>
          오프라인 상태입니다
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0, color: '#3a5a3f' }}>
          인터넷 연결을 확인해주세요. 연결이 복구되면 자동으로 콘텐츠가 표시됩니다.
        </p>
        <OfflineRetryButton />
      </div>
    </main>
  );
}
