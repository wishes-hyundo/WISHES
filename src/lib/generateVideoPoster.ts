// src/lib/generateVideoPoster.ts
// L-video1 (2026-04-24): 동영상 파일에서 첫 프레임(1.5초 지점)을 Canvas 로 캡처해 Blob 반환.
//   - 클라이언트 전용 (document / URL.createObjectURL 사용)
//   - 캡처된 Blob 을 /api/admin/upload (listingId 없이) 로 POST 하면
//     Classic Negative + 중앙 워터마크가 박힌 WebP R2 URL 을 돌려받는다.
//   - 그 URL 을 /api/listings/[id]/videos PATCH 의 poster_url 로 저장.

export interface PosterOptions {
  seekTime?: number;
  maxWidth?: number;
  quality?: number;
}

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

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoad = () => resolve();
      const onErr = () => reject(new Error('video metadata load failed'));
      video.addEventListener('loadedmetadata', onLoad, { once: true });
      video.addEventListener('error', onErr, { once: true });
      setTimeout(() => reject(new Error('metadata timeout')), 8000);
    });

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

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    );
    return blob;
  } catch (err) {
    console.warn('[generateVideoPoster] failed:', err);
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
    try {
      video.removeAttribute('src');
      video.load();
    } catch {}
  }
}

/**
 * Blob → /api/admin/upload 로 POST 해서 Classic Negative + 워터마크 박힌 WebP URL 반환.
 * listingId 를 주지 않아야 listing_images 에 insert 되지 않는다 (포스터 전용).
 *
 * fetcher 는 (input, init) => Promise<Response> 호환 함수 (adminFetch 도 호환됨).
 */
export type UploadFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export async function uploadPosterToR2(
  posterBlob: Blob,
  fetcher: UploadFetcher,
  extraHeaders: Record<string, string> = {}
): Promise<string | null> {
  try {
    const fd = new FormData();
    const file = new File([posterBlob], 'poster-' + Date.now() + '.jpg', {
      type: 'image/jpeg',
    });
    fd.append('file', file);
    const res = await fetcher('/api/admin/upload', {
      method: 'POST',
      headers: extraHeaders,
      body: fd,
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { url?: string };
    };
    if (!res.ok || !json?.success) return null;
    return typeof json?.data?.url === 'string' ? json.data.url : null;
  } catch (err) {
    console.warn('[uploadPosterToR2] failed:', err);
    return null;
  }
}
