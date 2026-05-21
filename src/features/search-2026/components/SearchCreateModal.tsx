'use client';

/**
 * SearchCreateModal — 신규 매물 등록 폼 (SW-5c)
 *
 * 결과 헤더 '+ 매물 등록' 진입. POST /api/admin/listings (JSON).
 * iOS 26.5 글래스. SearchEditModal 과 스타일 공유.
 * 기준: ★search_완전기능명세서.md §5-4 / createListingSchema (route.ts).
 */

import { useEffect, useState } from 'react';
import styles from './SearchEditModal.module.css';

export interface SearchCreateModalProps {
  onClose: () => void;
  onCreated?: (id: number) => void;
}

type FieldDef = {
  key: string;
  label: string;
  kind: 'text' | 'num' | 'select' | 'textarea';
  opts?: string[];
  full?: boolean;
  required?: boolean;
};

// type 은 createListingSchema enum 과 일치해야 함 (route.ts L37)
const FIELDS: FieldDef[] = [
  { key: 'type', label: '매물종류', kind: 'select', required: true,
    opts: ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'] },
  { key: 'deal', label: '거래유형', kind: 'select', required: true,
    opts: ['전세', '월세', '매매'] },
  { key: 'title', label: '제목', kind: 'text', full: true, required: true },
  { key: 'address', label: '주소', kind: 'text', full: true, required: true },
  { key: 'address_detail', label: '동·호수', kind: 'text' },
  { key: 'building_name', label: '건물명', kind: 'text' },
  { key: 'direction', label: '방향', kind: 'text' },
  { key: 'deposit', label: '보증금(만원)', kind: 'num' },
  { key: 'monthly', label: '월세(만원)', kind: 'num' },
  { key: 'price', label: '매매가(만원)', kind: 'num' },
  { key: 'maintenance_fee', label: '관리비(만원)', kind: 'num' },
  { key: 'area_m2', label: '전용면적(㎡)', kind: 'num' },
  { key: 'floor_current', label: '해당층', kind: 'text' },
  { key: 'floor_total', label: '총층', kind: 'text' },
  { key: 'rooms', label: '방 수', kind: 'num' },
  { key: 'bathrooms', label: '욕실 수', kind: 'num' },
  { key: 'built_year', label: '준공', kind: 'text' },
  { key: 'available_date', label: '입주가능', kind: 'text' },
  { key: 'description', label: '상세설명', kind: 'textarea', full: true },
];

export function SearchCreateModal({ onClose, onCreated }: SearchCreateModalProps) {
  const [form, setForm] = useState<Record<string, string>>({});
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
    setErr('');
    // 필수값 검증
    const missing = FIELDS.filter((f) => f.required && !(form[f.key] ?? '').trim());
    if (missing.length) {
      setErr(`필수 항목을 입력해주세요: ${missing.map((m) => m.label).join(', ')}`);
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {};
    FIELDS.forEach((f) => {
      const cur = (form[f.key] ?? '').trim();
      if (cur === '') return;
      payload[f.key] = f.kind === 'num' ? Number(cur) : cur;
    });
    try {
      const res = await fetch('/api/admin/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || (j as { success?: boolean }).success === false) {
        const jErr = (j as { error?: string }).error;
        setErr(jErr || (res.status === 401 || res.status === 403
          ? '로그인이 필요합니다.' : `등록 실패 (${res.status})`));
        setSaving(false);
        return;
      }
      const newId = (j as { data?: { id?: number } }).data?.id;
      if (typeof newId === 'number') onCreated?.(newId);
      onClose();
    } catch {
      setErr('등록 중 오류가 발생했습니다.');
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={() => { if (!saving) onClose(); }} role="dialog" aria-modal="true">
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>새 매물 등록</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className={styles.body}>
          <div className={styles.grid}>
            {FIELDS.map((f) => (
              <div key={f.key} className={`${styles.field} ${f.full ? styles.full : ''}`}>
                <label className={styles.label} htmlFor={`cf-${f.key}`}>
                  {f.label}{f.required ? <span className={styles.req}> *</span> : null}
                </label>
                {f.kind === 'select' ? (
                  <select
                    id={`cf-${f.key}`}
                    className={styles.select}
                    value={form[f.key] ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                  >
                    <option value="">선택</option>
                    {f.opts?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.kind === 'textarea' ? (
                  <textarea
                    id={`cf-${f.key}`}
                    className={styles.textarea}
                    value={form[f.key] ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                ) : (
                  <input
                    id={`cf-${f.key}`}
                    className={styles.input}
                    type={f.kind === 'num' ? 'number' : 'text'}
                    value={form[f.key] ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
          <p className={styles.hint}>사진 등록은 매물 생성 후 상세 화면에서 추가할 수 있습니다.</p>
        </div>
        {err && <div className={styles.err}>{err}</div>}
        <div className={styles.footer}>
          <button type="button" className={styles.btn} onClick={onClose} disabled={saving}>취소</button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={save}
            disabled={saving}
          >{saving ? '등록 중…' : '매물 등록'}</button>
        </div>
      </div>
    </div>
  );
}

export default SearchCreateModal;
