'use client';

/**
 * SearchDetailModal — /search 매물 상세 모달 (P4)
 *
 * iOS 26.5 앱 스타일. 모바일=하단 바텀시트 / 데스크탑=센터 모달.
 * 닫기 3방법(✕·배경·ESC) + body 스크롤 잠금.
 * 목록 카드 클릭 → listing 객체 직접 / 지도 마커 클릭 → id 로 단건 조회.
 * 기준: ★search_완전기능명세서.md §4.
 */

import { useEffect, useState } from 'react';
import type { SearchListing } from '../types';
import { useListingDetail } from '../hooks';
import { formatArea, formatFloor, priceLines } from '../format';
import styles from './SearchDetailModal.module.css';

export interface SearchDetailModalProps {
  /** 목록 카드에서 — 이미 가진 매물 객체 */
  listing?: SearchListing | null;
  /** 지도 마커에서 — id 로 단건 조회 */
  id?: number | null;
  onClose: () => void;
}

const DEAL_TONE: Record<string, string> = {
  매매: styles.dealSale,
  전세: styles.dealJeonse,
  월세: styles.dealMonthly,
  전월세: styles.dealMonthly,
};

function fullAddr(l: SearchListing): string {
  const base = String(l.address || l.title || '주소 미상').trim();
  const detail =
    [l.building_dong, l.building_ho].filter(Boolean).join(' ').trim() ||
    String(l.address_detail ?? '').trim();
  if (detail && !base.includes(detail)) return `${base} ${detail}`;
  return base;
}

function builtYear(l: SearchListing): string {
  const m = String(l.built_year ?? '').match(/\d{4}/);
  return m ? `${m[0]}년` : '';
}

function maintText(l: SearchListing): string {
  const fee = l.maintenance_fee;
  if (fee == null || fee <= 0) return '관리비 없음';
  let t = `관리비 ${fee.toLocaleString()}만원`;
  const inc = l.maintenance_includes;
  if (Array.isArray(inc) && inc.length) t += ` · ${inc.join('·')} 포함`;
  return t;
}

function moveInText(l: SearchListing): string {
  const v = String(l.available_date ?? l.available_from ?? '').trim();
  if (!v) return '';
  if (/즉시|공실|바로/.test(v)) return '즉시입주';
  if (/협의/.test(v)) return '입주협의';
  return v;
}

