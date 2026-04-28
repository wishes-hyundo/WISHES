'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminSession } from '@/lib/useAdminSession';
// L-sec147 (2026-04-23, C-2 phase 3b): adminFetch wrapper for CSRF + cookie + Bearer.
import { adminFetch } from '@/lib/adminFetch';

/* ─── 타입 정의 ─── */
interface Listing {
  id: number;
  title: string;
  address: string;
  address_detail?: string;
  dong: string;
  type: string;
  deal: string;          // DB: 'deal' (월세/전세/매매)
  price: number | null;  // DB: number (매매가, 만원)
  deposit: number | null; // DB: number (보증금, 만원)
  monthly: number | null; // DB: number (월세, 만원)
  maintenance_fee?: number;
  status: string;
  created_at: string;
  updated_at?: string;
  images?: string[];
  area_m2?: number;        // DB: area_m2
  area_supply_m2?: number; // DB: area_supply_m2
  floor_current?: string;  // DB: floor_current
  floor_total?: string;    // DB: floor_total
  rooms?: number;
  bathrooms?: number;
  direction?: string;
  description?: string;
  features?: string[];
  last_verified_at?: string | null;
}

type StatusFilter = '전체' | '공개' | '비공개' | '계약중' | '계약완료';
type SortField = 'id' | 'title' | 'address' | 'dong' | 'type' | 'deal' | 'price' | 'status' | 'created_at';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'table' | 'card';

/* ─── 상수 ─── */
const STATUS_OPTIONS: StatusFilter[] = ['전체', '공개', '비공개', '계약중', '계약완료'];

const STATUS_COLORS: Record<string, string> = {
  '공개': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '비공개': 'bg-slate-50 text-slate-600 border-slate-200',
  '계약중': 'bg-amber-50 text-amber-700 border-amber-200',
  '계약완료': 'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_ICONS: Record<string, string> = {
  '공개': '🟢',
  '비공개': '⚪',
  '계약중': '🟡',
  '계약완료': '✅',
};

/* DB 상태값 → 표시 상태값 정규화 */
const normalizeStatus = (status: string): string => {
  return status;
};

const PROPERTY_TYPES = ['전체', '원룸', '투룸', '쓰리룸+', '오피스텔', '아파트', '빌라', '상가', '사무실'];
const TRANSACTION_TYPES = ['전체', '월세', '전세', '매매'];
const PAGE_SIZE_OPTIONS = [20, 50, 100];

/* ─── 유틸 함수 ─── */
const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const mins = Math.floor(diff / (1000 * 60));
      return mins <= 0 ? '방금' : `${mins}분 전`;
    }
    return `${hours}시간 전`;
  }
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

const formatAmount = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return '';
  if (num >= 10000) return `${(num / 10000).toFixed(num % 10000 === 0 ? 0 : 1)}억`;
  if (num >= 1000) return `${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}천만`;
  return `${num}만`;
};

/** 거래유형에 맞는 가경 문자열 생성 */
const formatDealPrice = (listing: Listing): string => {
  const { deal, deposit, monthly, price } = listing;
  if (deal === '매매') {
    return price ? formatAmount(price) : '-';
  }
  if (deal === '전세') {
    return deposit ? formatAmount(deposit) : '-';
  }
  // 월세 (기본)
  if (deposit !== null && deposit !== undefined && monthly !== null && monthly !== undefined) {
    return `${formatAmount(deposit)}/${formatAmount(monthly)}`;
  }
  if (deposit) return formatAmount(deposit);
  if (monthly) return `월 ${formatAmount(monthly)}`;
  return '-';
};

