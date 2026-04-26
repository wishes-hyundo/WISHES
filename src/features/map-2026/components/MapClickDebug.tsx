// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapClickDebug — L-naver-2026clickdiag2 (2026-04-26)
// 화면에 항상 보이는 click 디버그 패널.
// AdminRegionOverlay 의 onClick 이 fire 될 때마다 window.__lastMapClick 에
// 정보 저장 → 이 컴포넌트가 polling 으로 화면에 표시.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { useEffect, useState } from 'react';

interface ClickInfo {
  ts: number;
  label: string;
  names: string;
  codes: string;
  cy: number | null;
  cx: number | null;
  curLv: number;
  finalLv: number;
  mode: string;
}

declare global {
  interface Window {
    __lastMapClick?: ClickInfo;
  }
}

export default function MapClickDebug() {
  const [info, setInfo] = useState<ClickInfo | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const last = window.__lastMapClick;
      if (last && last.ts !== info?.ts) setInfo(last);
    }, 500);
    return () => window.clearInterval(interval);
  }, [info?.ts]);

  if (!info) return null;
  const ago = Math.floor((Date.now() - info.ts) / 1000);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 999,
        background: 'rgba(0,0,0,0.85)',
        color: '#a5d6a7',
        fontFamily: 'monospace',
        fontSize: 11,
        padding: '8px 12px',
        borderRadius: 8,
        maxWidth: 380,
        lineHeight: 1.5,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 700, color: '#fff', marginBottom: 4 }}>
        🔍 Last click ({ago}s ago)
      </div>
      <div>label: <span style={{ color: '#fff' }}>{info.label}</span></div>
      <div>names: {info.names}</div>
      <div>codes: {info.codes}</div>
      <div>panTo: ({info.cy?.toFixed(4)}, {info.cx?.toFixed(4)})</div>
      <div>level: {info.curLv} → {info.finalLv} (mode={info.mode})</div>
    </div>
  );
}
