'use client';

/**
 * SearchPhotoManager — 매물 사진 관리 (SW-5b)
 *
 * SearchEditModal 상단 임베드. /api/listings/[id]/images CRUD 연동.
 *   · GET  목록   · POST 업로드(최대 20장)   · PATCH 순서·대표   · DELETE 삭제
 * iOS 26.5 글래스 톤.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './SearchPhotoManager.module.css';
import { adminFetch } from '@/lib/adminFetch';

export interface SearchPhotoManagerProps {
  listingId: number;
}

interface PhotoImg {
  id: number;
  url: string;
  alt?: string | null;
  sort_order: number;
  is_thumbnail: boolean;
}

export function SearchPhotoManager({ listingId }: SearchPhotoManagerProps) {
  const [imgs, setImgs] = useState<PhotoImg[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await adminFetch(`/api/listings/${listingId}/images`, { redirectOn401: false });
      const j = await res.json().catch(() => ({} as Record<string, unknown>));
      const data = (j as { data?: PhotoImg[] }).data;
      if ((j as { success?: boolean }).success && Array.isArray(data)) {
        setImgs([...data].sort((a, b) => a.sort_order - b.sort_order));
      } else if (!res.ok) {
        setErr(res.status === 401 || res.status === 403 ? '로그인이 필요합니다.' : '사진을 불러오지 못했습니다.');
      }
    } catch {
      setErr('사진을 불러오지 못했습니다.');
    }
    setLoading(false);
  }, [listingId]);

  useEffect(() => { load(); }, [load]);

  // 접근성 — 마운트 시 포커스 + Tab 포커스 트랩 (패널 내 순환)
  useEffect(() => {
    uploadRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const items = (Array.from(f) as HTMLElement[]).filter((el) => !el.hasAttribute('disabled'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    const node = panelRef.current;
    node?.addEventListener('keydown', onKey);
    return () => { node?.removeEventListener('keydown', onKey); };
  }, []);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErr('');
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('images', f));
    try {
      const res = await adminFetch(`/api/listings/${listingId}/images`, {
        method: 'POST', redirectOn401: false, body: fd,
      });
      const j = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || (j as { success?: boolean }).success === false) {
        setErr((j as { error?: string }).error
          || (res.status === 401 || res.status === 403 ? '로그인이 필요합니다.' : `업로드 실패 (${res.status})`));
      } else {
        await load();
      }
    } catch {
      setErr('업로드 중 오류가 발생했습니다.');
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const patchImages = async (payload: { id: number; sort_order?: number; is_thumbnail?: boolean }[]) => {
    setBusy(true);
    setErr('');
    try {
      const res = await adminFetch(`/api/listings/${listingId}/images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        redirectOn401: false,
        body: JSON.stringify({ images: payload }),
      });
      const j = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || (j as { success?: boolean }).success === false) {
        setErr((j as { error?: string }).error || `변경 실패 (${res.status})`);
      } else {
        await load();
      }
    } catch {
      setErr('변경 중 오류가 발생했습니다.');
    }
    setBusy(false);
  };

  const setThumbnail = (id: number) => patchImages([{ id, is_thumbnail: true }]);

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= imgs.length) return;
    const a = imgs[idx];
    const b = imgs[j];
    patchImages([
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ]);
  };

  const remove = async (id: number) => {
    if (!window.confirm('이 사진을 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    setBusy(true);
    setErr('');
    try {
      const res = await adminFetch(`/api/listings/${listingId}/images?imageId=${id}`, {
        method: 'DELETE', redirectOn401: false,
      });
      const j = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || (j as { success?: boolean }).success === false) {
        setErr((j as { error?: string }).error || `삭제 실패 (${res.status})`);
      } else {
        await load();
      }
    } catch {
      setErr('삭제 중 오류가 발생했습니다.');
    }
    setBusy(false);
  };

  return (
    <div
      ref={panelRef}
      className={styles.wrap}
      role="dialog"
      aria-modal="true"
      aria-label="매물 사진 관리"
    >
      <div className={styles.head}>
        <span className={styles.label}>매물 사진 {imgs.length > 0 ? `(${imgs.length}/20)` : ''}</span>
        <button
          ref={uploadRef}
          type="button"
          className={styles.uploadBtn}
          onClick={() => fileRef.current?.click()}
          disabled={busy || imgs.length >= 20}
        >＋ 사진 추가</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      {loading ? (
        <p className={styles.note}>사진 불러오는 중…</p>
      ) : imgs.length === 0 ? (
        <p className={styles.note}>등록된 사진이 없습니다. ‘사진 추가’로 업로드하세요.</p>
      ) : (
        <div className={styles.grid}>
          {imgs.map((img, idx) => (
            <div key={img.id} className={styles.cell}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.thumb} src={img.url} alt={img.alt || '매물 사진'} />
              {img.is_thumbnail && <span className={styles.badge}>대표</span>}
              <div className={styles.cellBar}>
                <button type="button" className={styles.iconBtn} disabled={busy || idx === 0}
                  onClick={() => move(idx, -1)} aria-label="앞으로">◀</button>
                <button type="button" className={styles.iconBtn} disabled={busy || idx === imgs.length - 1}
                  onClick={() => move(idx, 1)} aria-label="뒤로">▶</button>
                <button type="button" className={styles.iconBtn} disabled={busy || img.is_thumbnail}
                  onClick={() => setThumbnail(img.id)} aria-label="대표 지정">★</button>
                <button type="button" className={`${styles.iconBtn} ${styles.del}`} disabled={busy}
                  onClick={() => remove(img.id)} aria-label="삭제">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {err && <p className={styles.err}>{err}</p>}
    </div>
  );
}

export default SearchPhotoManager;