/* ── 매물 등록 경과일 뱃지 (만료 알림 시스템) ── */
// L-verify-list (2026-04-24): 현장확인 배지 렌더 헬퍼
const getVerifyBadge = (last: string | null | undefined) => {
  if (!last) return { label: '미확인', color: 'bg-red-50 text-red-600 border border-red-100' };
  const days = Math.floor((Date.now() - new Date(last).getTime()) / (24*60*60*1000));
  if (days < 0) return { label: '확인', color: 'bg-emerald-50 text-emerald-700 border border-emerald-100' };
  if (days === 0) return { label: '오늘 확인', color: 'bg-emerald-50 text-emerald-700 border border-emerald-100' };
  if (days <= 7) return { label: days + '일 전', color: 'bg-emerald-50 text-emerald-700 border border-emerald-100' };
  if (days <= 30) return { label: days + '일 전', color: 'bg-amber-50 text-amber-700 border border-amber-100' };
  return { label: days + '일 전', color: 'bg-red-50 text-red-600 border border-red-100' };
};

const getListingAgeBadge = (dateStr: string) => {
  if (!dateStr) return { label: '-', color: 'bg-gray-100 text-gray-500', days: -1, urgent: false };
  const d = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 7) return { label: '신규', color: 'bg-emerald-100 text-emerald-700', days, urgent: false };
  if (days <= 30) return { label: '양호', color: 'bg-blue-100 text-blue-700', days, urgent: false };
  if (days <= 60) return { label: '점검필요', color: 'bg-amber-100 text-amber-700', days, urgent: true };
  return { label: '갱신필요', color: 'bg-red-100 text-red-700', days, urgent: true };
};

/* ─── 토스트 컴포넌트 ─── */
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  };

  return (
    <div className={`fixed top-4 right-4 z-50 ${colors[type]} text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-in`}
      style={{ animation: 'slideIn 0.3s ease-out' }}>
      <span>{type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span className="font-medium text-sm">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">×</button>
    </div>
  );
}

