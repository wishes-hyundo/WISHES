'use client';

/**
 * ListingCard — /search 재구축 매물 카드 (P3)
 *
 * iOS 앱 톤의 깔끔한 가로형 카드 — 썸네일 · 거래유형 · 주소 · 정보 · 태그 · 가격.
 * 명세서 §3-6 기준. 중개사 도구(상태변경·수정·삭제·다중선택)는 P6 후속.
 */

import type { SearchListing } from '../types';
import { formatArea, formatFloor, formatPrice } from '../format';
import styles from './ListingCard.module.css';

export interface ListingCardProps {
  listing: SearchListing;
  onClick?: (id: number) => void;
}

const DEAL_TONE: Record<string, string> = {
  매매: styles.dealSale,
  전세: styles.dealJeonse,
  월세: styles.dealMonthly,
  전월세: styles.dealMonthly,
};

export function ListingCard({ listing, onClick }: ListingCardProps) {
  const thumb = listing.listing_images?.[0]?.url || listing.thumbnail_url || null;
  const addr = listing.address || listing.title || '주소 미상';
  const sub = [formatArea(listing), formatFloor(listing), listing.type]
    .filter(Boolean)
    .join(' · ');
  const tags: string[] = [];
  if (listing.rooms != null) tags.push(`방 ${listing.rooms}`);
  if (listing.parking) tags.push('주차');
  if (listing.elevator) tags.push('E/V');
  if (listing.building_name) tags.push(String(listing.building_name));

  return (
    <button type="button" className={styles.card} onClick={() => onClick?.(listing.id)}>
      <div className={styles.thumb}>
        {thumb ? (
          <img src={thumb} alt="" className={styles.thumbImg} loading="lazy" />
        ) : (
          <span className={styles.thumbEmpty} aria-hidden="true">🏠</span>
        )}
      </div>

      <div className={styles.body}>
        <span className={`${styles.deal} ${DEAL_TONE[listing.deal || ''] || ''}`}>
          {listing.deal || '거래'}
        </span>
        <div className={styles.addr}>{addr}</div>
        {sub && <div className={styles.sub}>{sub}</div>}
        {tags.length > 0 && (
          <div className={styles.tags}>
            {tags.slice(0, 4).map((t, i) => (
              <span key={i} className={styles.tag}>{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.priceCol}>
        <span className={styles.price}>{formatPrice(listing)}</span>
        {listing.maintenance_fee != null && listing.maintenance_fee > 0 && (
          <span className={styles.maint}>관리 {listing.maintenance_fee.toLocaleString()}만</span>
        )}
      </div>
    </button>
  );
}

export default ListingCard;
