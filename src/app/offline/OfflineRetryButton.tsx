'use client';

// 다시 시도 버튼 — Client Component (onClick 핸들러용 분리).
// /offline 페이지의 인터랙션 부분만 격리하여 Server Component 의 force-static 호환.

export default function OfflineRetryButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined') window.location.reload();
      }}
      style={{
        marginTop: 24,
        padding: '12px 28px',
        fontSize: 15,
        fontWeight: 600,
        background: '#3a7d44',
        color: 'white',
        border: 'none',
        borderRadius: 999,
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(58,125,68,0.3)',
      }}
    >
      다시 시도
    </button>
  );
}
