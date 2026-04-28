'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminDashboardCharts } from '@/components/AdminDashboardCharts';
import { ExcelUpload } from '@/components/ExcelUpload';
import { ContractRenewalAlert } from '@/components/ContractRenewalAlert';
// T5-5: 중개사 일일 브리핑 패널 (조회수 TOP / 최근 등록 / 미처리 상담 / 거래유형 분포)
import AdminBriefingPanel from '@/components/AdminBriefingPanel';
// T5-7: 매물 알림 구독자 + 뉴스레터 발송 패널
import AdminNewsletterPanel from '@/components/AdminNewsletterPanel';
// #23: 오늘 할 일 위젯 (파이프라인 상태별 미처리 리드 요약)
import AdminTodayPanel from '@/components/AdminTodayPanel';
// #27/#31/#37/#38: 주간 전환율 추이 + 이탈 분석 + 리드 소스 카드
import AdminConversionPanel from '@/components/AdminConversionPanel';
// #45/#47: 방문 예약 관리 탭
import AdminAppointmentsPanel from '@/components/AdminAppointmentsPanel';
import { formatFloorWithTotal } from '@/lib/formatFloor';
// L-v7-precond (2026-04-22): 선결조건 노트 — /admin API 에러 3건 가시화 (v7 §9)
import { PreconditionNote } from '@/features/map-2026/components/PreconditionNote';
// L-sec147 (2026-04-23, C-2 phase 3b): adminFetch wrapper for CSRF + cookie + Bearer.
import { adminFetch } from '@/lib/adminFetch';

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
  status: '공개' | '비공개' | '계약중' | '계약완료';
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
  status: '공개' as const,
};

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'dashboard';

  // 인증
  // L-sec153 (2026-04-23): 레거시 마스터 패스워드 UI 제거.
  //   과거엔 이 페이지가 단일 password 입력 → /api/admin/stats Bearer 로
  //   env WISHES_ADMIN_MASTER_PASSWORD 일치 여부를 판정하는 "슈퍼 관리자
  //   전용 쪽문" 이었음. admin-auth.html 로 Supabase Auth + role/status
  //   체계를 전면 도입했음에도 /admin 루트는 구 화면 그대로였다 → 마스터
  //   패스워드만 알면 role='agent' 승인 체계 우회 가능한 실제 취약.
  //   L-sec153 에서 폼 자체를 제거하고, 진입 시 토큰 없으면 즉시
  //   /admin/admin-auth.html 로 리다이렉트한다. 서버측 verifyAdminAuth
  //   의 MASTER_PASSWORD 경로는 크롤러 브리지가 아직 의존하므로 별도
  //   단계(L-sec154 / Phase 3c)에서 제거 예정.
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAuthHeader = () => `Bearer ${password}`;

  // 인증 체크
  // L-sec153 (2026-04-23): ws_token (Supabase JWT, admin-auth.html 에서 저장) 을
  //   1순위로 사용. 과거 sessionStorage 'admin_password' 에 박혀있던 마스터
  //   패스워드는 2순위 fallback 으로 유지하되, 토큰이 아예 없으면 /admin 루트
  //   에서 어떤 폼도 보여주지 않고 즉시 admin-auth.html 로 redirect.
  //   localStorage 에 과거 저장된 레거시 값은 발견 즉시 제거.
  useEffect(() => {
    let savedToken: string | null = null;
    try {
      // 1) Supabase JWT (admin-auth.html 로그인 후 저장)
      savedToken = sessionStorage.getItem('ws_token');
      // 2) 레거시 마스터 패스워드 fallback (과거 세션 유지용, Phase 3c 에서 제거)
      if (!savedToken) {
        savedToken = sessionStorage.getItem('admin_password');
      }
      // 3) 아주 오래된 localStorage 레거시 → sessionStorage 로 이관 후 제거
      if (!savedToken) {
        const legacy = localStorage.getItem('admin_password');
        if (legacy) {
          sessionStorage.setItem('admin_password', legacy);
          localStorage.removeItem('admin_password');
          savedToken = legacy;
        }
      }
    } catch {}

    if (savedToken) {
      setPassword(savedToken);
      setIsAuthenticated(true);
      fetchData(savedToken);
      return;
    }

    // L-sec153: 토큰 없음 → Supabase Auth 로그인 페이지로 강제 이동.
    //   과거에 여기서 마스터 패스워드 입력 폼이 나왔던 자리.
    try {
      window.location.replace('/admin/admin-auth.html');
    } catch {}
  }, []);

  const fetchData = async (pwd: string) => {
    setLoading(true);
    try {
      const headers = { authorization: `Bearer ${pwd}` };

      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
      const [statsRes, listingsRes, contactsRes] = await Promise.all([
        adminFetch('/api/admin/stats', { headers }),
        // L-search8 (2026-04-24): fields=minimal 전환 — non-minimal full-scan JOIN
        //   (.select('*, listing_images(*)')) 는 timeout/cache 보호 없이 6,204행을
        //   PAGE_SIZE 1000 sequential 로 가져와 Vercel cold-start 시 10s 위험.
        //   dashboard 가 쓰는 필드는 모두 minimal selectFields 에 포함됨.
        adminFetch('/api/admin/listings?fields=minimal', { headers }),
        adminFetch('/api/admin/contacts', { headers }),
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
      if (!validTypes.includes(f.type)) {
        alert(`"${f.name}" - 지원하지 않는 형식입니다. (JPG, PNG, WebP만 가능)`);
        return false;
      }
      if (f.size > 5 * 1024 * 1024) {
        alert(`"${f.name}" - 파일 크기가 5MB를 초과합니다.`);
        return false;
      }
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
        // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
        const response = await adminFetch('/api/admin/upload', {
          method: 'POST',
          headers: { authorization: getAuthHeader() },
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          newImages.push({ url: data.data.url, path: data.data.path });
        }
      } catch (error) {
        console.error('이미지 업로드 오류:', error);
      }
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFiles(files);
    }
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
      if (newListing.maintenance_fee != null) payload.maintenance_fee = newListing.maintenance_fee;
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

      // 업로드된 이미지 URL 배열을 payload에 포함 (서버에서 listing_images에 자동 연결)
      if (uploadedImages.length > 0) {
        payload.images = uploadedImages.map((img: { url: string; path: string }) => img.url);
      }

      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
      const response = await adminFetch('/api/admin/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: getAuthHeader(),
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();

        setListings([data.data, ...listings]);
        setNewListing({ ...INITIAL_LISTING });
        setUploadedImages([]);
        setShowAddForm(false);
        setSubmitSuccess('매물이 성공적으로 등록되었습니다!');
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
      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
      const response = await adminFetch(`/api/admin/listings/${id}`, {
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
      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
      const response = await adminFetch(`/api/admin/listings/${id}`, {
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
      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
      const response = await adminFetch('/api/admin/contacts', {
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
    if (listing.deal === '매매') return `매매 ${(listing.price || 0).toLocaleString('ko-KR')}만원`;
    if (listing.deal === '전세') return `전세 ${listing.deposit.toLocaleString('ko-KR')}만원`;
    return `${listing.deposit.toLocaleString('ko-KR')}/${listing.monthly || 0}만원`;
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary text-sm';
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

  // ─── 로그인 페이지로 이동 중 (L-sec153) ───
  // useEffect 에서 /admin/admin-auth.html 로 replace 처리됨.
  // 리다이렉트가 실행되기 직전까지 표시되는 중간 상태.
  // 과거엔 이 자리에 레거시 마스터 패스워드 입력 폼(한 줄짜리)이 있었음.
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wishes-primary to-wishes-secondary p-4">
        <div className="bg-white rounded-2xl shadow-premium p-8 w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-wishes-primary mb-2">WISHES</h1>
          <p className="text-gray-600 mb-6">관리자 로그인 페이지로 이동 중...</p>
          <a
            href="/admin/admin-auth.html"
            className="inline-block w-full bg-wishes-secondary text-white py-3 rounded-lg font-semibold hover:bg-wishes-primary transition"
          >
            로그인 페이지로 이동
          </a>
        </div>
      </div>
    );
  }

  // ─── 대시보드 탭 ───
  if (tab === 'dashboard') {
    return (
      <div>
        <h2 className="text-3xl font-bold text-wishes-primary mb-8">대시보드</h2>

        {/* L-v7-precond (2026-04-22): 선결조건 3건 (listings 500 / admin-stats 504 / dedup 400) */}
        <div className="mb-6">
          <PreconditionNote />
        </div>

        {/* T5-5: 중개사 일일 브리핑 패널 */}
        <div className="mb-8">
          <AdminBriefingPanel authHeader={getAuthHeader()} />
        </div>

        {/* #23: 오늘 할 일 (미처리 리드 + 오늘 방문예약) */}
        {/* L-dashboard-collapse (2026-04-24): 판넬들을 details 로 감싸 접기 가능.
            오늘 할 일은 기본 펼침, 나머지 3개(전환율/방문예약/뉴스레터) 는 기본
            접힘 — 현재 모두 0건이라 대시보드 공간을 차지하는 것 대비 가치가 낮음.
            사용자가 필요할 때만 펼쳐서 확인하도록 UX 정리. */}
        <details className="mb-8 group" open>
          <summary className="cursor-pointer select-none flex items-center gap-2 text-sm font-bold text-wishes-primary mb-3 hover:opacity-80">
            <span className="transition-transform group-open:rotate-90">▶</span>
            <span>오늘 할 일</span>
          </summary>
          <AdminTodayPanel authHeader={getAuthHeader()} />
        </details>

        {/* #27/#31/#37/#38: 주간 전환율 + 이탈 사유 + 리드 소스 분석 */}
        <details className="mb-8 group">
          <summary className="cursor-pointer select-none flex items-center gap-2 text-sm font-bold text-wishes-primary mb-3 hover:opacity-80">
            <span className="transition-transform group-open:rotate-90">▶</span>
            <span>주간 전환율 · 이탈 사유 · 리드 소스</span>
          </summary>
          <AdminConversionPanel authHeader={getAuthHeader()} />
        </details>

        {/* #45/#47: 방문 예약 관리 */}
        <details className="mb-8 group">
          <summary className="cursor-pointer select-none flex items-center gap-2 text-sm font-bold text-wishes-primary mb-3 hover:opacity-80">
            <span className="transition-transform group-open:rotate-90">▶</span>
            <span>방문 예약 관리</span>
          </summary>
          <AdminAppointmentsPanel authToken={getAuthHeader()} />
        </details>

        {/* T5-7: 매물 알림 구독 / 뉴스레터 */}
        <details className="mb-8 group">
          <summary className="cursor-pointer select-none flex items-center gap-2 text-sm font-bold text-wishes-primary mb-3 hover:opacity-80">
            <span className="transition-transform group-open:rotate-90">▶</span>
            <span>매물 알림 구독 · 뉴스레터</span>
          </summary>
          <AdminNewsletterPanel authHeader={getAuthHeader()} />
        </details>

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">전체 매물</p>
              <p className="text-3xl font-bold text-wishes-primary">{stats.totalListings}</p>
            </div>
            <div className="card-premium p-6">
              <p className="text-gray-600 text-sm font-medium mb-2">공개</p>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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

        {/* V4-24: 계약 갱신 알림 */}
        {listings.length > 0 && (
          <div className="mb-8">
            <ContractRenewalAlert listings={listings} />
          </div>
        )}

        {/* V3-20: 통계 차트 */}
        {listings.length > 0 && (
          <AdminDashboardCharts listings={listings} />
        )}
      </div>
    );
  }

  // ─── 매물 관리 탭 ───
  if (tab === 'listings') {
    return (
      <div>
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <h2 className="text-2xl font-bold text-wishes-primary">매물 관리</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowExcelUpload(!showExcelUpload)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition font-semibold text-sm"
            >
              {showExcelUpload ? '닫기' : '📊 엑셀 일괄등록'}
            </button>
            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                setSubmitError('');
                setSubmitSuccess('');
              }}
              className="bg-wishes-secondary text-white px-6 py-2 rounded-lg hover:bg-wishes-primary transition font-semibold"
            >
              {showAddForm ? '취소' : '+ 새 매물 등록'}
            </button>
          </div>
        </div>

        {submitSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
            {submitSuccess}
          </div>
        )}

        {/* V4-19: 엑셀 일괄등록 */}
        {showExcelUpload && (
          <div className="mb-6">
            <ExcelUpload
              authHeader={getAuthHeader()}
              onSubmit={async (parsedListings) => {
                let successCount = 0;
                let failCount = 0;
                for (const listing of parsedListings) {
                  try {
                    // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
                    const res = await adminFetch('/api/admin/listings', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        authorization: getAuthHeader(),
                      },
                      body: JSON.stringify(listing),
                    });
                    if (res.ok) {
                      successCount++;
                    } else {
                      failCount++;
                    }
                  } catch {
                    failCount++;
                  }
                }
                setSubmitSuccess(`엑셀 일괄등록 완료: ${successCount}건 성공${failCount > 0 ? `, ${failCount}건 실패` : ''}`);
                setTimeout(() => setSubmitSuccess(''), 5000);
                setShowExcelUpload(false);
                fetchData(password);
              }}
            />
          </div>
        )}

        {/* ── 매물 추가 폼 ── */}
        {showAddForm && (
          <div className="card-premium p-6 mb-6">
            <h3 className="text-lg font-bold text-wishes-primary mb-4">새 매물 등록</h3>

            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                {submitError}
              </div>
            )}

            <form onSubmit={handleAddListing} className="space-y-5">
              {/* 기본 정보 */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">기본 정보</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-3">
                    <label className={labelClass}>매물 제목 *</label>
                    <input
                      type="text"
                      placeholder="예: 신림동 역세권 신축 원룸"
                      value={newListing.title}
                      onChange={(e) => setNewListing({ ...newListing, title: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>매물 유형 *</label>
                    <select
                      value={newListing.type}
                      onChange={(e) => setNewListing({ ...newListing, type: e.target.value as any })}
                      className={inputClass}
                    >
                      <option value="원룸">원룸</option>
                      <option value="투룸">투룸</option>
                      <option value="쓰리룸">쓰리룸</option>
                      <option value="오피스텔">오피스텔</option>
                      <option value="아파트">아파트</option>
                      <option value="상가">상가</option>
                      <option value="사무실">사무실</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>거래 유형 *</label>
                    <select
                      value={newListing.deal}
                      onChange={(e) => setNewListing({ ...newListing, deal: e.target.value as any })}
                      className={inputClass}
                    >
                      <option value="전세">전세</option>
                      <option value="월세">월세</option>
                      <option value="매매">매매</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>상태</label>
                    <select
                      value={newListing.status}
                      onChange={(e) => setNewListing({ ...newListing, status: e.target.value as any })}
                      className={inputClass}
                    >
                      <option value="공개">공개</option>
                      <option value="계약중">계약중</option>
                      <option value="계약완료">계약완료</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 가격 정보 */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">가격 정보 (만원)</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className={labelClass}>보증금 *</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={newListing.deposit || ''}
                      onChange={(e) => setNewListing({ ...newListing, deposit: parseInt(e.target.value) || 0 })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>월세</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={newListing.monthly || ''}
                      onChange={(e) => setNewListing({ ...newListing, monthly: parseInt(e.target.value) || 0 })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>매매가</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="매매시 입력"
                      value={newListing.price || ''}
                      onChange={(e) => setNewListing({ ...newListing, price: e.target.value ? parseInt(e.target.value) : undefined })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>관리비</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={newListing.maintenance_fee || ''}
                      onChange={(e) => setNewListing({ ...newListing, maintenance_fee: parseInt(e.target.value) || 0 })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* 위치 정보 */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">위치 정보</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className={labelClass}>주소 *</label>
                    <input
                      type="text"
                      placeholder="예: 서울 관악구 신림로 267"
                      value={newListing.address}
                      onChange={(e) => setNewListing({ ...newListing, address: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>동 *</label>
                    <input
                      type="text"
                      placeholder="예: 신림동"
                      value={newListing.dong}
                      onChange={(e) => setNewListing({ ...newListing, dong: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className={labelClass}>상세 주소</label>
                    <input
                      type="text"
                      placeholder="예: 301호"
                      value={newListing.address_detail}
                      onChange={(e) => setNewListing({ ...newListing, address_detail: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* 면적/층수 */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">면적 / 층수 / 구조</p>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div>
                    <label className={labelClass}>전용면적(m2) *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="19.83"
                      value={newListing.area_m2 || ''}
                      onChange={(e) => setNewListing({ ...newListing, area_m2: parseFloat(e.target.value) || 0 })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>공급면적(m2)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="26.45"
                      value={newListing.area_supply_m2 || ''}
                      onChange={(e) => setNewListing({ ...newListing, area_supply_m2: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>해당 층 *</label>
                    <input
                      type="text"
                      placeholder="3"
                      value={newListing.floor_current}
                      onChange={(e) => setNewListing({ ...newListing, floor_current: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>총 층</label>
                    <input
                      type="text"
                      placeholder="5"
                      value={newListing.floor_total}
                      onChange={(e) => setNewListing({ ...newListing, floor_total: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>방 수</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="1"
                      value={newListing.rooms || ''}
                      onChange={(e) => setNewListing({ ...newListing, rooms: parseInt(e.target.value) || 0 })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>욕실 수</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="1"
                      value={newListing.bathrooms || ''}
                      onChange={(e) => setNewListing({ ...newListing, bathrooms: parseInt(e.target.value) || 0 })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* 추가 정보 */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">추가 정보</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className={labelClass}>방향</label>
                    <select
                      value={newListing.direction}
                      onChange={(e) => setNewListing({ ...newListing, direction: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">선택</option>
                      <option value="동향">동향</option>
                      <option value="서향">서향</option>
                      <option value="남향">남향</option>
                      <option value="북향">북향</option>
                      <option value="남동향">남동향</option>
                      <option value="남서향">남서향</option>
                      <option value="북동향">북동향</option>
                      <option value="북서향">북서향</option>
                       </select>
                  </div>
                  <div>
                    <label className={labelClass}>난방 방식</label>
                    <select
                      value={newListing.heating_type}
                      onChange={(e) => setNewListing({ ...newListing, heating_type: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">선택</option>
                      <option value="개별난방">개별난방</option>
                      <option value="중앙난방">중앙난방</option>
                      <option value="지역난방">지역난방</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>입주가능일</label>
                    <input
                      type="text"
                      placeholder="즉시입주 / 2026-04-01"
                      value={newListing.available_date}
                      onChange={(e) => setNewListing({ ...newListing, available_date: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>준공연도</label>
                    <input
                      type="text"
                      placeholder="2020"
                      value={newListing.built_year}
                      onChange={(e) => setNewListing({ ...newListing, built_year: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* 편의시설 옵션 */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">편의시설 / 옵션</p>
                <div className="flex flex-wrap gap-4">
                  {[
                    { key: 'parking', label: '주차' },
                    { key: 'elevator', label: '엘리베이터' },
                    { key: 'pet', label: '반려동물' },
                    { key: 'balcony', label: '베란다/발코니' },
                    { key: 'full_option', label: '풀옵션' },
                    { key: 'loan_available', label: '대출가능' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={(newListing as any)[key]}
                        onChange={(e) => setNewListing({ ...newListing, [key]: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-wishes-secondary focus:ring-wishes-secondary"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* 설명 */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">매물 설명</p>
                <textarea
                  placeholder="매물에 대한 상세 설명을 입력하세요"
                  value={newListing.description}
                  onChange={(e) => setNewListing({ ...newListing, description: e.target.value })}
                  className={inputClass}
                  rows={4}
                />
              </div>

              {/* 이미지 업로드 - 드래그앤드롭 */}
              <div className="border-b pb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">매물 이미지</p>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${
                    isDragOver
                      ? 'border-wishes-accent bg-yellow-50 scale-[1.02] shadow-lg'
                      : 'border-gray-300 hover:border-wishes-secondary hover:bg-gray-50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-3">
                    {isDragOver ? (
                      <>
                        <svg className="w-12 h-12 text-wishes-accent animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                        <p className="text-lg font-bold text-wishes-primary">여기에 놓으세요!</p>
                      </>
                    ) : (
                      <>
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <div>
                          <p className="text-sm font-semibold text-gray-700">사진움 드래그하여 놓거나 클릭하세요</p>
                          <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP / 최대 5MB / 여러 장 동시 업로드 가능</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 업로드 진행바 */}
                {uploadingImages && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-4 h-4 text-wishes-secondary animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <p className="text-sm text-gray-600">업로드 중... {uploadProgress}%</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-wishes-secondary to-wishes-accent h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* V3-14: 업로드된 이미지 미리보기 (드래그 정렬) */}
                {uploadedImages.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-gray-500 mb-2">업로드된 이미지 ({uploadedImages.length}장) — 드래그하여 순서 변경</p>
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                      {uploadedImages.map((img, i) => (
                        <div
                          key={img.path}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', String(i));
                            (e.currentTarget as HTMLElement).style.opacity = '0.4';
                          }}
                          onDragEnd={(e) => {
                            (e.currentTarget as HTMLElement).style.opacity = '1';
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)';
                          }}
                          onDragLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.transform = '';
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).style.transform = '';
                            const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                            const toIdx = i;
                            if (fromIdx === toIdx) return;
                            const newImages = [...uploadedImages];
                            const [moved] = newImages.splice(fromIdx, 1);
                            newImages.splice(toIdx, 0, moved);
                            setUploadedImages(newImages);
                          }}
                          className="relative group aspect-square cursor-grab active:cursor-grabbing"
                        >
                          <img
                            src={img.url}
                            alt={`매물 사진 ${i + 1}`}
                            className="w-full h-full object-cover rounded-lg border border-gray-200 shadow-sm group-hover:shadow-md transition pointer-events-none"
                          />
                          <span className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">
                            {i + 1}
                          </span>
                          {i === 0 && (
                            <span className="absolute top-1 left-1 bg-wishes-accent text-wishes-primary text-[10px] font-bold px-1.5 py-0.5 rounded">
                              대표
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setUploadedImages(uploadedImages.filter((_, idx) => idx !== i)); }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* V4-18: SEO 미리보기 */}
              {newListing.title && (
                <div className="border-b pb-4">
                  <p className="text-sm font-bold text-gray-700 mb-3">🔍 검색엔진 미리보기</p>
                  <div className="bg-white border border-gray-200 rounded-lg p-4 max-w-xl">
                    <p className="text-[#1a0dab] text-base font-medium hover:underline cursor-pointer truncate">
                      {newListing.title} | WISHES
                    </p>
                    <p className="text-[#006621] text-xs mt-0.5">
                      wishes.co.kr › listings › ...
                    </p>
                    <p className="text-[#545454] text-xs mt-1 line-clamp-2">
                      {newListing.description || `${newListing.dong} ${newListing.type} ${newListing.deal} - 서울·경기 종합부동산 WISHES`}
                    </p>
                  </div>
                </div>
              )}

              {/* V4-17: 상업용 매물 체크리스트 */}
              {((newListing.type as string) === '상가' || (newListing.type as string) === '사무실') && (
                <div className="border-b pb-4">
                  <p className="text-sm font-bold text-gray-700 mb-3">🏢 상업용 매물 체크리스트</p>
                  <div className="bg-yellow-50 rounded-lg p-4 text-sm text-yellow-800 space-y-2">
                    <p className="font-semibold mb-2">아래 항목을 확인하세요:</p>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-wishes-secondary focus:ring-wishes-secondary" />
                      권리금 정보 확인
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-wishes-secondary focus:ring-wishes-secondary" />
                      업종 제한 확인 (음식점, 주류 등)
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-wishes-secondary focus:ring-wishes-secondary" />
                      Ꞅ판 설치 가능 여부
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-wishes-secondary focus:ring-wishes-secondary" />
                      주차 공간 확인
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-wishes-secondary focus:ring-wishes-secondary" />
                      전기 용량 확인 (3상 전기 등)
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-wishes-secondary focus:ring-wishes-secondary" />
                      배수/하수 시설 확인
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-wishes-secondary focus:ring-wishes-secondary" />
                      유동인구 조사 완료
                    </label>
                  </div>
                </div>
              )}

              {/* 등록 버튼 */}
              <button
                type="submit"
                disabled={submitLoading}
                className="w-full bg-wishes-secondary text-white py-3 rounded-lg hover:bg-wishes-primary transition font-bold text-lg disabled:opacity-50"
              >
                {submitLoading ? '등록 중...' : '매물 등록하기'}
              </button>
            </form>
          </div>
        )}

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
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">W {listing.id}</span>
                      <h3 className="text-base font-bold text-wishes-primary">{listing.title}</h3>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {listing.address} | {listing.type} | {listing.deal}
                    </p>
                  </div>
                  <div className="flex gap-2 items-center ml-4">
                    <select
                      value={listing.status}
                      onChange={(e) => handleStatusChange(listing.id, e.target.value)}
                      className={`px-2 py-1 border rounded-lg text-xs font-medium ${
                        listing.status === '공개'
                          ? 'border-green-300 text-green-700 bg-green-50'
                          : listing.status === '계약중'
                          ? 'border-orange-300 text-orange-700 bg-orange-50'
                          : 'border-blue-300 text-blue-700 bg-blue-50'
                      }`}
                    >
                      <option value="공개">공개</option>
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
                      {formatFloorWithTotal(listing.floor_current, listing.floor_total)}
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
                      {new Date(listing.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
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
                  {new Date(contact.createdAt || contact.created_at || '').toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
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