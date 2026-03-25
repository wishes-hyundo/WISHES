'use client';

import { useState, useEffect, useRef } from 'react';
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
  deposit: number;
  monthly?: number | null;
  price?: number | null;
  maintenance_fee?: number;
  area_m2: number;
  area_supply_m2?: number | null;
  floor_current: string;
  floor_total?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  direction?: string | null;
  heating_type?: string | null;
  address: string;
  address_detail?: string | null;
  dong: string;
  description?: string | null;
  available_date?: string | null;
  built_year?: string | null;
  parking?: boolean;
  elevator?: boolean;
  pet?: boolean;
  balcony?: boolean;
  full_option?: boolean;
  loan_available?: boolean;
  status: '가용' | '계약중' | '계약완료';
  created_at: string;
  updated_at?: string;
}

interface Contact {
  id: number;
  name: string;
  phone: string;
  email?: string;
  message?: string;
  listingTitle?: string;
  status: '접수' | '처리중' | '완료';
  createdAt?: string;
  created_at?: string;
}

const INITIAL_LISTING = {
  title: '',
  type: '원룸' as const,
  deal: '월세' as const,
  deposit: 0,
  monthly: 0,
  price: undefined as number | undefined,
  maintenance_fee: 0,
  area_m2: 0,
  area_supply_m2: undefined as number | undefined,
  floor_current: '',
  floor_total: '',
  rooms: 1,
  bathrooms: 1,
  direction: '',
  heating_type: '개별난방',
  address: '',
  address_detail: '',
  dong: '',
  description: '',
  available_date: '',
  built_year: '',
  parking: false,
  elevator: false,
  pet: false,
  balcony: false,
  full_option: false,
  loan_available: true,
  status: '가용' as const,
};

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
  const [showAddForm, setShowAddForm] = useState(false);
  const [newListing, setNewListing] = useState({ ...INITIAL_LISTING });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // 이미지 업로드
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<{ url: string; path: string }[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      const [statsRes, listingsRes, contactsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/listings', { headers }),
        fetch('/api/admin/contacts', { headers }),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.data);
      }
      if (listingsRes.ok) {
        const data = await listingsRes.json();
        setListings(data.data);
      }
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

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(f => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(f.type)) { alert(f.name + ' - JPG, PNG, WebP만 가능합니다.'); return false; }
      if (f.size > 5 * 1024 * 1024) { alert(f.name + ' - 5MB를 초과합니다.'); return false; }
      return true;
    });
    if (validFiles.length === 0) return;
    setUploadingImages(true);
    setUploadProgress(0);
    const newImages: { url: string; path: string }[] = [];
    for (let i = 0; i < validFiles.length; i++) {
      const formData = new FormData();
      formData.append('file', validFiles[i]);
      try {
        const response = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: { authorization: getAuthHeader() },
          body: formData,
        });
        if (response.ok) {
          const data = await response.json();
          newImages.push({ url: data.data.url, path: data.data.path });
        }
      } catch (error) { console.error('Upload error:', error); }
      setUploadProgress(Math.round(((i + 1) / validFiles.length) * 100));
    }
    setUploadedImages(prev => [...prev, ...newImages]);
    setUploadingImages(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) { await processFiles(files); }
  };

  const handleAddListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      // API에 맞게 데이터 정리
      const payload: Record<string, any> = {
        title: newListing.title,
        type: newListing.type,
        deal: newListing.deal,
        deposit: newListing.deposit || 0,
        area_m2: newListing.area_m2,
        floor_current: newListing.floor_current,
        address: newListing.address,
        dong: newListing.dong,
        status: newListing.status,
      };

      // 선택 필드 (값이 있을 때만 전송)
      if (newListing.monthly) payload.monthly = newListing.monthly;
      if (newListing.price) payload.price = newListing.price;
      if (newListing.maintenance_fee) payload.maintenance_fee = newListing.maintenance_fee;
      if (newListing.area_supply_m2) payload.area_supply_m2 = newListing.area_supply_m2;
      if (newListing.floor_total) payload.floor_total = newListing.floor_total;
      if (newListing.rooms) payload.rooms = newListing.rooms;
      if (newListing.bathrooms) payload.bathrooms = newListing.bathrooms;
      if (newListing.direction) payload.direction = newListing.direction;
      if (newListing.heating_type) payload.heating_type = newListing.heating_type;
      if (newListing.address_detail) payload.address_detail = newListing.address_detail;
      if (newListing.description) payload.description = newListing.description;
      if (newListing.available_date) payload.available_date = newListing.available_date;
      if (newListing.built_year) payload.built_year = newListing.built_year;

      // 불린 필드
      payload.parking = newListing.parking;
      payload.elevator = newListing.elevator;
      payload.pet = newListing.pet;
      payload.balcony = newListing.balcony;
      payload.full_option = newListing.full_option;
      payload.loan_available = newListing.loan_available;

      const response = await fetch('/api/admin/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: getAuthHeader(),
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();

        // 이미지가 업로드되었으면 매물에 연결
        if (uploadedImages.length > 0 && data.data?.id) {
          for (let i = 0; i < uploadedImages.length; i++) {
            await fetch('/api/admin/upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                authorization: getAuthHeader(),
              },
              body: JSON.stringify({
                listingId: data.data.id,
                url: uploadedImages[i].url,
                sort_order: i,
                is_thumbnail: i === 0,
              }),
            });
          }
        }

        setListings([data.data, ...listings]);
        setNewListing({ ...INITIAL_LISTING });
        setUploadedImages([]);
        setShowAddForm(false);
        setSubmitSuccess('매매이 성공적으로 등록되었습니다!');
        setTimeout(() => setSubmitSuccess(''), 3000);
      } else {
        const errData = await response.json();
        setSubmitError(errData.error || '매물 등록에 실패했습니다');
      }
    } catch (error) {
      console.error('매물 추가 오류:', error);
      setSubmitError('매물 등록 중 오류가 발생했습니다');
    } finally {
      setSubmitLoading(false);
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

  // 가격 표시 헬퍼
  const formatPrice = (listing: Listing) => {
    if (listing.deal === '매매') return `매매 ${(listing.price || 0).toLocaleString()}만원`;
    if (listing.deal === '전세') return `전세 ${listing.deposit.toLocaleString()}만원`;
    return `${listing.deposit.toLocaleString()}/${listing.monthly || 0}만원`;
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary text-sm';
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

  // ─── 로그인 화면 ───
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

  // ─── 대시보드 탭 ───
  if (tab === 'dashboard') {
    return (
      <div>
        <h2 className="text-3xl font-bold text-wishes-primary mb-8">대시보드</h2>

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">전체 매물</p>
              <p className="text-3xl font-bold text-wishes-primary">{stats.totalListings}</p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">가용</p>
              <p className="text-3xl font-bold text-green-600">{stats.activeListings}</p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">계약중</p>
              <p className="text-3xl font-bold text-wishes-accent">{stats.contractingListings}</p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">계약완료</p>
              <p className="text-3xl font-bold text-blue-600">{stats.completedListings}</p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">미처리 상담</p>
              <p className="text-3xl font-bold text-red-600">{stats.pendingContacts}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a href="/admin?tab=listings" className="card-premium p-6 cursor-pointer hover:shadow-lg transition">
            <p className="text-2xl mb-2">🏠</p>
            <h3 className="font-bold text-wishes-primary mb-2">매물 관리</h3>
            <p className="text-sm text-gray-600">{listings.length}개의 매물 관리</p>
          </a>
          <a href="/admin?tab=contacts" className="card-premium p-6 cursor-pointer hover:shadow-lg transition">
            <p className="text-2xl mb-2">📞</p>
            <h3 className="font-bold text-wishes-primary mb-2">상담 관리</h3>
            <p className="text-sm text-gray-600">{contacts.length}개의 상담 기록</p>
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

  // ─── 매물 관리 탭 ───
  if (tab === 'listings') {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-wishes-primary">매물 관리</h2>
          <button
                onClick={() => router.push('/admin/listings/new')}
                className="bg-wishes-secondary text-white px-6 py-3 rounded-lg hover:bg-wishes-primary transition font-semibold"
              >
                + 스마트 매물 등록
              </button>
        </div>

        {submitSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
            {submitSuccess}
          </div>
        )}

        {/* ── 매물 추가 폼 ── */}
        {/* 매물 등록은 스마트 매물 등록 페이지에서 진행 */}

        {/* ── 매물 목록 ── */}
        <div className="space-y-3">
          {listings.length === 0 ? (
            <div className="card-premium p-8 text-center text-gray-600">
              등록된 매물이 없습니다. 위의 &quot;새 매물 등록&quot; 버튼을 클릭해서 매물을 추가해보세요.
            </div>
          ) : (
            listings.map((listing) => (
              <div key={listing.id} className="card-premium p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-wishes-primary">{listing.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {listing.address} | {listing.type} | {listing.deal}
                    </p>
                  </div>
                  <div className="flex gap-2 items-center ml-4">
                    <select
                      value={listing.status}
                      onChange={(e) => handleStatusChange(listing.id, e.target.value)}
                      className={`px-2 py-1 border rounded-lg text-xs font-medium ${
                        listing.status === '가용'
                          ? 'border-green-300 text-green-700 bg-green-50'
                          : listing.status === '계약중'
                          ? 'border-orange-300 text-orange-700 bg-orange-50'
                          : 'border-blue-300 text-blue-700 bg-blue-50'
                      }`}
                    >
                      <option value="가용">가용</option>
                      <option value="계약중">계약중</option>
                      <option value="계약완료">계약완료</option>
                    </select>
                    <button
                      onClick={() => handleDeleteListing(listing.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-xs"
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">가격</p>
                    <p className="font-semibold text-wishes-primary">{formatPrice(listing)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">면적</p>
                    <p className="font-semibold">{listing.area_m2}m²</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">층</p>
                    <p className="font-semibold">
                      {listing.floor_current}{listing.floor_total ? `/${listing.floor_total}` : ''}층
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">방/욕실</p>
                    <p className="font-semibold">
                      {listing.rooms || '-'}방 / {listing.bathrooms || '-'}욕실
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">등록일</p>
                    <p className="font-semibold text-xs">
                      {new Date(listing.created_at).toLocaleDateString('ko-KR')}
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

  // ─── 상담 관리 탭 ───
  if (tab === 'contacts') {
    return (
      <div>
        <h2 className="text-2xl font-bold text-wishes-primary mb-6">상담 관리</h2>

        <div className="space-y-3">
          {contacts.length === 0 ? (
            <div className="card-premium p-8 text-center text-gray-600">
              상담 내역이 없습니다
            </div>
          ) : (
            contacts.map((contact) => (
              <div key={contact.id} className="card-premium p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-wishes-primary">{contact.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
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
                    onChange={(e) => handleContactStatusChange(contact.id, e.target.value)}
                    className={`px-2 py-1 border rounded-lg text-xs font-medium ${
                      contact.status === '접수'
                        ? 'border-red-300 text-red-700 bg-red-50'
                        : contact.status === '처리중'
                        ? 'border-yellow-300 text-yellow-700 bg-yellow-50'
                        : 'border-green-300 text-green-700 bg-green-50'
                    }`}
                  >
                    <option value="접수">접수</option>
                    <option value="처리중">처리중</option>
                    <option value="완료">완료</option>
                  </select>
                </div>

                {contact.message && (
                  <p className="text-gray-700 text-sm mb-3 p-3 bg-gray-50 rounded-lg">
                    {contact.message}
                  </p>
                )}

                <p className="text-xs text-gray-400">
                  {new Date(contact.createdAt || contact.created_at || '').toLocaleString('ko-KR')}
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
