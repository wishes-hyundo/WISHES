'use client';

/**
 * SearchFavoritesModal — 관심 매물 목록 (P6-2)
 *
 * 액션 바 '관심+' 로 담은 매물을 목록으로. 항목별 제거.
 * iOS 26.5 글래스. 기준: ★search_완전기능명세서.md §5-1.
 */

import { useEffect } from 'react';
import type { SearchListing } from '../types';
import { priceLines } from '../format';
import styles from './SearchFavoritesModal.module.css';

export interface SearchFavoritesModalProps {
  listings: SearchListing[];
  onClose: () => void;
  onRemove: (id: number) => void;
}

export function SearchFavoritesModal({ listings, onClose, onRemove }: SearchFavoritesModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>관심 목록 {listings.length}건</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">✕</button>
        </div>
        {listings.length === 0 ? (
          <p className={styles.empty}>담긴 관심 매물이 없습니다.<br />매물을 선택하고 ‘관심+’ 를 눌러보세요.</p>
        ) : (
          <div className={styles.list}>
            {listings.map((l) => {
              const price = priceLines(l).map((p) => p.value).join(' / ');
              const sub = [l.type, l.deal, `매물 ${l.id}`].filter(Boolean).join(' · ');
              return (
                <div key={l.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowAddr}>
                      {l.address || l.title || '주소 미상'}
                      {l.address_detail ? ` ${l.address_detail}` : ''}
                    </div>
                    <div className={styles.rowSub}>{sub}</div>
                  </div>
                  <span className={styles.rowPrice}>{price}</span>
                  <button
                    type="button"
                    className={styles.rm}
                    onClick={() => onRemove(l.id)}
                    aria-label="관심 해제"
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchFavoritesModal;
