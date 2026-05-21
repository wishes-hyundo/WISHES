'use client';

/**
 * SearchActionBar — /search 중개사 하단 액션 바 (P6-1)
 *
 * 항상 표시. 전체선택/해제 · 선택 건수 · 엑셀(CSV) · 인쇄(선택분).
 * 비교·관심목록·AI브리핑은 P6-2 이후.
 * 기준: ★search_완전기능명세서.md §5-1.
 */

import type { SearchListing } from '../types';
import styles from './SearchActionBar.module.css';

export interface SearchActionBarProps {
  selected: SearchListing[];
  totalVisible: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  onCompare: () => void;
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLS: Array<[string, (l: SearchListing) => unknown]> = [
  ['매물번호', (l) => l.id],
  ['거래', (l) => l.deal],
  ['매물종류', (l) => l.type],
  ['주소', (l) => l.address],
  ['동/호', (l) => [l.building_dong, l.building_ho].filter(Boolean).join(' ') || l.address_detail],
  ['도로명', (l) => l.road_address],
  ['면적(㎡)', (l) => l.area_m2],
  ['층', (l) => [l.floor_current, l.floor_total].filter((v) => v != null).join('/')],
  ['보증금', (l) => l.deposit],
  ['월세', (l) => l.monthly],
  ['매매가', (l) => l.price],
  ['관리비', (l) => l.maintenance_fee],
  ['건물명', (l) => l.building_name],
  ['준공', (l) => l.built_year],
];

function exportCsv(rows: SearchListing[]): void {
  if (rows.length === 0) return;
  const head = CSV_COLS.map((c) => csvCell(c[0])).join(',');
  const body = rows.map((l) => CSV_COLS.map((c) => csvCell(c[1](l))).join(',')).join('\n');
  const csv = `﻿${head}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `WISHES_매물_${rows.length}건_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function esc(v: unknown): string {
  return String(v ?? '').replace(/[<>&]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c
  ));
}

function printRows(rows: SearchListing[]): void {
  if (rows.length === 0) return;
  const w = window.open('', '_blank', 'width=960,height=720');
  if (!w) return;
  const body = rows.map((l) => (
    `<tr><td>${l.id}</td><td>${esc(l.deal)}</td><td>${esc(l.type)}</td>` +
    `<td>${esc(l.address)} ${esc(l.address_detail ?? '')}</td>` +
    `<td>${esc(l.area_m2)}</td><td>${esc(l.building_name)}</td></tr>`
  )).join('');
  w.document.write(
    `<html><head><title>WISHES 매물 ${rows.length}건</title><style>` +
    `body{font-family:-apple-system,'Malgun Gothic',sans-serif;padding:26px;color:#1c2a22}` +
    `h2{font-size:17px;margin:0 0 14px}` +
    `table{width:100%;border-collapse:collapse;font-size:12px}` +
    `th,td{border:1px solid #cbd3cc;padding:7px 9px;text-align:left}` +
    `th{background:#eef2ee}</style></head><body>` +
    `<h2>WISHES 선택 매물 ${rows.length}건</h2><table><thead><tr>` +
    `<th>매물번호</th><th>거래</th><th>종류</th><th>주소</th><th>면적㎡</th><th>건물명</th>` +
    `</tr></thead><tbody>${body}</tbody></table></body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* noop */ } }, 350);
}

export function SearchActionBar({
  selected, totalVisible, allSelected, onToggleAll, onClear, onCompare,
}: SearchActionBarProps) {
  const n = selected.length;
  return (
    <div className={styles.bar}>
      <button type="button" className={styles.selToggle} onClick={onToggleAll}>
        <span className={`${styles.box} ${allSelected ? styles.boxOn : ''}`}>
          {allSelected ? '✓' : ''}
        </span>
        전체선택
      </button>
      <span className={styles.count}>
        {n > 0 ? `${n}건 선택` : `${totalVisible.toLocaleString()}건`}
      </span>
      {n > 0 && (
        <button type="button" className={styles.clear} onClick={onClear}>해제</button>
      )}
      <span className={styles.spacer} />
      <button
        type="button"
        className={styles.act}
        disabled={n < 2}
        onClick={onCompare}
      >⊞ 비교</button>
      <button
        type="button"
        className={styles.act}
        disabled={n === 0}
        onClick={() => printRows(selected)}
      >🖨 인쇄</button>
      <button
        type="button"
        className={`${styles.act} ${styles.actPrimary}`}
        disabled={n === 0}
        onClick={() => exportCsv(selected)}
      >⤓ 엑셀</button>
    </div>
  );
}

export default SearchActionBar;
