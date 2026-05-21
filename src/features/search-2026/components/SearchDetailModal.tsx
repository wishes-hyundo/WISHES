'use client';

/**
 * SearchDetailModal — /search 매물 상세 모달 (P4)
 *
 * iOS 26.5 앱 스타일. 모바일=하단 바텀시트 / 데스크탑=센터 모달.
 * 레거시 상세 페이지 구조 참조: 갤러리 → HERO → 거래정보 → 매물 정보 →
 * 시설·옵션 → 상세설명 → 위치 → 하단 고정 전화/문자 문의 바.
 * 닫기 3방법(✕·배경·ESC). 기준: ★search_완전기능명세서.md §4.
 */

import { useEffect, useState } from 'react';
import type { SearchListing } from '../types';
import { useListingDetail } from '../hooks';
import { formatArea, formatFloor, priceLines } from '../format';
import styles from './SearchDetailModal.module.css';

export interface SearchDetailModalProps {
  listing?: SearchListing | null;
  id?: number | null;
  onClose: () => void;
  /** 유사매물 풀 (목록) */
  pool?: SearchListing[];
  /** 유사매물 클릭 시 해당 매물로 모달 전환 */
  onOpenListing?: (l: SearchListing) => void;
  /** 매물 수정 진입 */
  onEdit?: (l: SearchListing) => void;
}

const DEAL_TONE: Record<string, string> = {
  매매: styles.dealSale,
  전세: styles.dealJeonse,
  월세: styles.dealMonthly,
  전월세: styles.dealMonthly,
};

type Cell = { label: string; value: string };

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

function boolText(v: unknown): string {
  if (v === true) return '가능';
  if (v == null || v === false || v === '') return '';
  return String(v).trim();
}

const MEMO_TAGS = [
  '✅즉시입주', '🔑열쇠보관', '📞연락완료', '👀현장확인필요',
  '💰가격협의가능', '🔨수리필요', '⭐추천매물', '🚫계약불가',
  '📸사진촬영필요', '🏗️리모델링', '👤집주인직거래', '📋서류확인중',
];

function fmtDate(v: unknown): string {
  const t = String(v ?? '').trim();
  if (!t) return '';
  return t.slice(0, 16).replace('T', ' ');
}

