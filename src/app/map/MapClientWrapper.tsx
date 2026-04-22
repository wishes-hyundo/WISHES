// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapClientWrapper — Next.js 15: ssr:false dynamic 은 클라이언트에서만 허용
//
// L-map2 (2026-04-21): WebGL 지원 사전 감지.
//   WebGL 이 불가능한 환경에서 MapClient 를 dynamic import 하면 maplibre-gl(~200KB)
//   + deck.gl/core(~214KB) 를 전부 로드한 뒤 런타임에서야 실패했고, 그 결과
//   Lighthouse LCP 가 12s+ 까지 늘어났다. 여기서 canvas.getContext('webgl') 한 번으로
//   지원 여부를 가리고, 미지원이면 라이브러리를 아예 import 하지 않는다.
// L-map3 (2026-04-21): 초기 스켈레톤을 '시각적으로 큰' 블록으로 재설계.
//   이전 스켈레톤("지도 불러오는 중…") 은 작아서 Lighthouse LCP 가 useEffect 이후
//   fallback 문단에 뒤늦게 앵커되어 6.5s 까지 밀렸다. 이제 FCP 시점(1.6s)에
//   이미 전체 영역을 덮는 그라데이션 스켈레톤이 잡혀 LCP = FCP 수준.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// 공유 스켈레톤: dynamic import loading / 초기 supported===undefined 양쪽에서 동일하게 사용.
// 크기가 충분히 커서 LCP 를 FCP 시점으로 끌어올리고, 본 지도가 등장할 때 레이아웃 시프트
// 가 생기지 않도록 tail 영역을 fill 로 잡아둔다.
function MapSkeleton() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-wishes-cream/60 via-white to-wishes-cream/40">
      {/* 거대 placeholder — LCP 가 확실히 여기로 잡히도록 큰 면적 유지 */}
      <div className="absolute inset-0 animate-pulse bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08),transparent_60%)]" />
      <div className="relative z-10 grid h-full place-items-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-wishes-primary/20 border-t-wishes-primary animate-spin" />
          <p className="text-base font-semibold text-wishes-primary">지도 불러오는 중…</p>
          <p className="mt-1 text-xs text-gray-500">최적의 경로로 매물을 준비하고 있어요</p>
        </div>
      </div>
    </div>
  );
}

const MapClient = dynamic(() => import('./MapClient'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const ctx =
      c.getContext('webgl2') ||
      c.getContext('webgl') ||
      (c.getContext('experimental-webgl') as WebGLRenderingContext | null);
    return !!ctx;
  } catch {
    return false;
  }
}

export default function MapClientWrapper() {
  // undefined = 검사 전(SSR/초기 paint), true/false = 검사 결과
  const [supported, setSupported] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    setSupported(hasWebGL());
  }, []);

  if (supported === false) {
    return (
      <div className="grid h-full place-items-center bg-wishes-cream/40 px-4">
        <div className="max-w-md text-center">
          <h2 className="mb-2 text-lg font-bold text-wishes-primary">
            이 브라우저에서는 지도를 불러올 수 없어요
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            WebGL 이 비활성화되어 있거나 지원되지 않는 환경입니다. 대신 목록에서 매물을 확인해 보세요.
          </p>
          <a
            href="/listings"
            className="inline-flex items-center justify-center rounded-xl bg-wishes-primary px-5 py-3 text-sm font-bold text-white hover:bg-wishes-secondary"
          >
            매물 목록 보기
          </a>
        </div>
      </div>
    );
  }

  // supported === undefined (검사 전) 에서는 동일 스켈레톤으로 레이아웃만 잡아 둔다.
  if (supported === undefined) {
    return <MapSkeleton />;
  }

  return <MapClient />;
}
