'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';

/* âââ íì ì ì âââ */
interface Listing {
  id: number;
  title: string;
  address: string;
  address_detail?: string;
  dong: string;
  type: string;
  deal: string;          // DB: 'deal' (ìì¸/ì ì¸/ë§¤ë§¤)
  price: number | null;  // DB: number (ë§¤ë§¤ê°, ë§ì)
  deposit: number | null; // DB: number (ë³´ì¦ê¸, ë§ì)
  monthly: number | null; // DB: number (ìì¸, ë§ì)
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
}

type StatusFilter = 'ì ì²´' | 'ê³µê°' | 'ë¹ê³µê°' | 'ê³ì½ì¤' | 'ê³ì½ìë£';
type SortField = 'id' | 'title' | 'address' | 'dong' | 'type' | 'deal' | 'price' | 'status' | 'created_at';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'table' | 'card';

/* âââ ìì âââ */
const STATUS_OPTIONS: StatusFilter[] = ['ì ì²´', 'ê³µê°', 'ë¹ê³µê°', 'ê³ì½ì¤', 'ê³ì½ìë£'];

const STATUS_COLORS: Record<string, string> = {
  'ê³µê°': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'ë¹ê³µê°': 'bg-slate-50 text-slate-600 border-slate-200',
  'ê°ì©': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'ê³ì½ì¤': 'bg-amber-50 text-amber-700 border-amber-200',
  'ê³ì½ìë£': 'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_ICONS: Record<string, string> = {
  'ê³µê°': 'ð¢',
  'ë¹ê³µê°': 'âª',
  'ê°ì©': 'ð¢',
  'ê³ì½ì¤': 'ð¡',
  'ê³ì½ìë£': 'â',
};

/* DB ìíê° â íì ìíê° ì ê·í (ì: 'ê°ì©' â 'ê³µê°') */
const normalizeStatus = (status: string): string => {
  const STATUS_MAP: Record<string, string> = {
    'ê°ì©': 'ê³µê°',
  };
  return STATUS_MAP[status] || status;
};

const PROPERTY_TYPES = ['ì ì²´', 'ìë£¸', 'í¬ë£¸', 'ì°ë¦¬ë£¸+', 'ì¤í¼ì¤í', 'ìíí¸', 'ë¹ë¼', 'ìê°', 'ì¬ë¬´ì¤'];
const TRANSACTION_TYPES = ['ì ì²´', 'ìì¸', 'ì ì¸', 'ë§¤ë§¤'];
const PAGE_SIZE_OPTIONS = [20, 50, 100];

/* âââ ì í¸ í¨ì âââ */
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
      return mins <= 0 ? 'ë°©ê¸' : `${mins}ë¶ ì `;
    }
    return `${hours}ìê° ì `;
  }
  if (days === 1) return 'ì´ì ';
  if (days < 7) return `${days}ì¼ ì `;
  if (days < 30) return `${Math.floor(days / 7)}ì£¼ ì `;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

const formatAmount = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return '';
  if (num >= 10000) return `${(num / 10000).toFixed(num % 10000 === 0 ? 0 : 1)}ìµ`;
  if (num >= 1000) return `${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}ì²ë§`;
  return `${num}ë§`;
};

/** ê±°ëì íì ë§ë ê°ê²½ ë¬¸ìì´ ìì± */
const formatDealPrice = (listing: Listing): string => {
  const { deal, deposit, monthly, price } = listing;
  if (deal === 'ë§¤ë§¤') {
    return price ? formatAmount(price) : '-';
  }
  if (deal === 'ì ì¸') {
    return deposit ? formatAmount(deposit) : '-';
  }
  // ìì¸ (ê¸°ë³¸)
  if (deposit !== null && deposit !== undefined && monthly !== null && monthly !== undefined) {
    return `${formatAmount(deposit)}/${formatAmount(monthly)}`;
  }
  if (deposit) return formatAmount(deposit);
  if (monthly) return `ì ${formatAmount(monthly)}`;
  return '-';
};

