'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase';

interface Listing {
  id: number;
  title: string;
  type: string;
  deal: string;
  status: string;
  deposit: number;
  monthly: number;
  price: number;
  maintenance_fee?: number;
  area_m2: number;
  area_supply_m2?: number;
  floor_current: string;
  floor_total?: string;
  rooms: number;
  bathrooms: number;
  direction?: string;
  address: string;
  address_detail?: string;
  dong?: string;
  lat?: number;
  lng?: number;
  parking?: boolean;
  elevator?: boolean;
  pet?: boolean;
  balcony?: boolean;
  full_option?: boolean;
  loan_available?: boolean;
  built_year?: string;
  available_date?: string;
  station_name?: string;
  station_distance?: number;
  listing_images?: { id: number; url: string; is_thumbnail?: boolean; sort_order?: number }[];
}

interface User {
  id: string;
  email: string;
  name: string;
  company: string;
  role: string;
  status: string;
  canAccessBroker: boolean;
}

function formatPrice(l: Listing): string {
  if (l.deal === '매매') return l.price >= 10000 ? (l.price / 10000).toFixed(1) + '억' : l.price + '만';
  if (l.deal === '전세') return l.deposit >= 10000 ? (l.deposit / 10000).toFixed(1) + '억' : l.deposit + '만';
  return `${l.deposit}/${l.monthly}`;
}

function getMaskedAddress(address: string, dong?: string): string {
  if (!address) return '';
  const parts = address.split(' ');
  let masked = '';
  for (const part of parts) {
    masked += (masked ? ' ' : '') + part;
    if (/[동읍면리가로]$/.test(part) || part === dong) break;
  }
  return masked;
}