export function SearchDetailModal({
  listing, id, onClose, pool, onOpenListing, onEdit,
}: SearchDetailModalProps) {
  const [fav, setFav] = useState(false);
  const [copied, setCopied] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [memo, setMemo] = useState('');
  const [memoTags, setMemoTags] = useState<string[]>([]);
  const open = listing != null || id != null;
  const activeId = listing?.id ?? id ?? null;

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

  // 매물별 중개사 메모 — localStorage 로드 (매물 전환 시 갱신)
  useEffect(() => {
    if (activeId == null) return;
    try {
      const raw = localStorage.getItem(`wishes-memo-${activeId}`);
      if (raw) {
        const o = JSON.parse(raw) as { memo?: string; tags?: string[] };
        setMemo(o.memo ?? '');
        setMemoTags(Array.isArray(o.tags) ? o.tags : []);
      } else {
        setMemo('');
        setMemoTags([]);
      }
    } catch {
      setMemo('');
      setMemoTags([]);
    }
  }, [activeId]);

  if (!open) return null;

  const l: SearchListing | null = listing ?? detail.data ?? null;

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

  const mk = (label: string, value: string | number | null | undefined): Cell | null => {
    const v = value == null ? '' : String(value).trim();
    return v ? { label, value: v } : null;
  };
  const compact = (arr: Array<Cell | null>): Cell[] => arr.filter((c): c is Cell => c != null);

  // 거래 정보
  const dealCells = compact([
    mk('거래유형', l.deal),
    mk('관리비', l.maintenance_fee != null && l.maintenance_fee > 0
      ? `${l.maintenance_fee.toLocaleString()}만원` : '없음'),
    mk('관리비 포함', Array.isArray(l.maintenance_includes) && l.maintenance_includes.length
      ? l.maintenance_includes.join(' · ') : ''),
    mk('입주가능', moveInText(l)),
    mk('융자금', boolText(l.loan_available)),
    mk('권리금', l.goodwill_fee != null && l.goodwill_fee > 0
      ? `${l.goodwill_fee.toLocaleString()}만원` : ''),
    mk('업종', l.business_type),
  ]);

  // 매물 정보
  const propCells = compact([
    mk('매물종류', l.type),
    mk('전용면적', formatArea(l)),
    mk('공급면적', l.area_supply_m2 ? `${l.area_supply_m2}㎡` : ''),
    mk('층', formatFloor(l)),
    mk('방 수', l.rooms != null ? `${l.rooms}개` : ''),
    mk('욕실 수', l.bathrooms != null ? `${l.bathrooms}개` : ''),
    mk('방향', l.direction),
    mk('사용승인', builtYear(l)),
    mk('건물명', l.building_name),
    mk('동/호', [l.building_dong, l.building_ho].filter(Boolean).join(' ') || l.address_detail),
  ]);

  // 시설 · 옵션 칩
  const chips: string[] = [];
  if (l.elevator) chips.push('엘리베이터');
  if (l.parking_spaces != null && l.parking_spaces > 0) chips.push(`주차 ${l.parking_spaces}대`);
  else if (l.parking) chips.push('주차 가능');
  if (l.full_option) chips.push('풀옵션');
  if (l.pet) chips.push('반려동물');
  if (l.balcony) chips.push('발코니');
  const opts = l.options;
  if (Array.isArray(opts)) {
    opts.forEach((o) => { const s = String(o).trim(); if (s) chips.push(s); });
  } else if (typeof opts === 'string') {
    opts.split(/[,·/]/).forEach((o) => { const s = o.trim(); if (s) chips.push(s); });
  }

  const descRaw = l['description'] ?? l['detail_description'] ?? l['특이사항'] ?? l['memo'];
  const desc = descRaw ? String(descRaw).trim() : '';

  // 비슷한 매물 — 종류·거래·동·면적·가격 근접도 스코어 상위 5건
  const similar: SearchListing[] = (() => {
    if (!pool || pool.length === 0) return [];
    const tA = l.area_m2 ?? 0;
    const tP = l.price ?? l.deposit ?? 0;
    return pool
      .filter((c) => c.id !== l.id)
      .map((c) => {
        let sc = 0;
        if (c.type && c.type === l.type) sc += 3;
        if (c.deal && c.deal === l.deal) sc += 2;
        if (c.dong && c.dong === l.dong) sc += 2;
        const cA = c.area_m2 ?? 0;
        if (tA && cA && Math.abs(cA - tA) / tA <= 0.35) sc += 2;
        const cP = c.price ?? c.deposit ?? 0;
        if (tP && cP && Math.abs(cP - tP) / tP <= 0.4) sc += 2;
        return { c, sc };
      })
      .filter((x) => x.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 5)
      .map((x) => x.c);
  })();

  const gridSection = (title: string, cells: Cell[]) => {
    if (cells.length === 0) return null;
    return (
      <div className={styles.section}>
        <h2 className={styles.secTitle}>{title}</h2>
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
    );
  };

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

          {gridSection('거래 정보', dealCells)}
          {gridSection('매물 정보', propCells)}

          {chips.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.secTitle}>시설 · 옵션</h2>
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

          <div className={styles.section}>
            <h2 className={styles.secTitle}>위치</h2>
            <p className={styles.desc}>{fullAddr(l)}</p>
            {road && <p className={styles.empty} style={{ marginTop: 4 }}>{road}</p>}
          </div>

          {similar.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.secTitle}>비슷한 매물</h2>
              <div className={styles.simList}>
                {similar.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={styles.simRow}
                    onClick={() => onOpenListing?.(s)}
                  >
                    <span className={styles.simAddr}>{s.address ?? s.title ?? `매물 ${s.id}`}</span>
                    <span className={styles.simMeta}>{[s.type, s.deal].filter(Boolean).join(" · ")}</span>
                    <span className={styles.simPrice}>{priceLines(s).map((p) => p.value).join(" / ")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            className={styles.agentToggle}
            onClick={() => setAgentOpen((v) => !v)}
            aria-expanded={agentOpen}
          >
            🔒 중개사 전용 정보 <span style={{ opacity: 0.6 }}>{agentOpen ? '▲' : '▼'}</span>
          </button>
          {agentOpen && (
            <div className={styles.agentBody}>
              {onEdit && (
                <button
                  type="button"
                  className={styles.editBtn}
                  onClick={() => onEdit(l)}
                >✏️ 매물 수정</button>
              )}
              <div className={styles.subHead}>등록 · 확인 이력</div>
              {[
                ['최초 등록', fmtDate(l.created_at)],
                ['최종 확인', fmtDate(l.last_verified_at)],
                ['최종 수정', fmtDate(l.updated_at)],
                ['등록자', String(l.created_by ?? '')],
              ].filter((r) => r[1]).map((r) => (
                <div key={r[0]} className={styles.histRow}>
                  <span className={styles.histLabel}>{r[0]}</span>
                  <span className={styles.histVal}>{r[1]}</span>
                </div>
              ))}

              <div className={styles.subHead}>매물 메모</div>
              <div className={styles.memoTags}>
                {MEMO_TAGS.map((tag) => {
                  const on = memoTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`${styles.memoTag} ${on ? styles.memoTagOn : ''}`}
                      onClick={() => {
                        const next = on
                          ? memoTags.filter((t) => t !== tag)
                          : [...memoTags, tag];
                        setMemoTags(next);
                        if (activeId != null) {
                          try {
                            localStorage.setItem(
                              `wishes-memo-${activeId}`,
                              JSON.stringify({ memo, tags: next }),
                            );
                          } catch { /* noop */ }
                        }
                      }}
                    >{tag}</button>
                  );
                })}
              </div>
              <textarea
                className={styles.memoBox}
                placeholder="이 매물에 대한 메모 (자동 저장)"
                value={memo}
                onChange={(e) => {
                  const v = e.target.value;
                  setMemo(v);
                  if (activeId != null) {
                    try {
                      localStorage.setItem(
                        `wishes-memo-${activeId}`,
                        JSON.stringify({ memo: v, tags: memoTags }),
                      );
                    } catch { /* noop */ }
                  }
                }}
              />

              <div className={styles.subHead}>원본 데이터</div>
              {[
                ['출처', String(l.source_site ?? '자체 매물')],
                ['매물 DB ID', String(l.id)],
                ['원본 URL', String(l['source_url'] ?? l['url'] ?? l['original_url'] ?? '')],
              ].filter((r) => r[1]).map((r) => (
                <div key={r[0]} className={styles.histRow}>
                  <span className={styles.histLabel}>{r[0]}</span>
                  <span className={styles.histVal}>{r[1]}</span>
                </div>
              ))}
              <p className={styles.empty} style={{ padding: '10px 0 2px' }}>
                관계자 연락처 관리는 매물 수정에서 제공됩니다.
              </p>
            </div>
          )}
        </div>

        <div className={styles.actionBar}>
          <button type="button" className={styles.actBtn}>📞 전화문의</button>
          <button type="button" className={`${styles.actBtn} ${styles.actBtnPrimary}`}>💬 문자문의</button>
        </div>
      </div>
    </div>
  );
}

export default SearchDetailModal;
