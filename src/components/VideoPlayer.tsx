// src/components/VideoPlayer.tsx
// L-video1 (2026-04-24): 공개 매물 상세 + admin/edit 공용 동영상 플레이어.
//   - CSS 워터마크 오버레이 (중앙 WISHES, pointer-events:none)
//   - 다운로드 방해 레이어 (controlsList=nodownload, 우클릭 차단, PiP/원격 차단)
//   - hideWatermark=true 로 관리자 편집 화면에서는 워터마크 미표시
//
// 사진 파이프라인(photoProcess.ts, watermark-center.png) 과 독립 — 이 컴포넌트는
// 런타임 CSS 오버레이만 처리한다. src 는 R2 public URL 을 그대로 받는다.

'use client';

import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, DragEvent as ReactDragEvent } from 'react';

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  mimeType?: string;
  className?: string;
  hideWatermark?: boolean;
}

export default function VideoPlayer({
  src,
  poster,
  title,
  mimeType,
  className = '',
  hideWatermark = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasError, setHasError] = useState(false);

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
  };
  const handleDragStart = (e: ReactDragEvent) => {
    e.preventDefault();
  };

  // React 18/19 타입 차이 대응 — disableRemotePlayback 는 HTML 표준이지만 type 누락 가능
  const extraAttrs: Record<string, boolean> = {
    disableRemotePlayback: true,
  };

  return (
    <div
      className={
        'ws-video-wrap relative overflow-hidden rounded-xl bg-black aspect-video ' +
        className
      }
      onContextMenu={handleContextMenu}
      onDragStart={handleDragStart}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls
        preload="metadata"
        playsInline
        controlsList="nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        aria-label={title || '매물 동영상'}
        onError={() => setHasError(true)}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        className="w-full h-full object-contain bg-black select-none"
        {...extraAttrs}
      >
        {mimeType ? <source src={src} type={mimeType} /> : null}
        <track kind="captions" />
        동영상을 재생할 수 없습니다.
      </video>

      {!hideWatermark && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
          aria-hidden="true"
        >
          <span
            className="font-black tracking-[0.3em] text-white/20"
            style={{
              fontFamily:
                "'URW Gothic', 'Futura', 'Montserrat', 'Helvetica Neue', Arial, sans-serif",
              fontSize: 'clamp(22px, 7vw, 72px)',
              textShadow: '0 2px 12px rgba(0,0,0,0.45), 0 0 1px rgba(0,0,0,0.35)',
              mixBlendMode: 'screen',
              letterSpacing: '0.3em',
            }}
          >
            WISHES
          </span>
        </div>
      )}

      {hasError && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white text-sm gap-1 pointer-events-none select-none"
          aria-live="polite"
        >
          <span className="text-lg">🎬</span>
          <span>동영상을 불러올 수 없습니다</span>
        </div>
      )}

      {title && (
        <div className="absolute top-2 left-2 right-2 pointer-events-none">
          <span className="inline-block max-w-full truncate rounded bg-black/45 px-2 py-0.5 text-[11px] text-white/90">
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
