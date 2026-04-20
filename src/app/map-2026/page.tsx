// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /map-2026 — 서버 엔트리 (RSC)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'MAP 2026 · WISHES',
  description: 'AI 큐레이션 기반 실시간 부동산 지도',
  robots: { index: false, follow: false },
};

const MapClient = dynamic(() => import('./MapClient'), { ssr: false });

export default function MapPage() {
  // 피처 플래그: NEXT_PUBLIC_MAP_2026=true 일 때만 노출
  if (process.env.NEXT_PUBLIC_MAP_2026 !== 'true') return notFound();

  return (
    <main className="h-[100dvh] w-screen overflow-hidden bg-[#fafafa]">
      <MapClient />
    </main>
  );
}
