'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Listing {
  id: number;
  title: string;
  address: string;
  dong: string;
  type: string;
  transaction_type: string;
  price: string;
  status: string;
  created_at: string;
}

type StatusFilter = '전체' | '가용' | '계약중' | '계약완료';

const STATUS_OPTIONS: StatusFilter[] = ['전체', '가용', '계약중', '계약완료'];

const STATUS_COLORS: Record<string, string> = {
  '가용': 'bg-green-100 text-green-800 border-green-200',
  '계약중': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  '계약완료': 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function AdminListingsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('전체');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchListings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/listings', {
        headers: { 'Authorization': 'Bearer wishes2026' },
      });
      if (!res.ok) throw new Error('API 오류: ' + res.status);
      const json = await res.json();
      setListings(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '매물을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const filtered = listings.filter((l) => {
    if (statusFilter !== '전체' && l.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        String(l.id).includes(q) ||
        (l.title || '').toLowerCase().includes(q) ||
        (l.address || '').toLowerCase().includes(q) ||
        (l.dong || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const countByStatus = (s: string) =>
    s === '전체' ? listings.length : listings.filter((l) => l.status === s).length;

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
      if (!res.ok) throw new Error('상태 변경 실패');
      setListings((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l))
      );
    } catch (err) {
      alert('상태 변경 오류: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('매물 #' + id + '을(를) 정말 삭제하시겠습니까?')) return;
    try {
      setDeletingId(id);
      const res = await fetch('/api/admin/listings/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer wishes2026' },
      });
      if (!res.ok) throw new Error('삭제 실패');
      setListings((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      alert('삭제 오류: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">매물 관리</h1>
          <p className="text-gray-500 text-sm mt-1">총 {listings.length}건의 매물</p>
        </div>
        <button
          onClick={() => router.push('/admin/listings/new')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-5 rounded-lg transition-colors flex items-center gap-2"
        >
          <span>+</span> 새 매물 등록
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {s} ({countByStatus(s)})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="매물번호, 제목, 주소, 동으로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button onClick={fetchListings} className="ml-3 underline">다시 시도</button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          <p className="mt-4 text-gray-500">매물을 불러오는 중...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          {searchQuery ? '검색 결과가 없습니다' : '등록된 매물이 없습니다'}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">제목</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">주소</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">동</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">유형</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">거래</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">가격</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">상태</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((listing) => (
                  <tr key={listing.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">#{listing.id}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[200px] truncate">
                      {listing.title}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px] truncate">{listing.address}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{listing.dong}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{listing.type}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{listing.transaction_type}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{listing.price}</td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={listing.status}
                        onChange={(e) => handleStatusChange(listing.id, e.target.value)}
                        disabled={updatingId === listing.id}
                        className={`px-2 py-1 rounded text-xs font-medium border cursor-pointer ${
                          STATUS_COLORS[listing.status] || 'bg-gray-100 text-gray-600 border-gray-200'
                        } ${updatingId === listing.id ? 'opacity-50' : ''}`}
                      >
                        <option value="가용">가용</option>
                        <option value="계약중">계약중</option>
                        <option value="계약완료">계약완료</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => handleDelete(listing.id)}
                        disabled={deletingId === listing.id}
                        className="text-red-600 hover:text-red-800 font-medium text-xs disabled:opacity-50"
                      >
                        {deletingId === listing.id ? '삭제중...' : '삭제'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-gray-50 px-4 py-2 border-t text-xs text-gray-500">
            표시: {filtered.length}건 / 전체: {listings.length}건
          </div>
        </div>
      )}
    </div>
  );
}
