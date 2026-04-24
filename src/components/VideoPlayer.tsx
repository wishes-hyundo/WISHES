// src/components/VideoPlayer.tsx
// L-video1 (2026-04-24): 공개 매물 상세 + admin/edit 공용 동영상 플레이어.
//   - CSS 워터마크 오버레이 (중앙 WISHES, pointer-events:none)
//   - 다운로드 방해 레이어 (controlsList=nodownload, 우클릭 차단, PiP/원격 차단)
//   - hideWatermark=true 로 관리자 편집 화면에서는 워터마크 미표시
//
// 사진 파이프라인(photoProcess.ts, watermark-center.png) 과 독립 — 이 컴포넌트는
// 런타임 CSS 오버레이만 처리한다. src 는 R2 public URL 을 그대로 받는다.

'use client';

import { useMemo, useRef, useState } from 'react';

export interface VideoPlayerProps {
  /** R2 public URL */
  src: string;
  /** 포스터(썸네일) 이미지 URL. 없으면 첫 프레임 로드까지 검은 배경 */
  poster?: string;
  /** 영상 제목/설명 (파일명, alt). 상단 캡션/aria-label 로 활용 */
  title?: string;
  /** 서버에서 받은 MIME 타입. 브라우저가 재생 가능한지 판단에 쓰임 */
  mimeType?: string;
  /** 래퍼에 추가할 Tailwind 클래스 */
  className?: string;
  /** 관리자 편집/미리보기용: 워터마크 숨김 */
  hideWatermark?: boolean;
}

/**
 * 공용 동영상 플레이어.
 *   <VideoPlayer src={v.url} poster={v.poster_url} title={v.alt} mimeType={v.mime_type} />
 *   <VideoPlayer src={v.url} hideWatermark />  // 관리자 미리보기
 */
export default function VideoPlayer({
  src,
  poster,
  title,
  mimeType,
  className = '',
  hideWatermark = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState(false);

  // L-video1: 캐시 버스트 없이 그대로 전달 (R2 immutable key 라 안전)
  const resolvedSrc = useMemo(() => src, [src]);

  // 우클릭 차단 + 드래그 차단 (키보드/Dev Tools 는 막을 수 없음)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };
  const handleDragStart = (e: React.DragEvent) => {
    e.preventDefault();
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
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={resolvedSrc}
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
        // L-video1: React 타입에 disableRemotePlayback 없는 버전 대비 spread 로 주입
        {...({ disableRemotePlayback: true } as Record<string, unknown>)}
      >
        {/* 일부 브라우저(특히 iOS Safari)가 src 속성만 보면 오판할 때 대비 */}
        {mimeType ? <source src={resolvedSrc} type={mimeType} /> : null}
        동영상을 재생할 수 없습니다.
      </video>

      {/* 워터마크 오버레이 — 재생/컨트롤을 막지 않도록 pointer-events:none */}
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

      {/* 에러 상태 — 네트워크/포맷 오류 시 포스터/안내 대체 */}
      {hasError && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white text-sm gap-1 pointer-events-none select-none"
          aria-live="polite"
        >
          <span className="text-lg">🎬</span>
          <span>동영상을 불러올 수 없습니다</span>
        </div>
      )}

      {/* 제목 캡션(선택) — 위 오버레이들보다 낮게, 컨트롤러는 가리지 않음 */}
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
