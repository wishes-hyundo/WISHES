'use client';

/**
 * ListingCard — /search 재구축 매물 카드 (P3)
 *
 * iOS 앱 톤 + 정보 밀도. 중개사가 한눈에 핵심을 보도록:
 *   거래유형 · 주소 · 가격 · 면적/층/종류/준공 · 관리비(포함내역) · 주차·반려동물·옵션.
 * 조밀하게 — 한 화면에 더 많은 매물. 명세서 §3-6.
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

function builtYearText(l: SearchListing): string {
  const m = String(l.built_year ?? '').match(/\d{4}/);
  return m ? `${m[0]}년` : '';
}

/** 관리비 — 금액 + 포함 내역 한 줄 */
function maintenanceText(l: SearchListing): string {
  const fee = l.maintenance_fee;
  if (fee == null || fee <= 0) return '관리비 없음';
  let t = `관리비 ${fee.toLocaleString()}만`;
  const inc = l.maintenance_includes;
  if (Array.isArray(inc) && inc.length) t += ` · ${inc.join('·')} 포함`;
  return t;
}

export function ListingCard({ listing, onClick }: ListingCardProps) {
  const thumb = listing.listing_images?.[0]?.url || listing.thumbnail_url || null;
  const addr = listing.address || listing.title || '주소 미상';
  const sub = [formatArea(listing), formatFloor(listing), listing.type, builtYearText(listing)]
    .filter(Boolean)
    .join(' · ');

  const tags: string[] = [];
  if (listing.parking_spaces != null && listing.parking_spaces > 0) tags.push(`주차 ${listing.parking_spaces}대`);
  else if (listing.parking) tags.push('주차 가능');
  if (listing.pet) tags.push('반려동물');
  if (listing.full_option) tags.push('풀옵션');
  if (listing.elevator) tags.push('E/V');
  if (listing.balcony) tags.push('발코니');
  if (listing.building_name) tags.push(String(listing.building_name));

  const noMaint = listing.maintenance_fee == null || listing.maintenance_fee <= 0;

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
        <div className={styles.topRow}>
          <span className={`${styles.deal} ${DEAL_TONE[listing.deal || ''] || ''}`}>
            {listing.deal || '거래'}
          </span>
          <span className={styles.addr}>{addr}</span>
          <span className={styles.price}>{formatPrice(listing)}</span>
        </div>
        {sub && <div className={styles.sub}>{sub}</div>}
        <div className={`${styles.maint} ${noMaint ? styles.maintNone : ''}`}>
          {maintenanceText(listing)}
        </div>
        {tags.length > 0 && (
          <div className={styles.tags}>
            {tags.slice(0, 6).map((t, i) => (
              <span key={i} className={styles.tag}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

export default ListingCard;
