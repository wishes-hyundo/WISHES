/**
 * Phase 2 (2026-04-28): /search-preview — Owner-only 검증 페이지
 *
 * 목적: 옛날 /search vanilla content.js 와 새 React 컴포넌트 픽셀 비교 검증.
 *      사장님 검증 OK 후 옛날 /search 와 swap.
 *
 * 접근 권한: owner / superadmin / admin / master
 *           pending / broker / partner 차단
 *
 * 사용처: 사장님 (wishes@wishes.co.kr) 또는 승인된 admin 만
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SearchHeader } from '@/components/wishes/Header';
import { ListingCard, type ListingCardProps } from '@/components/wishes/ListingCard';

const ALLOWED_ROLES = new Set(['owner', 'superadmin', 'admin', 'master']);

type Listing = {
  id: number;
  type?: string;
  deal?: string;
  address?: string;
  dong?: string;
  gu?: string;
  title?: string;
  area_m2?: number;
  floor_current?: number | null;
  rooms?: number;
  bathrooms?: number;
  deposit?: number | null;
  monthly?: number | null;
  price?: number | null;
  status?: string;
  registered_date?: string;
  created_at?: string;
  is_problematic?: boolean;
  ai_generated_fields?: string[];
  images?: Array<{ url: string }>;
};

function formatPrice(deal?: string, deposit?: number | null, monthly?: number | null, price?: number | null): string {
  const fmt = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}억`;
    return `${n.toLocaleString()}만`;
  };
  if (deal === '월세' && deposit != null && monthly != null) {
    return `${fmt(deposit)} / ${monthly.toLocaleString()}만`;
  }
  if (price != null) return fmt(price);
  if (deposit != null) return fmt(deposit);
  return '협의';
}

function buildSubtitle(l: Listing): string {
  const parts: string[] = [];
  if (l.area_m2) {
    const pyeong = Math.round((l.area_m2 / 3.305) * 10) / 10;
    parts.push(`${l.area_m2}㎡ (${pyeong}평)`);
  }
  if (l.floor_current != null) parts.push(`${l.floor_current}층`);
  if (l.rooms != null) parts.push(`방 ${l.rooms}`);
  if (l.bathrooms != null) parts.push(`욕실 ${l.bathrooms}`);
  return parts.join(' · ');
}

export default function SearchPreviewPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<'loading' | 'denied' | 'ok'>('loading');
  const [userInfo, setUserInfo] = useState<{ role?: string; email?: string }>({});
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'mine' | 'all'>('all');
  const [sortValue, setSortValue] = useState('created_desc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [favIds, setFavIds] = useState<Set<number>>(new Set());

  // ── 권한 체크 ──
  useEffect(() => {
    let token = '';
    try {
      token = sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
    } catch {}
    if (!token) {
      router.replace('/login?next=/search-preview');
      return;
    }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success || !ALLOWED_ROLES.has(d.user?.role)) {
          setAuthState('denied');
          setUserInfo({ role: d?.user?.role, email: d?.user?.email });
        } else {
          setAuthState('ok');
          setUserInfo({ role: d.user.role, email: d.user.email });
        }
      })
      .catch(() => setAuthState('denied'));
  }, [router]);

  // ── 매물 로드 ──
  const loadListings = useCallback(async () => {
    if (authState !== 'ok') return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30', sort: sortValue });
      if (query) params.set('q', query);
      const res = await fetch(`/api/listings?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data?.listings)) setListings(data.listings);
      else if (Array.isArray(data?.data)) setListings(data.data);
      else if (Array.isArray(data)) setListings(data);
    } catch (e) {
      console.error('[search-preview] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [authState, query, sortValue]);

  useEffect(() => {
    if (authState === 'ok') loadListings();
  }, [authState, loadListings]);

  // ── 권한 거부 화면 ──
  if (authState === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] p-5">
        <div className="bg-white rounded-xl p-10 max-w-md text-center shadow">
          <h1 className="text-xl font-bold mb-3" style={{ color: '#2D5A27' }}>
            검증 페이지 접근 권한 없음
          </h1>
          <p className="text-sm text-[#666] mb-4">
            /search-preview 는 사장님(Owner) 또는 Admin 만 접근 가능합니다.
            <br />
            (현재 권한: <code className="bg-[#f0f0f0] px-1 rounded">{userInfo.role || 'unknown'}</code>)
          </p>
          <button
            onClick={() => router.replace('/search')}
            className="px-5 py-2 rounded font-semibold text-white"
            style={{ background: '#2D5A27' }}
          >
            /search 본진으로
          </button>
        </div>
      </div>
    );
  }

  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#666]">
        권한 확인 중...
      </div>
    );
  }

  // ── 정상 화면 ──
  return (
    <div className="min-h-screen bg-[#F0F4F0]">
      <SearchHeader
        query={query}
        onQueryChange={setQuery}
        scope={scope}
        onScopeChange={setScope}
        sortValue={sortValue}
        onSortChange={setSortValue}
        alertCount={0}
        onAlertClick={() => alert('알림 로그는 Phase 2-3 에서 구현')}
        onRefresh={loadListings}
        onNewListing={() => alert('매물 등록은 Phase 2-5 에서 구현 (옛날 6 Step Wizard 재현)')}
        onLogout={() => {
          try {
            sessionStorage.clear();
            localStorage.removeItem('ws_token');
          } catch {}
          router.replace('/login');
        }}
        versionLabel="v2-pixel"
      />

      <div className="px-4 py-2 border-b border-[#ddd] bg-[#f8f8f8] flex items-center justify-between text-[12px]">
        <span>
          전체 <strong style={{ color: '#2D5A27' }}>{listings.length}</strong>건
          {selectedIds.size > 0 && (
            <span className="ml-2">
              (선택 <strong>{selectedIds.size}</strong>건)
              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-2 text-[#666] underline"
              >
                선택 해제
              </button>
            </span>
          )}
        </span>
        <span className="text-[#666]">
          🔍 <code className="bg-white px-1 rounded">{userInfo.role}</code> · {userInfo.email} · Phase 2 검증
        </span>
      </div>

      {loading && (
        <div className="text-center py-10 text-[#666]">매물 로드 중...</div>
      )}

      {!loading && listings.length === 0 && (
        <div className="text-center py-20 text-[#999]">
          <div className="text-3xl mb-2">🏠</div>
          매물이 없습니다.
        </div>
      )}

      <div className="divide-y divide-[#eee]">
        {listings.map((l) => {
          const addr =
            [l.gu, l.dong, l.address].filter(Boolean).join(' ') || l.address || `매물 #${l.id}`;
          return (
            <ListingCard
              key={l.id}
              id={l.id}
              imageUrl={l.images?.[0]?.url}
              imageCount={l.images?.length}
              registeredAt={l.registered_date || l.created_at}
              address={addr}
              title={l.title}
              subtitle={buildSubtitle(l)}
              tags={[]}
              deal={l.deal || '-'}
              priceLabel={formatPrice(l.deal, l.deposit, l.monthly, l.price)}
              status={l.status}
              favorite={favIds.has(l.id)}
              selected={selectedIds.has(l.id)}
              aiGenerated={(l.ai_generated_fields?.length ?? 0) > 0}
              problematic={!!l.is_problematic}
              onClick={() => alert(`매물 #${l.id} 상세 — Phase 2-3 에서 구현 (DetailModal)`)}
              onSelectChange={(sel) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  sel ? next.add(l.id) : next.delete(l.id);
                  return next;
                });
              }}
              onFavoriteToggle={() => {
                setFavIds((prev) => {
                  const next = new Set(prev);
                  next.has(l.id) ? next.delete(l.id) : next.add(l.id);
                  return next;
                });
              }}
              onEdit={() => alert(`편집은 Phase 2-4 에서 구현 (EditSheet)`)}
              onDetail={() => alert(`상세는 Phase 2-3 에서 구현`)}
            />
          );
        })}
      </div>

      <footer className="text-center py-6 text-[11px] text-[#999]">
        Phase 2 검증 페이지 · 옛날 /search 와 비교용 · 검증 OK 후 swap 예정
      </footer>
    </div>
  );
}
