// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapClientWrapper — Next.js 15: ssr:false dynamic 은 클라이언트에서만 허용
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import dynamic from 'next/dynamic';

const MapClient = dynamic(() => import('./MapClient'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
      지도 불러오는 중…
    </div>
  ),
});

export default function MapClientWrapper() {
  return <MapClient />;
}