export default function SearchPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<'loading' | 'ok' | 'pending' | 'denied'>('loading');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);

  // 필터 상태
  const [keyword, setKeyword] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterDeal, setFilterDeal] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');

  // 1. 인증 체크
  useEffect(() => {
    const check = async () => {
      const sb = createAuthClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        router.replace('/login?redirect=/search');
        return;
      }
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (!data.success) {
        router.replace('/login?redirect=/search');
        return;
      }
      setUser(data.user);
      if (data.user.status === 'pending') {
        setAuthStatus('pending');
      } else if (data.user.canAccessBroker) {
        setAuthStatus('ok');
      } else {
        setAuthStatus('denied');
      }
    };
    check();
  }, [router]);

  // 2. 매물 로드 (캐시 우선, 백그라운드 갱신)
  useEffect(() => {
    if (authStatus !== 'ok') return;

    const loadCache = async () => {
      try {
        const cached = localStorage.getItem('wishes_listings_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.data && Array.isArray(parsed.data)) {
            setListings(parsed.data);
          }
        }
      } catch {}
    };

    const loadFresh = async () => {
      setLoadingListings(true);
      try {
        const res = await fetch('/api/admin/listings?fields=minimal', {
          headers: { Authorization: 'Bearer wishes2026' }
        });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setListings(json.data);
          try {
            localStorage.setItem('wishes_listings_cache', JSON.stringify({ data: json.data, ts: Date.now() }));
          } catch {}
        }
      } catch (e) {
        console.error('매물 로드 실패:', e);
      }
      setLoadingListings(false);
    };

    loadCache();
    loadFresh();
  }, [authStatus]);

  // 3. 필터링
  const filtered = useMemo(() => {
    return listings.filter(l => {
      if (filterStatus !== 'all' && l.status !== filterStatus) return false;
      if (filterType !== 'all' && l.type !== filterType) return false;
      if (filterDeal !== 'all' && l.deal !== filterDeal) return false;
      if (keyword) {
        const kw = keyword.toLowerCase();
        const hay = `${l.title || ''} ${l.address || ''} ${l.dong || ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [listings, keyword, filterType, filterDeal, filterStatus]);

  const handleLogout = async () => {
    const sb = createAuthClient();
    await sb.auth.signOut();
    router.replace('/login');
  };

  // ========== UI 렌더링 ==========
  if (authStatus === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <div style={{ color: '#666' }}>로딩 중...</div>
      </div>
    );
  }

  if (authStatus === 'pending') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, maxWidth: 420, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#2D5A27' }}>승인 대기 중</h2>
          <p style={{ color: '#666', lineHeight: 1.6, marginBottom: 24 }}>
            관리자의 승인을 기다리고 있습니다.<br />
            승인 후 이메일로 안내드립니다.
          </p>
          <button onClick={handleLogout} style={{ padding: '10px 24px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>로그아웃</button>
        </div>
      </div>
    );
  }

  if (authStatus === 'denied') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, maxWidth: 420, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#dc2626' }}>접근 권한이 없습니다</h2>
          <p style={{ color: '#666', marginBottom: 24 }}>관리자에게 문의해주세요.</p>
          <button onClick={handleLogout} style={{ padding: '10px 24px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>로그아웃</button>
        </div>
      </div>
    );
  }

  // ===== 승인된 사용자 UI =====
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* 헤더 */}
      <header style={{ background: '#2D5A27', color: '#fff', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>WISHES 중개사 매물검색</h1>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{user?.name} ({user?.company || '중개사'})</div>
        </div>
        <button onClick={handleLogout} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>로그아웃</button>
      </header>

      {/* 필터 바 */}
      <div style={{ background: '#fff', padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 주소·제목·동으로 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
        />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, background: '#fff' }}>
          <option value="all">전체 유형</option>
          <option value="아파트">아파트</option>
          <option value="오피스텔">오피스텔</option>
          <option value="빌라">빌라</option>
          <option value="주택">주택</option>
          <option value="상가">상가</option>
          <option value="사무실">사무실</option>
          <option value="공장">공장</option>
          <option value="토지">토지</option>
        </select>
        <select value={filterDeal} onChange={(e) => setFilterDeal(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, background: '#fff' }}>
          <option value="all">전체 거래</option>
          <option value="매매">매매</option>
          <option value="전세">전세</option>
          <option value="월세">월세</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, background: '#fff' }}>
          <option value="active">진행중</option>
          <option value="contracting">계약중</option>
          <option value="completed">거래완료</option>
          <option value="all">전체</option>
        </select>
        <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>
          {loadingListings ? '🔄 로딩 중...' : `${filtered.length.toLocaleString()}건`}
        </div>
      </div>

      {/* 매물 리스트 */}
      <div style={{ padding: '16px 24px' }}>
        {filtered.length === 0 && !loadingListings && (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div>조건에 맞는 매물이 없습니다.</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.slice(0, 200).map(l => {
            const thumb = l.listing_images?.find(i => i.is_thumbnail) || l.listing_images?.[0];
            return (
              <div key={l.id} style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb' }}>
                <div style={{ height: 160, background: thumb?.url ? `url(${thumb.url}) center/cover` : '#f3f4f6', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 8, left: 8, background: l.deal === '매매' ? '#dc2626' : l.deal === '전세' ? '#2563eb' : '#16a34a', color: '#fff', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{l.deal}</div>
                  <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 10px', borderRadius: 4, fontSize: 11 }}>{l.type}</div>
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#111', marginBottom: 6 }}>{formatPrice(l)}</div>
                  <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title || '제목 없음'}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{getMaskedAddress(l.address, l.dong)}</div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#6b7280', flexWrap: 'wrap' }}>
                    <span>{l.area_m2}㎡</span>
                    {l.floor_current && <span>• {l.floor_current}층</span>}
                    {l.rooms > 0 && <span>• 방{l.rooms}</span>}
                    {l.bathrooms > 0 && <span>• 욕실{l.bathrooms}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length > 200 && (
          <div style={{ textAlign: 'center', padding: 20, color: '#6b7280', fontSize: 13 }}>
            상위 200건만 표시 중 (검색 조건을 좁혀주세요 - 전체 {filtered.length.toLocaleString()}건)
          </div>
        )}
      </div>
    </div>
  );
}
