// src/lib/generateVideoPoster.ts
// L-video1 (2026-04-24): 동영상 파일에서 첫 프레임(1.5초 지점)을 Canvas 로 캡처해 Blob 반환.
//   - 클라이언트 전용 (document / URL.createObjectURL 사용)
//   - 캡처된 Blob 을 /api/admin/upload (listingId 없이) 로 POST 하면
//     Classic Negative + 중앙 워터마크가 박힌 WebP R2 URL 을 돌려받는다.
//   - 그 URL 을 /api/listings/[id]/videos PATCH 의 poster_url 로 저장.
//
// 실패는 null 반환 → 호출부는 포스터 없이도 업로드 플로우 지속.

export interface PosterOptions {
  /** 몇 초 지점의 프레임을 캡처할지 (기본 1.5s, duration 10% 중 작은 값) */
  seekTime?: number;
  /** 최대 너비 (장면 축소, 기본 1920) — R2 egress/썸네일 속도 절감 */
  maxWidth?: number;
  /** JPEG 품질 (0~1, 기본 0.92) */
  quality?: number;
}

/**
 * 동영상 File 에서 첫 프레임 Blob 을 꺼낸다.
 * 모바일 Safari 에서도 muted + playsInline 조건이면 seek 동작.
 */
export async function generateVideoPoster(
  videoFile: File,
  opts: PosterOptions = {}
): Promise<Blob | null> {
  const { seekTime = 1.5, maxWidth = 1920, quality = 0.92 } = opts;

  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (!videoFile || !videoFile.type.startsWith('video/')) return null;

  const objectUrl = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // 일부 브라우저는 CORS 없이 seek 한 캔버스를 tainted 처리 → objectURL 은 안전

  try {
    // 1) metadata 로드 대기
    await new Promise<void>((resolve, reject) => {
      const onLoad = () => resolve();
      const onErr = () => reject(new Error('video metadata load failed'));
      video.addEventListener('loadedmetadata', onLoad, { once: true });
      video.addEventListener('error', onErr, { once: true });
      // timeout 8초
      setTimeout(() => reject(new Error('metadata timeout')), 8000);
    });

    // 2) seek
    const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 2;
    const target = Math.max(0, Math.min(seekTime, duration * 0.1, duration - 0.05));
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => resolve();
      const onErr = () => reject(new Error('video seek failed'));
      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onErr, { once: true });
      video.currentTime = target;
      setTimeout(() => reject(new Error('seek timeout')), 8000);
    });

    // 3) canvas draw
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const scale = vw > maxWidth ? maxWidth / vw : 1;
    const cw = Math.round(vw * scale);
    const ch = Math.round(vh * scale);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, cw, ch);

    // 4) Blob 추출 (JPEG — 파이프라인이 WebP 로 재인코딩)
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    );
    return blob;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[generateVideoPoster] failed:', err);
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
    // best-effort cleanup
    try {
      video.removeAttribute('src');
      video.load();
    } catch {}
  }
}

/**
 * Blob → /api/admin/upload 로 POST 해서 Classic Negative + 워터마크 박힌 WebP URL 반환.
 * listingId 를 주지 않아야 listing_images 에 insert 되지 않는다 (포스터 전용).
 */
export async function uploadPosterToR2(
  posterBlob: Blob,
  fetchImpl: typeof fetch = fetch,
  extraHeaders: HeadersInit = {}
): Promise<string | null> {
  try {
    const fd = new FormData();
    // /api/admin/upload 는 file 필드를 본다
    const file = new File([posterBlob], `poster-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });
    fd.append('file', file);
    // listingId 의도적으로 생략 — DB insert 방지
    const res = await fetchImpl('/api/admin/upload', {
      method: 'POST',
      headers: extraHeaders,
      body: fd,
    });
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok || !json?.success) return null;
    return typeof json?.data?.url === 'string' ? json.data.url : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[uploadPosterToR2] failed:', err);
    return null;
  }
}
