'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface Stats {
  totalListings: number;
  activeListings: number;
  contractingListings: number;
  completedListings: number;
  pendingContacts: number;
}

interface Listing {
  id: number;
  title: string;
  type: string;
  deal: string;
  address: string;
  status: '가용' | '계약중' | '계약완료';
  deposit: number;
  monthly?: number;
  price?: number;
  createdAt: string;
}

interface Contact {
  id: number;
  name: string;
  phone: string;
  email?: string;
  message?: string;
  listingTitle?: string;
  status: '접수' | '처리중' | '완료';
  createdAt: string;
}

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'dashboard';

  // 인증
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');

  // 데이터
  const [stats, setStats] = useState<Stats | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  // 폼 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newListing, setNewListing] = useState({
    title: '',
    type: '원룸' as const,
    deal: '전세' as const,
    deposit: 0,
    monthly: undefined,
    price: undefined,
    area: 0,
    floor: '1층',
    address: '',
    dong: '',
    status: '가용' as const,
    description: '',
  });

  const getAuthHeader = () => `Bearer ${password}`;

  // 인증 체크
  useEffect(() => {
    const savedPassword = localStorage.getItem('admin_password');
    if (savedPassword) {
      setPassword(savedPassword);
      setIsAuthenticated(true);
      fetchData(savedPassword);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/stats', {
        headers: { authorization: getAuthHeader() },
      });
      if (response.ok) {
        localStorage.setItem('admin_password', password);
        setIsAuthenticated(true);
        setAuthError('');
        fetchData(password);
      } else {
        setAuthError('암호가 올바르지 않습니다');
      }
    } catch (error) {
      setAuthError('인증에 실패했습니다');
    }
  };

  const fetchData = async (pwd: string) => {
    setLoading(true);
    try {
      const headers = { authorization: `Bearer ${pwd}` };

      // 통계 조회
      const statsRes = await fetch('/api/admin/stats', { headers });
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.data);
      }

      // 매물 조회
      const listingsRes = await fetch('/api/admin/listings', { headers });
      if (listingsRes.ok) {
        const data = await listingsRes.json();
        setListings(data.data);
      }

      // 상담 조회
      const contactsRes = await fetch('/api/admin/contacts', { headers });
      if (contactsRes.ok) {
        const data = await contactsRes.json();
        setContacts(data.data);
      }
    } catch (error) {
      console.error('데이터 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddListing = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: getAuthHeader(),
        },
        body: JSON.stringify(newListing),
      });

      if (response.ok) {
        const data = await response.json();
        setListings([...listings, data.data]);
        setNewListing({
          title: '',
          type: '원룸',
          deal: '전세',
          deposit: 0,
          monthly: undefined,
          price: undefined,
          area: 0,
          floor: '1층',
          address: '',
          dong: '',
          status: '가용',
          description: '',
        });
        setShowAddForm(false);
      }
    } catch (error) {
      console.error('매물 추가 오류:', error);
    }
  };

  const handleDeleteListing = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/admin/listings/${id}`, {
        method: 'DELETE',
        headers: { authorization: getAuthHeader() },
      });

      if (response.ok) {
        setListings(listings.filter((l) => l.id !== id));
      }
    } catch (error) {
      console.error('삭제 오류:', error);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/listings/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: getAuthHeader(),
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        const data = await response.json();
        setListings(listings.map((l) => (l.id === id ? data.data : l)));
      }
    } catch (error) {
      console.error('상태 변경 오류:', error);
    }
  };

  const handleContactStatusChange = async (id: number, newStatus: string) => {
    try {
      const response = await fetch('/api/admin/contacts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: getAuthHeader(),
        },
        body: JSON.stringify({ id, status: newStatus }),
      });

      if (response.ok) {
        const data = await response.json();
        setContacts(contacts.map((c) => (c.id === id ? data.data : c)));
      }
    } catch (error) {
      console.error('상태 변경 오류:', error);
    }
  };

  // 로그인 화면
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wishes-primary to-wishes-secondary p-4">
        <div className="bg-white rounded-2xl shadow-premium p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-wishes-primary mb-2">WISHES</h1>
          <p className="text-gray-600 mb-6">관리자 로그인</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="암호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary"
            />
            {authError && <p className="text-red-600 text-sm">{authError}</p>}
            <button
              type="submit"
              className="w-full bg-wishes-secondary text-white py-3 rounded-lg font-semibold hover:bg-wishes-primary transition"
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 대시보드 탭
  if (tab === 'dashboard') {
    return (
      <div>
        <h2 className="text-3xl font-bold text-wishes-primary mb-8">대시보드</h2>

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">전체 매물</p>
              <p className="text-3xl font-bold text-wishes-primary">
                {stats.totalListings}
              </p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">가용</p>
              <p className="text-3xl font-bold text-green-600">
                {stats.activeListings}
              </p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">계약중</p>
              <p className="text-3xl font-bold text-wishes-accent">
                {stats.contractingListings}
              </p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">계약완료</p>
              <p className="text-3xl font-bold text-blue-600">
                {stats.completedListings}
              </p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">
                미처리 상담
              </p>
              <p className="text-3xl font-bold text-red-600">
                {stats.pendingContacts}
              </p>
            </div>
          </div>
        )}

        {/* 빠른 링크 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/admin?tab=listings"
            className="card-premium p-6 cursor-pointer"
          >
            <p className="text-2xl mb-2">🏠</p>
            <h3 className="font-bold text-wishes-primary mb-2">매물 관리</h3>
            <p className="text-sm text-gray-600">
              {listings.length}개의 매물 관리
            </p>
          </a>
          <a
            href="/admin?tab=contacts"
            className="card-premium p-6 cursor-pointer"
          >
            <p className="text-2xl mb-2">📞</p>
            <h3 className="font-bold text-wishes-primary mb-2">상담 관리</h3>
            <p className="text-sm text-gray-600">
              {contacts.length}개의 상담 기록
            </p>
          </a>
          <div className="card-premium p-6">
            <p className="text-2xl mb-2">⚙️</p>
            <h3 className="font-bold text-wishes-primary mb-2">설정</h3>
            <p className="text-sm text-gray-600">사이트 설정 관리</p>
          </div>
        </div>
      </div>
    );
  }

  // 매물 관리 탭
  if (tab === 'listings') {
    return (
      <div>
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold text-wishes-primary">매물 관리</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-wishes-secondary text-white px-6 py-2 rounded-lg hover:bg-wishes-primary transition font-semibold"
          >
            {showAddForm ? '취소' : '매물 추가'}
          </button>
        </div>

        {/* 추가 폼 */}
        {showAddForm && (
          <div className="card-premium p-6 mb-8">
            <form onSubmit={handleAddListing} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="제목"
                  value={newListing.title}
                  onChange={(e) =>
                    setNewListing({ ...newListing, title: e.target.value })
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary"
                  required
                />
                <select
                  value={newListing.type}
                  onChange={(e) =>
                    setNewListing({
                      ...newListing,
                      type: e.target.value as any,
                    })
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary"
                >
                  <option>원룸</option>
                  <option>투룸</option>
                  <option>쓰리룸</option>
                  <option>오피스텔</option>
                  <option>아파트</option>
                  <option>상가</option>
                  <option>사무실</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select
                  value={newListing.deal}
                  onChange={(e) =>
                    setNewListing({
                      ...newListing,
                      deal: e.target.value as any,
                    })
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option>전세</option>
                  <option>월세</option>
                  <option>매매</option>
                </select>
                <input
                  type="number"
                  placeholder="보증금"
                  value={newListing.deposit}
                  onChange={(e) =>
                    setNewListing({
                      ...newListing,
                      deposit: parseInt(e.target.value),
                    })
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                />
                <input
                  type="number"
                  placeholder="월세"
                  value={newListing.monthly || ''}
                  onChange={(e) =>
                    setNewListing({
                      ...newListing,
                      monthly: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="주소"
                  value={newListing.address}
                  onChange={(e) =>
                    setNewListing({ ...newListing, address: e.target.value })
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="동"
                  value={newListing.dong}
                  onChange={(e) =>
                    setNewListing({ ...newListing, dong: e.target.value })
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  type="number"
                  placeholder="면적"
                  step="0.1"
                  value={newListing.area}
                  onChange={(e) =>
                    setNewListing({
                      ...newListing,
                      area: parseFloat(e.target.value),
                    })
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="층"
                  value={newListing.floor}
                  onChange={(e) =>
                    setNewListing({ ...newListing, floor: e.target.value })
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                />
                <select
                  value={newListing.status}
                  onChange={(e) =>
                    setNewListing({
                      ...newListing,
                      status: e.target.value as any,
                    })
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option>가용</option>
                  <option>계약중</option>
                  <option>계약완료</option>
                </select>
              </div>

              <textarea
                placeholder="설명"
                value={newListing.description}
                onChange={(e) =>
                  setNewListing({ ...newListing, description: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                rows={3}
              />

              <button
                type="submit"
                className="w-full bg-wishes-secondary text-white py-2 rounded-lg hover:bg-wishes-primary transition font-semibold"
              >
                매물 추가
              </button>
            </form>
          </div>
        )}

        {/* 매물 목록 */}
        <div className="space-y-4">
          {listings.length === 0 ? (
            <div className="card-premium p-8 text-center text-gray-600">
              매물이 없습니다
            </div>
          ) : (
            listings.map((listing) => (
              <div key={listing.id} className="card-premium p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-wishes-primary">
                      {listing.title}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {listing.address} | {listing.type} | {listing.deal}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={listing.status}
                      onChange={(e) =>
                        handleStatusChange(listing.id, e.target.value)
                      }
                      className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
                    >
                      <option>가용</option>
                      <option>계약중</option>
                      <option>계약완료</option>
                    </select>
                    <button
                      onClick={() => handleDeleteListing(listing.id)}
                      className="px-4 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">보증금</p>
                    <p className="font-semibold text-wishes-primary">
                      {listing.deposit}만원
                    </p>
                  </div>
                  {listing.monthly && (
                    <div>
                      <p className="text-gray-600">월세</p>
                      <p className="font-semibold text-wishes-primary">
                        {listing.monthly}만원
                      </p>
                    </div>
                  )}
                  {listing.price && (
                    <div>
                      <p className="text-gray-600">매매가</p>
                      <p className="font-semibold text-wishes-primary">
                        {listing.price}만원
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-600">면적</p>
                    <p className="font-semibold text-wishes-primary">
                      {listing.area}m²
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // 상담 관리 탭
  if (tab === 'contacts') {
    return (
      <div>
        <h2 className="text-3xl font-bold text-wishes-primary mb-8">상담 관리</h2>

        <div className="space-y-4">
          {contacts.length === 0 ? (
            <div className="card-premium p-8 text-center text-gray-600">
              상담이 없습니다
            </div>
          ) : (
            contacts.map((contact) => (
              <div key={contact.id} className="card-premium p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-wishes-primary">
                      {contact.name}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {contact.phone}
                      {contact.email && ` | ${contact.email}`}
                    </p>
                    {contact.listingTitle && (
                      <p className="text-sm text-wishes-secondary font-medium mt-1">
                        📍 {contact.listingTitle}
                      </p>
                    )}
                  </div>
                  <select
                    value={contact.status}
                    onChange={(e) =>
                      handleContactStatusChange(contact.id, e.target.value)
                    }
                    className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
                  >
                    <option>접수</option>
                    <option>처리중</option>
                    <option>완료</option>
                  </select>
                </div>

                {contact.message && (
                  <p className="text-gray-700 mb-4 p-3 bg-gray-50 rounded-lg">
                    {contact.message}
                  </p>
                )}

                <p className="text-xs text-gray-500">
                  {new Date(contact.createdAt).toLocaleString('ko-KR')}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return null;
}
