'use client';

/**
 * SearchBriefingModal — AI 매물 브리핑 (P6-3)
 *
 * 선택 매물(최대 10건)을 /api/ai/briefing (Claude API) 으로 보내
 * 매물별 요약·장점·고려사항·추천대상·캐치프레이즈를 받아 표시.
 * 실패 시 로컬 분석 fallback. 기준: ★search_완전기능명세서.md §5-1.
 */

import { useEffect, useState } from 'react';
import type { SearchListing } from '../types';
import { formatArea, priceLines } from '../format';
import styles from './SearchBriefingModal.module.css';

export interface SearchBriefingModalProps {
  listings: SearchListing[];
  onClose: () => void;
}

interface Briefing {
  listing_id: number;
  summary: string;
  pros: string[];
  cons: string[];
  recommendation: string;
  highlight: string;
}

function localBriefing(l: SearchListing): Briefing {
  const price = priceLines(l).map((p) => p.value).join(' / ');
  return {
    listing_id: l.id,
    summary: `${l.address ?? ''} ${l.type ?? ''} · ${l.deal ?? ''} ${price}, 전용 ${formatArea(l)}.`,
    pros: [
      l.elevator ? '엘리베이터 있음' : '',
      l.parking_spaces && l.parking_spaces > 0 ? `주차 ${l.parking_spaces}대` : l.parking ? '주차 가능' : '',
      l.full_option ? '풀옵션' : '',
      l.pet ? '반려동물 가능' : '',
    ].filter(Boolean),
    cons: [],
    recommendation: '',
    highlight: String(l.building_name ?? l.address ?? '추천 매물'),
  };
}

export function SearchBriefingModal({ listings, onClose }: SearchBriefingModalProps) {
  const [state, setState] = useState<'loading' | 'done'>('loading');
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [aiUsed, setAiUsed] = useState(false);

  const rows = listings.slice(0, 10);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ai/briefing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listings: rows.map((l) => ({
              id: l.id, title: l.title, type: l.type, deal: l.deal,
              price: l.price, deposit: l.deposit, monthly: l.monthly,
              maintenance_fee: l.maintenance_fee, area_m2: l.area_m2,
              floor_current: l.floor_current, floor_total: l.floor_total,
              rooms: l.rooms, bathrooms: l.bathrooms, direction: l.direction,
              address: l.address, parking: l.parking || l.parking_spaces,
              elevator: l.elevator, pet: l.pet, full_option: l.full_option,
              loan_available: l.loan_available, built_year: l.built_year,
            })),
          }),
        });
        const j = await res.json();
        if (cancelled) return;
        if (j?.success && Array.isArray(j.briefings) && j.briefings.length > 0) {
          setBriefings(j.briefings as Briefing[]);
          setAiUsed(true);
        } else {
          setBriefings(rows.map(localBriefing));
        }
      } catch {
        if (!cancelled) setBriefings(rows.map(localBriefing));
      }
      if (!cancelled) setState('done');
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addrOf = (id: number): string => {
    const l = rows.find((r) => r.id === id);
    return l ? `${l.address ?? l.title ?? ''} ${l.address_detail ?? ''}`.trim() : `매물 ${id}`;
  };

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>AI 브리핑</h2>
          {state === 'done' && (
            <span className={styles.badge}>{aiUsed ? 'AI 생성' : '즉시 분석'}</span>
          )}
          <span className={styles.spacer} />
          <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className={styles.scroll}>
          {state === 'loading' ? (
            <p className={styles.loading}>
              AI가 선택한 {rows.length}건을 분석하고 있습니다
              <span className={styles.dot}> ●</span>
            </p>
          ) : (
            briefings.map((b) => (
              <div key={b.listing_id} className={styles.bcard}>
                {b.highlight && <div className={styles.bhi}>“{b.highlight}”</div>}
                <div className={styles.baddr}>{addrOf(b.listing_id)}</div>
                {b.summary && <p className={styles.bsummary}>{b.summary}</p>}
                {b.pros && b.pros.length > 0 && (
                  <div className={styles.pros}>
                    {b.pros.map((p, i) => <span key={i} className={styles.pro}>{p}</span>)}
                  </div>
                )}
                {b.cons && b.cons.map((c, i) => <div key={i} className={styles.con}>{c}</div>)}
                {b.recommendation && <span className={styles.brec}>추천 · {b.recommendation}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchBriefingModal;