/* ─── 메인 컴포넌트 ─── */
export default function AdminListingsPage() {
  const router = useRouter();
  // L-sec5 (2026-04-22): Supabase 세션 JWT — 하드코드 'Bearer wishes2026' 제거
  const { token: sessionToken, loading: sessionLoading, authHeader } = useAdminSession('/admin/listings');

  // 데이터 상태
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 필터 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('전체');
  const [propertyTypeFilter, setPropertyTypeFilter] = useState('전체');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('전체');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dongFilter, setDongFilter] = useState<string>('전체');
  // L-verify-list (2026-04-24): 현장확인 상태 필터
  const [verifyFilter, setVerifyFilter] = useState<'전체' | '확인됨' | '미확인' | '7일경과'>('전체');

  // 정렬 상태
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 선택 상태 (일괄 작업)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // UI 상태
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showBulkMenu, setShowBulkMenu] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const bulkMenuRef = useRef<HTMLDivElement>(null);

  /* ─── 데이터 가져오기 ─── */
  const fetchListings = useCallback(async () => {
    if (!sessionToken) return; // 세션 준비 전엔 스킵
    try {
      setLoading(true);
      setError(null);
      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
      // L-search8 (2026-04-24): fields=minimal 전환. updated_at 는 route.ts minimal 에 추가됨.
      const res = await adminFetch('/api/admin/listings?fields=minimal', {
        headers: { ...authHeader() },
      });
      if (!res.ok) throw new Error('API 오류: ' + res.status);
      const json = await res.json();
      const data = (json.data || []).map((l: Listing) => ({
        ...l,
        status: normalizeStatus(l.status),
      }));
      setListings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '매물을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, authHeader]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // 벌크 메뉴 외부 클릭 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target as Node)) {
        setShowBulkMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setSelectAll(false);
        setShowBulkMenu(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* ─── 필터링, 정렬, 페이지네이션 ─── */
  const uniqueDongs = Array.from(new Set(listings.map(l => l.dong).filter(Boolean))).sort();

  const filtered = useMemo(() => {
    let result = listings.filter((l) => {
      // 상태 필터
      if (statusFilter !== '전체' && l.status !== statusFilter) return false;
      // 매물 유형 필터
      if (propertyTypeFilter !== '전체' && l.type !== propertyTypeFilter) return false;
      if (dongFilter !== '전체' && l.dong !== dongFilter) return false;
      // 거래 유형 필터
      if (transactionTypeFilter !== '전체' && l.deal !== transactionTypeFilter) return false;
      // L-verify-list: 현장확인 상태 필터
      if (verifyFilter !== '전체') {
        const v = l.last_verified_at ? new Date(l.last_verified_at).getTime() : 0;
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (verifyFilter === '미확인' && v > 0) return false;
        if (verifyFilter === '확인됨' && (v === 0 || v < weekAgo)) return false;
        if (verifyFilter === '7일경과' && v >= weekAgo) return false;
      }
      // 검색어 필터
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          String(l.id).includes(q) ||
          (l.title || '').toLowerCase().includes(q) ||
          (l.address || '').toLowerCase().includes(q) ||
          (l.dong || '').toLowerCase().includes(q) ||
          String(formatDealPrice(l)).toLowerCase().includes(q)
        );
      }
      return true;
    });

    // 정렬
    result.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      if (sortField === 'id') {
        aVal = Number(aVal);
        bVal = Number(bVal);
      } else if (sortField === 'created_at') {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
      } else if (sortField === 'price') {
        // 가경 정렬: 매매→price, 전세→deposit, 월세→deposit 기준
        aVal = a.price || a.deposit || 0;
        bVal = b.price || b.deposit || 0;
      } else {
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [listings, statusFilter, propertyTypeFilter, transactionTypeFilter, searchQuery, sortField, sortDirection, dongFilter, verifyFilter]);

  // 페이지네이션 계산
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedListings = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 상태별 카운트
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { '전체': listings.length };
    listings.forEach((l) => {
      counts[l.status] = (counts[l.status] || 0) + 1;
    });
    return counts;
  }, [listings]);

  // 페이지 변경 시 선택 초기화
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAll(false);
  }, [currentPage, pageSize, statusFilter, searchQuery, propertyTypeFilter, transactionTypeFilter]);

  // 필터 변경 시 페이지 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery, propertyTypeFilter, transactionTypeFilter, pageSize]);

  /* ─── 이벤트 핸들러 ─── */
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(paginatedListings.map((l) => l.id)));
      setSelectAll(true);
    }
  };

  const handleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      setUpdatingId(id);
      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
      const res = await adminFetch('/api/admin/listings/' + id, {
        method: 'PATCH',
        headers: {
          ...authHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('상태 변경 실패');
      setListings((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l))
      );
      setToast({ message: `매물 #${id} 상태가 "${newStatus}"로 변경되었습니다`, type: 'success' });
    } catch (err) {
      setToast({ message: '상태 변경 오류: ' + (err instanceof Error ? err.message : '알 수 없는 오류'), type: 'error' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(`매물 #${id}을(를) 정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      setDeletingId(id);
      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
      const res = await adminFetch('/api/admin/listings/' + id, {
        method: 'DELETE',
        headers: { ...authHeader() },
      });
      if (!res.ok) throw new Error('삭제 실패');
      setListings((prev) => prev.filter((l) => l.id !== id));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      setToast({ message: `매물 #${id}이(가) 삭제되었습니다`, type: 'success' });
    } catch (err) {
      setToast({ message: '삭제 오류: ' + (err instanceof Error ? err.message : '알 수 없는 오류'), type: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}건의 매물 상태를 "${newStatus}"로 변경하시겠습니까?`)) return;
    setBulkActionLoading(true);
    setShowBulkMenu(false);
    let successCount = 0;
    let failCount = 0;
    for (const id of selectedIds) {
      try {
        // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
        const res = await adminFetch('/api/admin/listings/' + id, {
          method: 'PATCH',
          headers: {
            ...authHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) {
          setListings((prev) =>
            prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l))
          );
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }
    setBulkActionLoading(false);
    setSelectedIds(new Set());
    setSelectAll(false);
    if (failCount === 0) {
      setToast({ message: `${successCount}건 상태 변경 완료`, type: 'success' });
    } else {
      setToast({ message: `${successCount}건 성공, ${failCount}건 실패`, type: 'error' });
    }
  };

  // L-verify-list (2026-04-24): 선택 매물 일괄 "현장확인 완료" 갱신
  const handleBulkVerify = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}건의 매물에 현장확인 완료를 기록하시겠습니까?`)) return;
    setBulkActionLoading(true);
    setShowBulkMenu(false);
    const now = new Date().toISOString();
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      try {
        const res = await adminFetch('/api/admin/listings', {
          method: 'PUT',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, last_verified_at: now }),
        });
        if (res.ok) {
          setListings(prev => prev.map(l => l.id === id ? { ...l, last_verified_at: now } : l));
          ok++;
        } else fail++;
      } catch { fail++; }
    }
    setBulkActionLoading(false);
    setSelectedIds(new Set());
    setSelectAll(false);
    setToast({
      message: fail === 0 ? `${ok}건 현장확인 기록 완료` : `${ok}건 성공, ${fail}건 실패`,
      type: fail === 0 ? 'success' : 'error',
    });
  };

    const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`⚠️ 선택한 ${selectedIds.size}건의 매물을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setBulkActionLoading(true);
    setShowBulkMenu(false);
    let successCount = 0;
    let failCount = 0;
    for (const id of selectedIds) {
      try {
        // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
        const res = await adminFetch('/api/admin/listings/' + id, {
          method: 'DELETE',
          headers: { ...authHeader() },
        });
        if (res.ok) {
          setListings((prev) => prev.filter((l) => l.id !== id));
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }
    setBulkActionLoading(false);
    setSelectedIds(new Set());
    setSelectAll(false);
    if (failCount === 0) {
      setToast({ message: `${successCount}건 삭제 완료`, type: 'success' });
    } else {
      setToast({ message: `${successCount}건 삭제 성공, ${failCount}건 실패`, type: 'error' });
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('전체');
    setPropertyTypeFilter('전체');
    setTransactionTypeFilter('전체'); setDongFilter('전체');
    setCurrentPage(1);
    setVerifyFilter('전체');
  };

  const handleExportCSV = () => {
    const headers = ['ID','제목','주소','상세주소','동','유형','거래','보증금','월세','매매가','관리비','상태','등록일'];
    const rows = filtered.map(l => [
      l.id,
      (l.title || '').replace(/,/g, ' '),
      (l.address || '').replace(/,/g, ' '),
      (l.address_detail || '').replace(/,/g, ' '),
      l.dong || '',
      l.type || '',
      l.deal || '',
      l.deposit || '',
      l.monthly || '',
      l.price || '',
      l.maintenance_fee || '',
      l.status || '',
      l.created_at ? new Date(l.created_at).toLocaleDateString('ko-KR') : ''
    ]);
    const bom = '\uFEFF';
    const csv = bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wishes_listings_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    setToast({ message: filtered.length + '건 매물 데이터가 CSV로 내보내기 되었습니다.', type: 'success' });
  };

  const isFiltered = searchQuery || statusFilter !== '전체' || propertyTypeFilter !== '전체' || transactionTypeFilter !== '전체';

  /* ─── 정렬 아이콘 ─── */
  const SortIcon = ({ field }: { field: SortField }) => (
    <span className="ml-1 inline-flex flex-col text-[10px] leading-none">
      <span className={sortField === field && sortDirection === 'asc' ? 'text-blue-600' : 'text-gray-300'}>▲</span>
      <span className={sortField === field && sortDirection === 'desc' ? 'text-blue-600' : 'text-gray-300'}>▼</span>
    </span>
  );

  /* ─── 페이지네이션 범위 ─── */
  const getPageRange = () => {
    const range: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  };

  /* ─── 렌더링 ─── */
  if (sessionLoading || !sessionToken) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        🔐 세션 확인 중…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 토스트 */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="max-w-[1600px] mx-auto p-4 sm:p-6">
        {/* ─── 헤더 ─── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">매물 관리</h1>
            <p className="text-gray-500 text-sm mt-1">
              총 <span className="font-semibold text-gray-700">{listings.length.toLocaleString()}</span>건의 매물
              {isFiltered && (
                <span className="ml-2 text-blue-600">
                  (필터 적용: {filtered.length.toLocaleString()}건)
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchListings}
              disabled={loading}
              className="p-2.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50"
              title="새로고침"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => router.push('/admin/listings/new')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-5 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              <span className="text-lg leading-none">+</span> 새 매물 등록
            </button>
            <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition shadow-sm"
                title="CSV 내보내기"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                CSV 내보내기
              </button>
              <button
              onClick={() => router.push('/admin/listings/bulk-upload')}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              대량 등록
            </button>
          </div>
        </div>

        {/* ─── 통계 카드 ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {STATUS_OPTIONS.map((s) => {
            const count = statusCounts[s] || 0;
            const isActive = statusFilter === s;
            const colors: Record<string, string> = {
              '전체': 'from-blue-500 to-blue-600',
              '공개': 'from-emerald-500 to-emerald-600',
              '비공개': 'from-slate-400 to-slate-500',
              '계약중': 'from-amber-500 to-amber-600',
              '계약완료': 'from-gray-500 to-gray-600',
            };
            return (
              <button
                key={s}
                onClick={() => {
                  // 상태 칩 클릭 시 다른 필터도 초기화해서
                  // "비공개 11건" 같은 전체 결과가 바로 보이도록 보장
                  setStatusFilter(s);
                  setSearchQuery('');
                  setPropertyTypeFilter('전체');
                  setTransactionTypeFilter('전체');
                  setDongFilter('전체');
                  setCurrentPage(1);
                }}
                className={`relative rounded-xl p-4 text-left transition-all ${
                  isActive
                    ? `bg-gradient-to-br ${colors[s]} text-white shadow-lg scale-[1.02]`
                    : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isActive ? 'text-white/80' : 'text-gray-500'}`}>
                    {STATUS_ICONS[s] || '📧'} {s}
                  </span>
                </div>
                <div className={`text-2xl font-bold mt-1 ${isActive ? 'text-white' : 'text-gray-900'}`}>
                  {count.toLocaleString()}
                </div>
                <div className={`text-xs mt-0.5 ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                  {s === '전체' ? '전체 매물' : `${s} 매물`}
                </div>
              </button>
            );
          })}
        </div>

        {/* ─── 검색 & 필터 바 ─── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4">
          <div className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* 검색 */}
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="매물번호, 제목, 주소, 동, 가격으로 검색... (Ctrl+K)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* 뷰 토글 */}
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-2.5 text-sm ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title="테이블 뷰"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('card')}
                  className={`px-3 py-2.5 text-sm ${viewMode === 'card' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title="카드 뷰"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                </button>
              </div>

              {/* 고급 필터 토글 */}
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${
                  showAdvancedFilters || isFiltered
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                필터
                {isFiltered && (
                  <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    !
                  </span>
                )}
              </button>
            </div>

            {/* 고급 필터 패널 */}
            {showAdvancedFilters && (
              <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">매물 유형</label>
                  <select
                    value={propertyTypeFilter}
                    onChange={(e) => setPropertyTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">거래 유형</label>
                  <select
                    value={transactionTypeFilter}
                    onChange={(e) => setTransactionTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {TRANSACTION_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">동</label>
                <select
                  value={dongFilter}
                  onChange={(e) => { setDongFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="전체">전체</option>
                  {uniqueDongs.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
                {/* L-verify-list: 현장확인 상태 필터 */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">현장확인</label>
                  <select
                    value={verifyFilter}
                    onChange={(e) => { setVerifyFilter(e.target.value as any); setCurrentPage(1); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="전체">전체</option>
                    <option value="확인됨">✓ 최근 7일 확인</option>
                    <option value="7일경과">⚠️ 7일 이상 경과</option>
                    <option value="미확인">❌ 미확인</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleResetFilters}
                    className="w-full px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    필터 초기화
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── 매물 갱신 알림 배너 ─── */}
          {(() => {
            const urgentCount = listings.filter(l => {
              const b = getListingAgeBadge(l.created_at);
              return b.urgent && l.status === '공개';
            }).length;
            if (urgentCount === 0) return null;
            return (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <div className="flex-1">
                  <span className="font-semibold text-amber-800">갱신 필요 매물 {urgentCount}건</span>
                  <span className="text-sm text-amber-600 ml-2">등록 후 30일 이상 경과된 공개 매물이 있습니다. 허위매물 방지를 위해 정보를 확인해주세요.</span>
                </div>
              </div>
            );
          })()}

          {/* ─── 일괄 작업 바 ─── */}
        {selectedIds.size > 0 && (
          <div className="bg-blue-600 text-white rounded-xl p-3 mb-4 flex items-center justify-between shadow-lg animate-slide-in"
            style={{ animation: 'slideIn 0.2s ease-out' }}>
            <div className="flex items-center gap-3">
              <span className="bg-white/20 px-3 py-1 rounded-lg text-sm font-medium">
                {selectedIds.size}건 선택
              </span>
              <button
                onClick={() => { setSelectedIds(new Set()); setSelectAll(false); }}
                className="text-sm text-white/80 hover:text-white underline"
              >
                선택 해제
              </button>
            </div>
            <div className="flex items-center gap-2" ref={bulkMenuRef}>
              <div className="relative">
                <button
                  onClick={() => setShowBulkMenu(!showBulkMenu)}
                  disabled={bulkActionLoading}
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {bulkActionLoading ? (
                    <>
                      <span className="animate-spin">↻</span> 처리중...
                    </>
                  ) : (
                    <>
                      일괄 상태 변경 <span className="text-xs">▼</span>
                    </>
                  )}
                </button>
                {showBulkMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-20 py-1 min-w-[160px]">
                    {['공개', '비공개', '계약중', '계약완료'].map((s) => (
                      <button
                        key={s}
                        onClick={() => handleBulkStatusChange(s)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        {STATUS_ICONS[s]} {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* L-verify-list: 일괄 현장확인 버튼 */}
              <button
                onClick={handleBulkVerify}
                disabled={bulkActionLoading}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                title="선택 매물에 현장확인 완료 기록"
              >
                ✓ 현장확인
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkActionLoading}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                일괄 삭제
              </button>
            </div>
          </div>
        )}

        {/* ─── 에러 ─── */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchListings} className="text-sm font-medium underline">다시 시도</button>
          </div>
        )}

        {/* ─── 로딩 ─── */}
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-16 text-center">
            <div className="animate-spin inline-block w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" />
            <p className="mt-4 text-gray-500 text-sm">매물을 불러오는 중...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-16 text-center">
            <div className="text-5xl mb-4">{isFiltered ? '🔍' : '📭'}</div>
            <p className="text-gray-600 font-medium mb-2">
              {isFiltered ? '검색 결과가 없습니다' : '등록된 매물이 없습니다'}
            </p>
            {isFiltered ? (
              <button
                onClick={handleResetFilters}
                className="text-blue-600 text-sm hover:underline mt-2"
              >
                필터 초기화
              </button>
            ) : (
              <button
                onClick={() => router.push('/admin/listings/new')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm mt-3 transition-colors"
              >
                첫 매물 등록하기
              </button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          /* ─── 테이블 뷰 ─── */
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/80 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    {[
                      { field: 'id' as SortField, label: 'ID', width: 'w-16' },
                      { field: 'title' as SortField, label: '제목', width: 'min-w-[200px]' },
                      { field: 'address' as SortField, label: '주소', width: 'min-w-[160px]' },
                      { field: 'dong' as SortField, label: '동', width: 'w-20' },
                      { field: 'type' as SortField, label: '유형', width: 'w-20' },
                      { field: 'deal' as SortField, label: '거래', width: 'w-16' },
                      { field: 'price' as SortField, label: '가격', width: 'w-24' },
                      { field: 'status' as SortField, label: '상태', width: 'w-28' },
                      { field: 'created_at' as SortField, label: '등록일', width: 'w-24' },
                    ].map(({ field, label, width }) => (
                      <th
                        key={field}
                        onClick={() => handleSort(field)}
                        className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700 select-none ${width}`}
                      >
                        <div className="flex items-center">
                          {label}
                          <SortIcon field={field} />
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-24">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedListings.map((listing) => (
                    <tr
                      key={listing.id}
                      className={`hover:bg-blue-50/30 transition-colors ${
                        selectedIds.has(listing.id) ? 'bg-blue-50/50' : ''
                      } ${listing.status === '계약완료' ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(listing.id)}
                          onChange={() => handleSelectOne(listing.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400 font-mono">#{listing.id}</td>
                      <td className="px-4 py-3">
                        <div
                          className="text-sm font-medium text-gray-900 max-w-[240px] truncate cursor-pointer hover:text-blue-600 transition-colors"
                          onClick={() => router.push(`/admin/listings/${listing.id}/edit`)}
                          title={listing.title}
                        >
                          {listing.title || '(제목 없음)'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px] truncate" title={listing.address}>
                        {listing.address || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{listing.dong || '-'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                          {listing.type || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                          {listing.deal || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                        {formatDealPrice(listing)}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={listing.status}
                          onChange={(e) => handleStatusChange(listing.id, e.target.value)}
                          disabled={updatingId === listing.id}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
                            STATUS_COLORS[listing.status] || 'bg-gray-100 text-gray-600 border-gray-200'
                          } ${updatingId === listing.id ? 'opacity-50 cursor-wait' : 'hover:shadow-sm'}`}
                        >
                          <option value="공개">🟢 공개</option>
                          <option value="비공개">⚪ 비공개</option>
                          <option value="계약중">🟡 계약중</option>
                          <option value="계약완료">✅ 계약완료</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-500">{formatDate(listing.created_at)}</div>
                        {(() => { const b = getListingAgeBadge(listing.created_at); return b.days >= 0 ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${b.color}`}>{b.label}</span> : null; })()}
                        {(() => { const v = getVerifyBadge(listing.last_verified_at); return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${v.color}`} title={listing.last_verified_at ? `최근 현장확인 ${new Date(listing.last_verified_at).toLocaleString('ko-KR')}` : '현장확인 기록 없음'}>✓ {v.label}</span>; })()}
                        {listing.updated_at && listing.updated_at !== listing.created_at && <div className="text-[10px] text-purple-500 mt-0.5" title={listing.updated_at}>수정됨</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => router.push(`/admin/listings/${listing.id}/edit`)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="수정"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                          onClick={() => router.push(`/admin/listings/new?copyFrom=${listing.id}`)}
                          className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="복사"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        </button>
                  <button
                            onClick={() => handleDelete(listing.id)}
                            disabled={deletingId === listing.id}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="삭제"
                          >
                            {deletingId === listing.id ? (
                              <span className="w-4 h-4 block animate-spin">↻</span>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            <div className="bg-gray-50/80 border-t border-gray-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span>
                  {((currentPage - 1) * pageSize + 1).toLocaleString()}-{Math.min(currentPage * pageSize, filtered.length).toLocaleString()}
                  {' / '}
                  {filtered.length.toLocaleString()}건
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                >
                  {PAGE_SIZE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}건씩</option>
                  ))}
                </select>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ≪
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ＜
                  </button>
                  {getPageRange().map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded text-xs font-medium ${
                        currentPage === page
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ＞
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ≫
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ─── 카드 뷰 ─── */
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedListings.map((listing) => (
                <div
                  key={listing.id}
                  className={`bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-all cursor-pointer group ${
                    selectedIds.has(listing.id) ? 'ring-2 ring-blue-500' : ''
                  } ${listing.status === '계약완료' ? 'opacity-60' : ''}`}
                >
                  {/* 카드 상단: 이미지 또는 플레이스홀더 */}
                  <div className="relative h-40 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    {listing.images && listing.images.length > 0 ? (
                      <img
                        src={listing.images[0]}
                        alt={listing.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-4xl">🏠</span>
                    )}
                    {/* 체크박스 */}
                    <div className="absolute top-2 left-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(listing.id)}
                        onChange={(e) => { e.stopPropagation(); handleSelectOne(listing.id); }}
                        className="w-5 h-5 rounded border-2 border-white/80 text-blue-600 focus:ring-blue-500 cursor-pointer shadow"
                      />
                    </div>
                    {/* 상태 뱃지 */}
                    <div className="absolute top-2 right-2">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium border shadow-sm ${
                        STATUS_COLORS[listing.status] || 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}>
                        {STATUS_ICONS[listing.status]} {listing.status}
                      </span>
                    </div>
                    {/* ID */}
                    <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded font-mono">
                      #{listing.id}
                    </div>
                  </div>

                  {/* 카드 내용 */}
                  <div className="p-4" onClick={() => router.push(`/admin/listings/${listing.id}/edit`)}>
                    <h3 className="font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                      {listing.title || '(제목 없음)'}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 truncate">{listing.address || '-'}</p>

                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{listing.type || '-'}</span>
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded">{listing.deal || '-'}</span>
                      {listing.dong && (
                        <span className="text-xs text-gray-400">{listing.dong}</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <span className="font-bold text-gray-900">{formatDealPrice(listing)}</span>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-gray-400">{formatDate(listing.created_at)}</span>
                        {(() => { const b = getListingAgeBadge(listing.created_at); return b.days >= 0 ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${b.color}`}>{b.label}</span> : null; })()}
                        {(() => { const v = getVerifyBadge(listing.last_verified_at); return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${v.color}`} title={listing.last_verified_at ? `최근 현장확인 ${new Date(listing.last_verified_at).toLocaleString('ko-KR')}` : '현장확인 기록 없음'}>✓ {v.label}</span>; })()}
                      </div>
                    </div>
                  </div>

                  {/* 카드 액션 */}
                  <div className="px-4 pb-3 flex items-center gap-2">
                    <select
                      value={listing.status}
                      onChange={(e) => { e.stopPropagation(); handleStatusChange(listing.id, e.target.value); }}
                      disabled={updatingId === listing.id}
                      className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-gray-200 bg-gray-50 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="공개">🟢 공개</option>
                      <option value="비공개">⚪ 비공개</option>
                      <option value="계약중">🟡 계약중</option>
                      <option value="계약완료">✅ 계약완료</option>
                    </select>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(listing.id); }}
                      disabled={deletingId === listing.id}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* 카드 뷰 페이지네이션 */}
            {totalPages > 1 && (
              <div className="mt-4 bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-sm text-gray-500">
                  {((currentPage - 1) * pageSize + 1).toLocaleString()}-{Math.min(currentPage * pageSize, filtered.length).toLocaleString()}
                  {' / '}{filtered.length.toLocaleString()}건
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="ml-3 px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                  >
                    {PAGE_SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}건씩</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                  >
                    ≪
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                  >
                    ＜
                  </button>
                  {getPageRange().map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded text-xs font-medium ${
                        currentPage === page ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                  >
                    ＞
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                  >
                    ≫
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 글로벌 CSS */}
      <style jsx global>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
