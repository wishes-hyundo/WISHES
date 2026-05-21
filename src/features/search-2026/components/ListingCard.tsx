'use client';

/**
 * ListingCard — /search 재구축 매물 카드 (P3)
 *
 * iOS 앱 톤 + 정보 밀도. 한눈에:
 *   출처(G/O 포인트) · 거래유형 · 주소 · 매물번호 · 가격 · 관리비 ·
 *   면적/층/종류/준공 · 입주조건 · 주차·반려동물·옵션.
 * 명세서 §3-6.
 */

import type { SearchListing } from '../types';
import { formatArea, formatFloor, priceLines } from '../format';
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

/** 수집 출처 — 아는 사람만 알아보는 작은 포인트. 공실클럽=G · 온하우스=O · 자체=없음 */
function sourceLetter(site?: string | null): string | null {
  const s = String(site || '').toLowerCase();
  if (s.includes('gongsil')) return 'G';
  if (s.includes('onhouse')) return 'O';
  return null;
}

/** 주소 + 동/호수 — 중복 없이 결합 */
function fullAddr(l: SearchListing): string {
  const base = l.address || l.title || '주소 미상';
  const detail = [l.building_dong, l.building_ho].filter(Boolean).join(' ').trim()
    || String(l.address_detail ?? '').trim();
  if (detail && !base.includes(detail)) return `${base} ${detail}`;
  return base;
}

function builtYearText(l: SearchListing): string {
  const m = String(l.built_year ?? '').match(/\d{4}/);
  return m ? `${m[0]}년` : '';
}

function maintenanceText(l: SearchListing): string {
  const fee = l.maintenance_fee;
  if (fee == null || fee <= 0) return '관리비 없음';
  let t = `관리비 ${fee.toLocaleString()}만`;
  const inc = l.maintenance_includes;
  if (Array.isArray(inc) && inc.length) t += ` · ${inc.join('·')} 포함`;
  return t;
}

/** 입주 조건 — 즉시입주(공실) / 입주일 / 협의 */
function moveIn(l: SearchListing): { text: string; urgent: boolean } | null {
  const v = String(l.available_date ?? l.available_from ?? '').trim();
  if (!v) return null;
  if (/즉시|공실|바로/.test(v)) return { text: '즉시입주', urgent: true };
  if (/협의/.test(v)) return { text: '입주협의', urgent: false };
  const dm = v.match(/(\d{2,4})[.\-/년\s]+(\d{1,2})/);
  if (dm) return { text: `${dm[1].slice(-2)}.${dm[2].padStart(2, '0')} 입주`, urgent: false };
  return { text: v.length > 9 ? v.slice(0, 9) : v, urgent: false };
}

export function ListingCard({ listing, onClick }: ListingCardProps) {
  const thumb = listing.listing_images?.[0]?.url || listing.thumbnail_url || null;
  const addr = fullAddr(listing);
  const srcLetter = sourceLetter(listing.source_site);
  const sub = [formatArea(listing), formatFloor(listing), listing.type, builtYearText(listing)]
    .filter(Boolean)
    .join(' · ');
  const mv = moveIn(listing);
  const noMaint = listing.maintenance_fee == null || listing.maintenance_fee <= 0;
  const lines = priceLines(listing);

  const tags: string[] = [];
  if (listing.parking_spaces != null && listing.parking_spaces > 0) tags.push(`주차 ${listing.parking_spaces}대`);
  else if (listing.parking) tags.push('주차 가능');
  if (listing.pet) tags.push('반려동물');
  if (listing.full_option) tags.push('풀옵션');
  if (listing.elevator) tags.push('E/V');
  if (listing.balcony) tags.push('발코니');
  if (listing.building_name) tags.push(String(listing.building_name));

  return (
    <button type="button" className={styles.card} onClick={() => onClick?.(listing.id)}>
      <div className={styles.thumb}>
        {thumb ? (
          <img src={thumb} alt="" className={styles.thumbImg} loading="lazy" />
        ) : (
          <span className={styles.thumbEmpty} aria-hidden="true">🏠</span>
        )}
        {srcLetter && <span className={styles.srcDot} aria-hidden="true">{srcLetter}</span>}
      </div>

      <div className={styles.body}>
        <div className={styles.topRow}>
          <span className={`${styles.deal} ${DEAL_TONE[listing.deal || ''] || ''}`}>
            {listing.deal || '거래'}
          </span>
          <span className={styles.addr}>{addr}</span>
        </div>
        {sub && <div className={styles.sub}>{sub}</div>}
        <div className={styles.tags}>
          {mv && (
            <span className={`${styles.tag} ${mv.urgent ? styles.tagMoveUrgent : styles.tagMove}`}>
              {mv.text}
            </span>
          )}
          {tags.slice(0, 6).map((t, i) => (
            <span key={i} className={styles.tag}>{t}</span>
          ))}
        </div>
      </div>

      <div className={styles.priceCol}>
        <span className={styles.listingNo}>매물 {listing.id}</span>
        {lines.length === 1 ? (
          <span className={styles.price}>{lines[0].value}</span>
        ) : (
          <span className={styles.priceLines}>
            {lines.map((pl, i) => (
              <span key={i} className={styles.priceLine}>
                <span className={styles.priceDeal}>{pl.deal}</span>
                <span className={styles.priceMulti}>{pl.value}</span>
              </span>
            ))}
          </span>
        )}
        <span className={`${styles.maint} ${noMaint ? styles.maintNone : ''}`}>
          {maintenanceText(listing)}
        </span>
      </div>
    </button>
  );
}

export default ListingCard;