/* ââ ë§¤ë¬¼ ë±ë¡ ê²½ê³¼ì¼ ë±ì§ (ë§ë£ ìë¦¼ ìì¤í) ââ */
const getListingAgeBadge = (dateStr: string) => {
  if (!dateStr) return { label: '-', color: 'bg-gray-100 text-gray-500', days: -1, urgent: false };
  const d = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 7) return { label: 'ì ê·', color: 'bg-emerald-100 text-emerald-700', days, urgent: false };
  if (days <= 30) return { label: 'ìí¸', color: 'bg-blue-100 text-blue-700', days, urgent: false };
  if (days <= 60) return { label: 'ì ê²íì', color: 'bg-amber-100 text-amber-700', days, urgent: true };
  return { label: 'ê°±ì íì', color: 'bg-red-100 text-red-700', days, urgent: true };
};

/* âââ í ì¤í¸ ì»´í¬ëí¸ âââ */
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
      <span>{type === 'success' ? 'â' : type === 'error' ? 'â' : 'â¹'}</span>
      <span className="font-medium text-sm">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">Ã</button>
    </div>
  );
}

/* âââ ë©ì¸ ì»´í¬ëí¸ âââ */
export default function AdminListingsPage() {
  const router = useRouter();

  // ë°ì´í° ìí
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // íí° ìí
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ì ì²´');
  const [propertyTypeFilter, setPropertyTypeFilter] = useState('ì ì²´');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('ì ì²´');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dongFilter, setDongFilter] = useState<string>('ì ì²´');

  // ì ë ¬ ìí
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // íì´ì§ë¤ì´ì
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ì í ìí (ì¼ê´ ìì)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // UI ìí
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showBulkMenu, setShowBulkMenu] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const bulkMenuRef = useRef<HTMLDivElement>(null);

  /* âââ ë°ì´í° ê°ì ¸ì¤ê¸° âââ */
  const fetchListings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/listings', {
        headers: { 'Authorization': 'Bearer wishes2026' },
      });
      if (!res.ok) throw new Error('API ì¤ë¥: ' + res.status);
      const json = await res.json();
      const data = (json.data || []).map((l: Listing) => ({
        ...l,
        status: normalizeStatus(l.status),
      }));
      setListings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ë§¤ë¬¼ì ë¶ë¬ì¬ ì ììµëë¤');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // ë²í¬ ë©ë´ ì¸ë¶ í´ë¦­ ë«ê¸°
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target as Node)) {
        setShowBulkMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // í¤ë³´ë ë¨ì¶í¤
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

  /* âââ íí°ë§, ì ë ¬, íì´ì§ë¤ì´ì âââ */
  const uniqueDongs = Array.from(new Set(listings.map(l => l.dong).filter(Boolean))).sort();

  const filtered = useMemo(() => {
    let result = listings.filter((l) => {
      // ìí íí°
      if (statusFilter !== 'ì ì²´' && l.status !== statusFilter) return false;
      // ë§¤ë¬¼ ì í íí°
      if (propertyTypeFilter !== 'ì ì²´' && l.type !== propertyTypeFilter) return false;
      if (dongFilter !== 'ì ì²´' && l.dong !== dongFilter) return false;
      // ê±°ë ì í íí°
      if (transactionTypeFilter !== 'ì ì²´' && l.deal !== transactionTypeFilter) return false;
      // ê²ìì´ íí°
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

    // ì ë ¬
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
        // ê°ê²½ ì ë ¬: ë§¤ë§¤âprice, ì ì¸âdeposit, ìì¸âdeposit ê¸°ì¤
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
  }, [listings, statusFilter, propertyTypeFilter, transactionTypeFilter, searchQuery, sortField, sortDirection, dongFilter]);

  // íì´ì§ë¤ì´ì ê³ì°
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedListings = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ìíë³ ì¹´ì´í¸
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { 'ì ì²´': listings.length };
    listings.forEach((l) => {
      counts[l.status] = (counts[l.status] || 0) + 1;
    });
    return counts;
  }, [listings]);

  // íì´ì§ ë³ê²½ ì ì í ì´ê¸°í
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAll(false);
  }, [currentPage, pageSize, statusFilter, searchQuery, propertyTypeFilter, transactionTypeFilter]);

  // íí° ë³ê²½ ì íì´ì§ ë¦¬ì
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery, propertyTypeFilter, transactionTypeFilter, pageSize]);

  /* âââ ì´ë²¤í¸ í¸ë¤ë¬ âââ */
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
      const res = await fetch('/api/admin/listings/' + id, {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer wishes2026',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('ìí ë³ê²½ ì¤í¨');
      setListings((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l))
      );
      setToast({ message: `ë§¤ë¬¼ #${id} ìíê° "${newStatus}"ë¡ ë³ê²½ëììµëë¤`, type: 'success' });
    } catch (err) {
      setToast({ message: 'ìí ë³ê²½ ì¤ë¥: ' + (err instanceof Error ? err.message : 'ì ì ìë ì¤ë¥'), type: 'error' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(`ë§¤ë¬¼ #${id}ì(ë¥¼) ì ë§ ì­ì íìê² ìµëê¹?\nì´ ììì ëëë¦´ ì ììµëë¤.`)) return;
    try {
      setDeletingId(id);
      const res = await fetch('/api/admin/listings/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer wishes2026' },
      });
      if (!res.ok) throw new Error('ì­ì  ì¤í¨');
      setListings((prev) => prev.filter((l) => l.id !== id));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      setToast({ message: `ë§¤ë¬¼ #${id}ì´(ê°) ì­ì ëììµëë¤`, type: 'success' });
    } catch (err) {
      setToast({ message: 'ì­ì  ì¤ë¥: ' + (err instanceof Error ? err.message : 'ì ì ìë ì¤ë¥'), type: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    if (!confirm(`ì íí ${selectedIds.size}ê±´ì ë§¤ë¬¼ ìíë¥¼ "${newStatus}"ë¡ ë³ê²½íìê² ìµëê¹?`)) return;
    setBulkActionLoading(true);
    setShowBulkMenu(false);
    let successCount = 0;
    let failCount = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch('/api/admin/listings/' + id, {
          method: 'PATCH',
          headers: {
            'Authorization': 'Bearer wishes2026',
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
      setToast({ message: `${successCount}ê±´ ìí ë³ê²½ ìë£`, type: 'success' });
    } else {
      setToast({ message: `${successCount}ê±´ ì±ê³µ, ${failCount}ê±´ ì¤í¨`, type: 'error' });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`â ï¸ ì íí ${selectedIds.size}ê±´ì ë§¤ë¬¼ì ì­ì íìê² ìµëê¹?\nì´ ììì ëëë¦´ ì ììµëë¤.`)) return;
    setBulkActionLoading(true);
    setShowBulkMenu(false);
    let successCount = 0;
    let failCount = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch('/api/admin/listings/' + id, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer wishes2026' },
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
      setToast({ message: `${successCount}ê±´ ì­ì  ìë£`, type: 'success' });
    } else {
      setToast({ message: `${successCount}ê±´ ì­ì  ì±ê³µ, ${failCount}ê±´ ì¤í¨`, type: 'error' });
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('ì ì²´');
    setPropertyTypeFilter('ì ì²´');
    setTransactionTypeFilter('ì ì²´'); setDongFilter('ì ì²´');
    setCurrentPage(1);
  };

  const handleExportCSV = () => {
    const headers = ['ID','ì ëª©','ì£¼ì','ìì¸ì£¼ì','ë','ì í','ê±°ë','ë³´ì¦ê¸','ìì¸','ë§¤ë§¤ê°','ê´ë¦¬ë¹','ìí','ë±ë¡ì¼'];
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
    setToast({ message: filtered.length + 'ê±´ ë§¤ë¬¼ ë°ì´í°ê° CSVë¡ ë´ë³´ë´ê¸° ëììµëë¤.', type: 'success' });
  };

  const isFiltered = searchQuery || statusFilter !== 'ì ì²´' || propertyTypeFilter !== 'ì ì²´' || transactionTypeFilter !== 'ì ì²´';

  /* âââ ì ë ¬ ìì´ì½ âââ */
  const SortIcon = ({ field }: { field: SortField }) => (
    <span className="ml-1 inline-flex flex-col text-[10px] leading-none">
      <span className={sortField === field && sortDirection === 'asc' ? 'text-blue-600' : 'text-gray-300'}>â²</span>
      <span className={sortField === field && sortDirection === 'desc' ? 'text-blue-600' : 'text-gray-300'}>â¼</span>
    </span>
  );

  /* âââ íì´ì§ë¤ì´ì ë²ì âââ */
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

  /* âââ ë ëë§ âââ */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* í ì¤í¸ */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="max-w-[1600px] mx-auto p-4 sm:p-6">
        {/* âââ í¤ë âââ */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ë§¤ë¬¼ ê´ë¦¬</h1>
            <p className="text-gray-500 text-sm mt-1">
              ì´ <span className="font-semibold text-gray-700">{listings.length.toLocaleString()}</span>ê±´ì ë§¤ë¬¼
              {isFiltered && (
                <span className="ml-2 text-blue-600">
                  (íí° ì ì©: {filtered.length.toLocaleString()}ê±´)
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchListings}
              disabled={loading}
              className="p-2.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50"
              title="ìë¡ê³ ì¹¨"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => router.push('/admin/listings/new')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-5 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              <span className="text-lg leading-none">+</span> ì ë§¤ë¬¼ ë±ë¡
            </button>
            <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition shadow-sm"
                title="CSV ë´ë³´ë´ê¸°"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                CSV ë´ë³´ë´ê¸°
              </button>
              <button
              onClick={() => router.push('/admin/listings/bulk-upload')}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              ëë ë±ë¡
            </button>
          </div>
        </div>

        {/* âââ íµê³ ì¹´ë âââ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {STATUS_OPTIONS.map((s) => {
            const count = statusCounts[s] || 0;
            const isActive = statusFilter === s;
            const colors: Record<string, string> = {
              'ì ì²´': 'from-blue-500 to-blue-600',
              'ê³µê°': 'from-emerald-500 to-emerald-600',
              'ë¹ê³µê°': 'from-slate-400 to-slate-500',
              'ê³ì½ì¤': 'from-amber-500 to-amber-600',
              'ê³ì½ìë£': 'from-gray-500 to-gray-600',
            };
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`relative rounded-xl p-4 text-left transition-all ${
                  isActive
                    ? `bg-gradient-to-br ${colors[s]} text-white shadow-lg scale-[1.02]`
                    : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isActive ? 'text-white/80' : 'text-gray-500'}`}>
                    {STATUS_ICONS[s] || 'ð§'} {s}
                  </span>
                </div>
                <div className={`text-2xl font-bold mt-1 ${isActive ? 'text-white' : 'text-gray-900'}`}>
                  {count.toLocaleString()}
                </div>
                <div className={`text-xs mt-0.5 ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                  {s === 'ì ì²´' ? 'ì ì²´ ë§¤ë¬¼' : `${s} ë§¤ë¬¼`}
                </div>
              </button>
            );
          })}
        </div>

        {/* âââ ê²ì & íí° ë° âââ */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4">
          <div className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* ê²ì */}
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="ë§¤ë¬¼ë²í¸, ì ëª©, ì£¼ì, ë, ê°ê²©ì¼ë¡ ê²ì... (Ctrl+K)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    Ã
                  </button>
                )}
              </div>

              {/* ë·° í ê¸ */}
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-2.5 text-sm ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title="íì´ë¸ ë·°"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('card')}
                  className={`px-3 py-2.5 text-sm ${viewMode === 'card' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title="ì¹´ë ë·°"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                </button>
              </div>

              {/* ê³ ê¸ íí° í ê¸ */}
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
                íí°
                {isFiltered && (
                  <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    !
                  </span>
                )}
              </button>
            </div>

            {/* ê³ ê¸ íí° í¨ë */}
            {showAdvancedFilters && (
              <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">ë§¤ë¬¼ ì í</label>
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
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">ê±°ë ì í</label>
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
                <label className="block text-xs font-medium text-gray-500 mb-1">ë</label>
                <select
                  value={dongFilter}
                  onChange={(e) => { setDongFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="ì ì²´">ì ì²´</option>
                  {uniqueDongs.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
                <div className="flex items-end">
                  <button
                    onClick={handleResetFilters}
                    className="w-full px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    íí° ì´ê¸°í
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* âââ ë§¤ë¬¼ ê°±ì  ìë¦¼ ë°°ë âââ */}
          {(() => {
            const urgentCount = listings.filter(l => {
              const b = getListingAgeBadge(l.created_at);
              return b.urgent && l.status === 'ê³µê°';
            }).length;
            if (urgentCount === 0) return null;
            return (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
                <span className="text-2xl">â ï¸</span>
                <div className="flex-1">
                  <span className="font-semibold text-amber-800">ê°±ì  íì ë§¤ë¬¼ {urgentCount}ê±´</span>
                  <span className="text-sm text-amber-600 ml-2">ë±ë¡ í 30ì¼ ì´ì ê²½ê³¼ë ê³µê° ë§¤ë¬¼ì´ ììµëë¤. íìë§¤ë¬¼ ë°©ì§ë¥¼ ìí´ ì ë³´ë¥¼ íì¸í´ì£¼ì¸ì.</span>
                </div>
              </div>
            );
          })()}

          {/* âââ ì¼ê´ ìì ë° âââ */}
        {selectedIds.size > 0 && (
          <div className="bg-blue-600 text-white rounded-xl p-3 mb-4 flex items-center justify-between shadow-lg animate-slide-in"
            style={{ animation: 'slideIn 0.2s ease-out' }}>
            <div className="flex items-center gap-3">
              <span className="bg-white/20 px-3 py-1 rounded-lg text-sm font-medium">
                {selectedIds.size}ê±´ ì í
              </span>
              <button
                onClick={() => { setSelectedIds(new Set()); setSelectAll(false); }}
                className="text-sm text-white/80 hover:text-white underline"
              >
                ì í í´ì 
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
                      <span className="animate-spin">â»</span> ì²ë¦¬ì¤...
                    </>
                  ) : (
                    <>
                      ì¼ê´ ìí ë³ê²½ <span className="text-xs">â¼</span>
                    </>
                  )}
                </button>
                {showBulkMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-20 py-1 min-w-[160px]">
                    {['ê³µê°', 'ë¹ê³µê°', 'ê³ì½ì¤', 'ê³ì½ìë£'].map((s) => (
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
              <button
                onClick={handleBulkDelete}
                disabled={bulkActionLoading}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                ì¼ê´ ì­ì 
              </button>
            </div>
          </div>
        )}

        {/* âââ ìë¬ âââ */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchListings} className="text-sm font-medium underline">ë¤ì ìë</button>
          </div>
        )}

        {/* âââ ë¡ë© âââ */}
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-16 text-center">
            <div className="animate-spin inline-block w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" />
            <p className="mt-4 text-gray-500 text-sm">ë§¤ë¬¼ì ë¶ë¬ì¤ë ì¤...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-16 text-center">
            <div className="text-5xl mb-4">{isFiltered ? 'ð' : 'ð­'}</div>
            <p className="text-gray-600 font-medium mb-2">
              {isFiltered ? 'ê²ì ê²°ê³¼ê° ììµëë¤' : 'ë±ë¡ë ë§¤ë¬¼ì´ ììµëë¤'}
            </p>
            {isFiltered ? (
              <button
                onClick={handleResetFilters}
                className="text-blue-600 text-sm hover:underline mt-2"
              >
                íí° ì´ê¸°í
              </button>
            ) : (
              <button
                onClick={() => router.push('/admin/listings/new')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm mt-3 transition-colors"
              >
                ì²« ë§¤ë¬¼ ë±ë¡íê¸°
              </button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          /* âââ íì´ë¸ ë·° âââ */
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
                      { field: 'title' as SortField, label: 'ì ëª©', width: 'min-w-[200px]' },
                      { field: 'address' as SortField, label: 'ì£¼ì', width: 'min-w-[160px]' },
                      { field: 'dong' as SortField, label: 'ë', width: 'w-20' },
                      { field: 'type' as SortField, label: 'ì í', width: 'w-20' },
                      { field: 'deal' as SortField, label: 'ê±°ë', width: 'w-16' },
                      { field: 'price' as SortField, label: 'ê°ê²©', width: 'w-24' },
                      { field: 'status' as SortField, label: 'ìí', width: 'w-28' },
                      { field: 'created_at' as SortField, label: 'ë±ë¡ì¼', width: 'w-24' },
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-24">ìì</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedListings.map((listing) => (
                    <tr
                      key={listing.id}
                      className={`hover:bg-blue-50/30 transition-colors ${
                        selectedIds.has(listing.id) ? 'bg-blue-50/50' : ''
                      } ${listing.status === 'ê³ì½ìë£' ? 'opacity-60' : ''}`}
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
                          {listing.title || '(ì ëª© ìì)'}
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
                          <option value="ê³µê°">ð¢ ê³µê°</option>
                          <option value="ë¹ê³µê°">âª ë¹ê³µê°</option>
                          <option value="ê³ì½ì¤">ð¡ ê³ì½ì¤</option>
                          <option value="ê³ì½ìë£">â ê³ì½ìë£</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-500">{formatDate(listing.created_at)}</div>
                        {(() => { const b = getListingAgeBadge(listing.created_at); return b.days >= 0 ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${b.color}`}>{b.label}</span> : null; })()}
                        {listing.updated_at && listing.updated_at !== listing.created_at && <div className="text-[10px] text-purple-500 mt-0.5" title={listing.updated_at}>ìì ë¨</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => router.push(`/admin/listings/${listing.id}/edit`)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ìì "
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                          onClick={() => router.push(`/admin/listings/new?copyFrom=${listing.id}`)}
                          className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="ë³µì¬"
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
                            title="ì­ì "
                          >
                            {deletingId === listing.id ? (
                              <span className="w-4 h-4 block animate-spin">â»</span>
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

            {/* íì´ì§ë¤ì´ì */}
            <div className="bg-gray-50/80 border-t border-gray-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span>
                  {((currentPage - 1) * pageSize + 1).toLocaleString()}-{Math.min(currentPage * pageSize, filtered.length).toLocaleString()}
                  {' / '}
                  {filtered.length.toLocaleString()}ê±´
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                >
                  {PAGE_SIZE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}ê±´ì©</option>
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
                    âª
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ï¼
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
                    ï¼
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    â«
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* âââ ì¹´ë ë·° âââ */
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedListings.map((listing) => (
                <div
                  key={listing.id}
                  className={`bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-all cursor-pointer group ${
                    selectedIds.has(listing.id) ? 'ring-2 ring-blue-500' : ''
                  } ${listing.status === 'ê³ì½ìë£' ? 'opacity-60' : ''}`}
                >
                  {/* ì¹´ë ìë¨: ì´ë¯¸ì§ ëë íë ì´ì¤íë */}
                  <div className="relative h-40 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    {listing.images && listing.images.length > 0 ? (
                      <img
                        src={listing.images[0]}
                        alt={listing.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-4xl">ð </span>
                    )}
                    {/* ì²´í¬ë°ì¤ */}
                    <div className="absolute top-2 left-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(listing.id)}
                        onChange={(e) => { e.stopPropagation(); handleSelectOne(listing.id); }}
                        className="w-5 h-5 rounded border-2 border-white/80 text-blue-600 focus:ring-blue-500 cursor-pointer shadow"
                      />
                    </div>
                    {/* ìí ë±ì§ */}
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

                  {/* ì¹´ë ë´ì© */}
                  <div className="p-4" onClick={() => router.push(`/admin/listings/${listing.id}/edit`)}>
                    <h3 className="font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                      {listing.title || '(ì ëª© ìì)'}
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
                      </div>
                    </div>
                  </div>

                  {/* ì¹´ë ì¡ì */}
                  <div className="px-4 pb-3 flex items-center gap-2">
                    <select
                      value={listing.status}
                      onChange={(e) => { e.stopPropagation(); handleStatusChange(listing.id, e.target.value); }}
                      disabled={updatingId === listing.id}
                      className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-gray-200 bg-gray-50 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="ê³µê°">ð¢ ê³µê°</option>
                      <option value="ë¹ê³µê°">âª ë¹ê³µê°</option>
                      <option value="ê³ì½ì¤">ð¡ ê³ì½ì¤</option>
                      <option value="ê³ì½ìë£">â ê³ì½ìë£</option>
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

            {/* ì¹´ë ë·° íì´ì§ë¤ì´ì */}
            {totalPages > 1 && (
              <div className="mt-4 bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-sm text-gray-500">
                  {((currentPage - 1) * pageSize + 1).toLocaleString()}-{Math.min(currentPage * pageSize, filtered.length).toLocaleString()}
                  {' / '}{filtered.length.toLocaleString()}ê±´
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="ml-3 px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                  >
                    {PAGE_SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}ê±´ì©</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                  >
                    âª
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                  >
                    ï¼
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
                    ï¼
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                  >
                    â«
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ê¸ë¡ë² CSS */}
      <style jsx global>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