export function SearchDetailModal({ listing, id, onClose }: SearchDetailModalProps) {
  const [fav, setFav] = useState(false);
  const [copied, setCopied] = useState(false);
  const open = listing != null || id != null;

  // listing 객체가 있으면 조회 안 함. id 만 있으면 단건 조회.
  const detail = useListingDetail(listing ? null : id ?? null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const l: SearchListing | null = listing ?? detail.data ?? null;

  // 헤더 (로딩/에러 상태에서도 동일)
  const header = (numId: number | null) => (
    <div className={styles.head}>
      {numId != null ? (
        <button
          type="button"
          className={styles.no}
          onClick={() => {
            try {
              navigator.clipboard?.writeText(String(numId));
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            } catch { /* noop */ }
          }}
        >
          매물 {numId} {copied ? '✓ 복사됨' : '⧉'}
        </button>
      ) : <span />}
      <span className={styles.headSpacer} />
      <button
        type="button"
        className={`${styles.iconBtn} ${styles.fav} ${fav ? styles.on : ''}`}
        onClick={() => setFav((v) => !v)}
        aria-label="관심"
      >{fav ? '♥' : '♡'}</button>
      <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="닫기">✕</button>
    </div>
  );

  // 로딩 / 에러 — id 조회 중
  if (!l) {
    return (
      <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
        <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.grip} aria-hidden="true" />
          {header(id ?? null)}
          <div className={styles.scroll}>
            <p className={styles.empty} style={{ padding: '56px 18px', textAlign: 'center' }}>
              {detail.isError ? '매물 정보를 불러오지 못했습니다.' : '불러오는 중…'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const images = (l.listing_images ?? [])
    .map((im) => im?.url || im?.hero_url)
    .filter(Boolean) as string[];
  const hero = images[0] || l.thumbnail_url || null;

  const lines = priceLines(l);
  const road = String(l.road_address ?? '').trim();
  const status = String(l.status ?? '').trim();

  const cells: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: string | number | null | undefined) => {
    const v = value == null ? '' : String(value).trim();
    if (v) cells.push({ label, value: v });
  };
  push('매물종류', l.type);
  push('면적', formatArea(l));
  push('층', formatFloor(l));
  push(
    '방/욕실',
    [
      l.rooms != null ? `방 ${l.rooms}` : '',
      l.bathrooms != null ? `욕실 ${l.bathrooms}` : '',
    ].filter(Boolean).join(' · '),
  );
  push('방향', l.direction);
  push('준공', builtYear(l));
  push(
    '주차',
    l.parking_spaces != null && l.parking_spaces > 0
      ? `${l.parking_spaces}대`
      : l.parking ? '가능' : '',
  );
  push('입주가능', moveInText(l));
  push('건물명', l.building_name);
  push('업종', l.business_type);

  const chips: string[] = [];
  if (l.elevator) chips.push('엘리베이터');
  if (l.full_option) chips.push('풀옵션');
  if (l.pet) chips.push('반려동물');
  if (l.balcony) chips.push('발코니');
  if (l.loan_available) chips.push('대출가능');
  const opts = l.options;
  if (Array.isArray(opts)) {
    opts.forEach((o) => { const s = String(o).trim(); if (s) chips.push(s); });
  } else if (typeof opts === 'string') {
    opts.split(/[,·/]/).forEach((o) => { const s = o.trim(); if (s) chips.push(s); });
  }

  const descRaw = l['description'] ?? l['detail_description'] ?? l['특이사항'] ?? l['memo'];
  const desc = descRaw ? String(descRaw).trim() : '';

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.grip} aria-hidden="true" />
        {header(l.id)}

        <div className={styles.scroll}>
          <div className={styles.gallery}>
            {hero ? (
              <img src={hero} alt="" className={styles.galleryImg} />
            ) : (
              <span className={styles.galleryEmpty} aria-hidden="true">🏠</span>
            )}
            {images.length > 1 && (
              <span className={styles.photoCount}>사진 {images.length}</span>
            )}
          </div>

          <div className={styles.hero}>
            <div className={styles.dealRow}>
              {l.deal && (
                <span className={`${styles.deal} ${DEAL_TONE[l.deal] || styles.dealMonthly}`}>
                  {l.deal}
                </span>
              )}
              {status && <span className={styles.status}>{status}</span>}
            </div>
            <h1 className={styles.addr}>{fullAddr(l)}</h1>
            {road && <div className={styles.road}>{road}</div>}
            {l.building_name && <div className={styles.bldg}>🏢 {l.building_name}</div>}
          </div>

          <div className={styles.priceBox}>
            {lines.map((pl, i) => (
              <div key={i} className={styles.priceRow}>
                {lines.length > 1 && <span className={styles.priceDeal}>{pl.deal}</span>}
                <span className={styles.priceVal}>{pl.value}</span>
              </div>
            ))}
            <div className={styles.maint}>{maintText(l)}</div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.secTitle}>기본 정보</h2>
            <div className={styles.grid}>
              {cells.map((c, i) => (
                <div key={i} className={styles.cell}>
                  <div className={styles.cellLabel}>{c.label}</div>
                  <div className={styles.cellValue}>{c.value}</div>
                </div>
              ))}
              {cells.length % 2 === 1 && <div className={styles.cell} />}
            </div>
          </div>

          {chips.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.secTitle}>옵션 · 특징</h2>
              <div className={styles.chips}>
                {chips.map((c, i) => <span key={i} className={styles.chip}>{c}</span>)}
              </div>
            </div>
          )}

          <div className={styles.section}>
            <h2 className={styles.secTitle}>상세 설명</h2>
            {desc
              ? <p className={styles.desc}>{desc}</p>
              : <p className={styles.empty}>등록된 상세 설명이 없습니다.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SearchDetailModal;
