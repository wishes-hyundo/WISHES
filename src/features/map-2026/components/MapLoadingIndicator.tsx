// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapLoadingIndicator — L-naver-2026skel1 (2026-04-26)
// GeoJSON / Kakao SDK 로드 중 우상단에 작은 로딩 인디케이터 표시.
// 사용자에게 폴리곤 곧 그려진다는 시각적 피드백.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

interface Props {
  show: boolean;
  message?: string;
}

export default function MapLoadingIndicator({ show, message = '지도 데이터 불러오는 중' }: Props) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 999,
        background: 'rgba(255,255,255,0.97)',
        border: '1px solid rgba(0,0,0,0.06)',
        borderRadius: 14,
        padding: '7px 12px 7px 32px',
        fontSize: 12,
        fontWeight: 600,
        color: '#1b3a24',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        letterSpacing: '-0.2px',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          width: 14,
          height: 14,
          marginTop: -7,
          borderRadius: '50%',
          border: '2px solid rgba(102,187,106,0.3)',
          borderTopColor: '#1b5e20',
          animation: 'wishes-spin 0.8s linear infinite',
        }}
      />
      {message}
      <style>{`
        @keyframes wishes-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
