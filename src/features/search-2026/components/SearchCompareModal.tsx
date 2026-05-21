'use client';

/**
 * SearchCompareModal — 매물 비교 모달 (P6-2)
 *
 * 선택한 매물 2~5건을 속성별 표로 나란히 비교.
 * iOS 26.5 글래스. 첫 열·헤더 sticky. 기준: ★search_완전기능명세서.md §5-1.
 */

import { useEffect } from 'react';
import type { SearchListing } from '../types';
import { formatArea, formatFloor, priceLines } from '../format';
import styles from './SearchCompareModal.module.css';

export interface SearchCompareModalProps {
  listings: SearchListing[];
  onClose: () => void;
}

const ROWS: Array<[string, (l: SearchListing) => string]> = [
  ['거래', (l) => l.deal || '-'],
  ['가격', (l) => priceLines(l).map((p) => p.value).join(' / ') || '-'],
  ['관리비', (l) => (l.maintenance_fee != null && l.maintenance_fee > 0
    ? `${l.maintenance_fee.toLocaleString()}만원` : '없음')],
  ['매물종류', (l) => l.type || '-'],
  ['면적', (l) => formatArea(l) || '-'],
  ['층', (l) => formatFloor(l) || '-'],
  ['방/욕실', (l) => [
    l.rooms != null ? `방 ${l.rooms}` : '',
    l.bathrooms != null ? `욕실 ${l.bathrooms}` : '',
  ].filter(Boolean).join(' · ') || '-'],
  ['방향', (l) => l.direction || '-'],
  ['준공', (l) => {
    const m = String(l.built_year ?? '').match(/\d{4}/);
    return m ? `${m[0]}년` : '-';
  }],
  ['주차', (l) => (l.parking_spaces != null && l.parking_spaces > 0
    ? `${l.parking_spaces}대` : l.parking ? '가능' : '-')],
  ['엘리베이터', (l) => (l.elevator ? 'O' : '-')],
  ['반려동물', (l) => (l.pet ? 'O' : '-')],
  ['풀옵션', (l) => (l.full_option ? 'O' : '-')],
  ['건물명', (l) => l.building_name || '-'],
  ['주소', (l) => l.address || '-'],
];

export function SearchCompareModal({ listings, onClose }: SearchCompareModalProps) {
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

  const cols = listings.slice(0, 5);

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>매물 비교 {cols.length}건</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">✕</button>
        </div>
        {cols.length < 2 ? (
          <p className={styles.notice}>비교하려면 매물을 2건 이상 선택하세요. (최대 5건)</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={`${styles.rowLabel} ${styles.cornerCell}`} />
                  {cols.map((l) => (
                    <th key={l.id} className={styles.colHead}>매물 {l.id}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, fn]) => (
                  <tr key={label}>
                    <td className={styles.rowLabel}>{label}</td>
                    {cols.map((l) => (
                      <td key={l.id} className={styles.cell}>{fn(l)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchCompareModal;
