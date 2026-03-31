'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'wishes2026';
const getAuthHeader = () => 'Bearer ' + AUTH_TOKEN;

interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
  message: string;
  listing_id: number | null;
  status: string;
  memo: string | null;
  created_at: string;
  listings?: { title: string } | null;
}

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [editingMemo, setEditingMemo] = useState<number | null>(null);
  const [memoText, setMemoText] = useState('');
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const loadContacts = async () => {
    try {
      const resp = await fetch('/api/admin/contacts', {
        headers: { authorization: getAuthHeader() }
      });
      if (!resp.ok) throw new Error('Failed');
      const data = await resp.json();
      setContacts(data.contacts || data.data || []);
    } catch {
      setToast({ message: '상담 목록을 불러오지 못했습니다.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const updateContact = async (id: number, updates: { status?: string; memo?: string }) => {
    setUpdatingId(id);
    try {
      const resp = await fetch('/api/admin/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', authorization: getAuthHeader() },
        body: JSON.stringify({ id, ...updates })
      });
      if (!resp.ok) throw new Error('Failed');
      setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
      setToast({ message: '상담 정보가 업데이트되었습니다.', type: 'success' });
    } catch {
      setToast({ message: '업데이트에 실패했습니다.', type: 'error' });
    } finally {
      setUpdatingId(null);
      setEditingMemo(null);
    }
  };

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (statusFilter !== '전체' && c.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (c.name || '').toLowerCase().includes(q) ||
               (c.phone || '').includes(q) ||
               (c.email || '').toLowerCase().includes(q) ||
               (c.message || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [contacts, statusFilter, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { '전체': contacts.length };
    contacts.forEach(c => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return counts;
  }, [contacts]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case '접수': return 'bg-red-100 text-red-700';
      case '진행중': return 'bg-blue-100 text-blue-700';
      case '완료': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getTimeDiff = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return diff + '초 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    return Math.floor(diff / 86400) + '일 전';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">상담 관리</h1>
          <p className="text-sm text-gray-500 mt-1">총 {contacts.length}건의 상담</p>
        </div>
        <button
          onClick={loadContacts}
          className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          title="새로고침"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['전체', '접수', '진행중', '완료'].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              statusFilter === status
                ? 'bg-green-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {status} <span className="ml-1 opacity-70">{statusCounts[status] || 0}</span>
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div className="relative mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="이름, 전화번호, 이메일, 메시지로 검색..."
          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
      </div>

      {/* 상담 목록 */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            <p>상담 내역이 없습니다.</p>
          </div>
        ) : (
          filtered.map(contact => (
            <div key={contact.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5">
              <div className="flex items-start justify-between gap-4">
                {/* 좌측: 고객 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-gray-900 text-base">{contact.name || '미입력'}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(contact.status)}`}>
                      {contact.status}
                    </span>
                    <span className="text-xs text-gray-400">{getTimeDiff(contact.created_at)}</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mb-2">
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-green-600 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        {contact.phone}
                      </a>
                    )}
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-green-600 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        {contact.email}
                      </a>
                    )}
                  </div>

                  {contact.message && (
                    <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3 mb-2">{contact.message}</p>
                  )}

                  {contact.listings?.title && (
                    <div className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-1.5 w-fit">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                      관심 매물: {contact.listings.title}
                    </div>
                  )}

                  {/* 메모 */}
                  {editingMemo === contact.id ? (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={memoText}
                        onChange={(e) => setMemoText(e.target.value)}
                        placeholder="메모 입력..."
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') updateContact(contact.id, { memo: memoText }); }}
                      />
                      <button
                        onClick={() => updateContact(contact.id, { memo: memoText })}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => setEditingMemo(null)}
                        className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200"
                      >
                        취소
                      </button>
                    </div>
                  ) : contact.memo ? (
                    <div
                      className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-amber-100 transition"
                      onClick={() => { setEditingMemo(contact.id); setMemoText(contact.memo || ''); }}
                    >
                      📝 {contact.memo}
                    </div>
                  ) : null}
                </div>

                {/* 우측: 액션 버튼 */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <select
                    value={contact.status}
                    onChange={(e) => updateContact(contact.id, { status: e.target.value })}
                    disabled={updatingId === contact.id}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500"
                  >
                    <option value="접수">접수</option>
                    <option value="진행중">진행중</option>
                    <option value="완료">완료</option>
                  </select>
                  <button
                    onClick={() => { setEditingMemo(contact.id); setMemoText(contact.memo || ''); }}
                    className="px-3 py-2 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 transition"
                  >
                    메모 {contact.memo ? '수정' : '추가'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-500'
        } animate-fade-in`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}