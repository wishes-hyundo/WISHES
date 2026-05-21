'use client';

/**
 * SearchEditModal — 매물 수정 폼 (SW-5a)
 *
 * 상세모달 '매물 수정' 진입. 변경된 필드만 PUT /api/admin/listings-field-update.
 * iOS 26.5 글래스. 사진 관리·신규 등록은 후속(SW-5b/c).
 * 기준: ★search_완전기능명세서.md §5-4.
 */

import { useEffect, useState } from 'react';
import type { SearchListing } from '../types';
import styles from './SearchEditModal.module.css';

export interface SearchEditModalProps {
  listing: SearchListing;
  onClose: () => void;
  onSaved?: (id: number) => void;
}

type FieldDef = {
  key: string;
  label: string;
  kind: 'text' | 'num' | 'select' | 'textarea';
  opts?: string[];
  full?: boolean;
};

const FIELDS: FieldDef[] = [
  { key: 'status', label: '상태', kind: 'select', opts: ['공개', '비공개', '계약중', '계약완료'] },
  { key: 'deal', label: '거래유형', kind: 'select', opts: ['월세', '전세', '전월세', '매매'] },
  { key: 'type', label: '매물종류', kind: 'select', opts: ['원룸', '오피스텔', '아파트', '사무실', '상가', '빌라', '토지'] },
  { key: 'building_name', label: '건물명', kind: 'text' },
  { key: 'title', label: '제목', kind: 'text', full: true },
  { key: 'address', label: '주소', kind: 'text', full: true },
  { key: 'address_detail', label: '동·호수', kind: 'text' },
  { key: 'direction', label: '방향', kind: 'text' },
  { key: 'deposit', label: '보증금(만원)', kind: 'num' },
  { key: 'monthly', label: '월세(만원)', kind: 'num' },
  { key: 'price', label: '매매가(만원)', kind: 'num' },
  { key: 'maintenance_fee', label: '관리비(만원)', kind: 'num' },
  { key: 'area_m2', label: '전용면적(㎡)', kind: 'num' },
  { key: 'built_year', label: '준공', kind: 'text' },
  { key: 'floor_current', label: '해당층', kind: 'text' },
  { key: 'floor_total', label: '총층', kind: 'text' },
  { key: 'rooms', label: '방 수', kind: 'num' },
  { key: 'bathrooms', label: '욕실 수', kind: 'num' },
  { key: 'available_date', label: '입주가능', kind: 'text' },
  { key: 'description', label: '상세설명', kind: 'textarea', full: true },
];

export function SearchEditModal({ listing, onClose, onSaved }: SearchEditModalProps) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    FIELDS.forEach((f) => {
      const v = (listing as Record<string, unknown>)[f.key];
      o[f.key] = v == null ? '' : String(v);
    });
    return o;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, saving]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    setErr('');
    const fields: Record<string, unknown> = {};
    FIELDS.forEach((f) => {
      const cur = form[f.key] ?? '';
      const origVal = (listing as Record<string, unknown>)[f.key];
      const origStr = origVal == null ? '' : String(origVal);
      if (cur === origStr) return;
      if (f.kind === 'num') fields[f.key] = cur.trim() === '' ? null : Number(cur);
      else fields[f.key] = cur.trim() === '' ? null : cur;
    });
    if (Object.keys(fields).length === 0) { onClose(); return; }
    try {
      const res = await fetch('/api/admin/listings-field-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: listing.id, fields }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        setErr(j?.error || (res.status === 401 || res.status === 403
          ? '로그인이 필요합니다.' : `저장 실패 (${res.status})`));
        setSaving(false);
        return;
      }
      onSaved?.(listing.id);
      onClose();
    } catch {
      setErr('저장 중 오류가 발생했습니다.');
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={() => { if (!saving) onClose(); }} role="dialog" aria-modal="true">
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>매물 수정 · {listing.id}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className={styles.body}>
          <div className={styles.grid}>
            {FIELDS.map((f) => (
              <div key={f.key} className={`${styles.field} ${f.full ? styles.full : ''}`}>
                <label className={styles.label} htmlFor={`ef-${f.key}`}>{f.label}</label>
                {f.kind === 'select' ? (
                  <select
                    id={`ef-${f.key}`}
                    className={styles.select}
                    value={form[f.key] ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                  >
                    <option value="">선택 안 함</option>
                    {f.opts?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.kind === 'textarea' ? (
                  <textarea
                    id={`ef-${f.key}`}
                    className={styles.textarea}
                    value={form[f.key] ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                ) : (
                  <input
                    id={`ef-${f.key}`}
                    className={styles.input}
                    type={f.kind === 'num' ? 'number' : 'text'}
                    value={form[f.key] ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        {err && <div className={styles.err}>{err}</div>}
        <div className={styles.footer}>
          <button type="button" className={styles.btn} onClick={onClose} disabled={saving}>취소</button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={save}
            disabled={saving}
          >{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  );
}

export default SearchEditModal;
