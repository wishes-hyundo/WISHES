'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Heart, Clock, User, LogOut, Building2, MapPin, Maximize, ArrowLeft, Loader2, Bell, Settings, Check, Save, Bookmark, Trash2, Search as SearchIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useFavorites } from '@/contexts/FavoritesContext';
import { useSavedSearch } from '@/contexts/SavedSearchContext';
import { cn } from '@/lib/utils';
import { displayTitle } from '@/lib/formatListingTitle';
import Image from 'next/image';

type TabType = 'favorites' | 'recent' | 'profile' | 'alerts' | 'saved';

interface ListingData { id: number; title: string; deal: string; type: string; deposit: number; monthly: number; price: number; dong: string; address: string; area_m2: number; floor_current: string; listing_images: { url: string }[]; }

const formatNumber = (num: number): string => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const formatPrice = (listing: ListingData) => {
  const deposit = listing.deposit || 0;
  const monthly = listing.monthly || 0;
  const price = listing.price || 0;
  if (listing.deal === '매매') {
    if (price >= 10000) { const uk = Math.floor(price / 10000); const man = price % 10000; return man > 0 ? uk + '억 ' + formatNumber(man) : uk + '억'; }
    return formatNumber(price);
  } else if (listing.deal === '전세') {
    if (deposit >= 10000) { const uk = Math.floor(deposit / 10000); const man = deposit % 10000; return '전세 ' + (man > 0 ? uk + '억 ' + formatNumber(man) : uk + '억'); }
    return '전세 ' + formatNumber(deposit);
  } else { return formatNumber(deposit) + '/' + monthly; }
};

const getDealColor = (deal: string) => {
  switch (deal) { case '전세': return 'bg-wishes-secondary text-white'; case '월세': return 'bg-emerald-500 text-white'; case '매매': return 'bg-wishes-accent text-white'; default: return 'bg-gray-400 text-white'; }
};

const AREA_OPTIONS = ['강남/서초', '송파/강동', '마포/용산', '성동/광진', '종로/중구', '강서/양천', '영등포/동작', '관악/금천', '노원/도봉', '구로/은평', '경기 남부', '경기 북부', '경기 서부', '경기 동부'];
const TYPE_OPTIONS = ['원룸', '투룸', '쓰리룸+', '오피스텔', '아파트', '빌라/연립', '상가/사무실', '토지/건물'];
const DEAL_OPTIONS = ['전세', '월세', '매매'];

function MypageListingCard({ listing, onRemoveFavorite }: { listing: ListingData; onRemoveFavorite?: (id: number) => void }) {
  const images = listing.listing_images || [];
  const thumbUrl = images.length > 0 ? images[0].url : null;
  const area = listing.area_m2 || 0;
  const pyeong = area > 0 ? (area / 3.3).toFixed(1) : null;
  return (
    <div className="group relative bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300">
      <Link href={'/listings/' + listing.id} className="block">
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-200 to-gray-300 aspect-[16/10]">
          {thumbUrl ? (<Image src={thumbUrl} alt={displayTitle(listing as any)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" fill sizes="(max-width: 768px) 50vw, 25vw" />) : (<div className="absolute inset-0 flex items-center justify-center"><Building2 className="w-12 h-12 text-gray-400" /></div>)}
          <span className={cn('absolute top-3 left-3 px-3 py-1 text-xs font-bold rounded-lg shadow-lg', getDealColor(listing.deal))}>{listing.deal}</span>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-xl font-bold text-wishes-primary">{formatPrice(listing)}</p>
          <p className="text-sm font-medium text-wishes-text line-clamp-1">{displayTitle(listing as any)}</p>
          <div className="flex items-center gap-3 text-xs text-wishes-muted">
            {area > 0 && (<span className="flex items-center gap-1"><Maximize className="w-3.5 h-3.5" />{area}㎡{pyeong && ' (' + pyeong + '평)'}</span>)}
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{listing.dong}</span>
          </div>
        </div>
      </Link>
      {onRemoveFavorite && (<button onClick={(e) => { e.preventDefault(); onRemoveFavorite(listing.id); }} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md hover:bg-red-50 transition-colors" title="찜 해제"><Heart className="w-4 h-4 fill-red-500 text-red-500" /></button>)}
    </div>
  );
}

export default function MyPage() {
  const router = useRouter();
  const { user, session, loading: authLoading, signOut, setShowAuthModal } = useAuth();
  const { favorites, recentlyViewed, toggleFavorite, favoritesLoading } = useFavorites();
  const { searches: savedSearches, removeSearch, toggleNotify } = useSavedSearch();
  const [activeTab, setActiveTab] = useState<TabType>('favorites');
  const [favListings, setFavListings] = useState<ListingData[]>([]);
  const [recentListings, setRecentListings] = useState<ListingData[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);

  // Profile edit states
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAreas, setProfileAreas] = useState<string[]>([]);
  const [profileTypes, setProfileTypes] = useState<string[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Alert settings states
  const [alertAreas, setAlertAreas] = useState<string[]>([]);
  const [alertTypes, setAlertTypes] = useState<string[]>([]);
  const [alertDeals, setAlertDeals] = useState<string[]>([]);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertSaved, setAlertSaved] = useState(false);

  useEffect(() => { if (!authLoading && !user) { setShowAuthModal(true); router.push('/'); } }, [user, authLoading, router, setShowAuthModal]);

  useEffect(() => {
    if (favorites.length === 0) { setFavListings([]); return; }
    setLoadingListings(true);
    fetch('/api/listings?ids=' + favorites.join(','))
      .then(r => r.json())
      .then(data => { setFavListings(data.listings || data || []); setLoadingListings(false); })
      .catch(() => setLoadingListings(false));
  }, [favorites]);

  useEffect(() => {
    if (recentlyViewed.length === 0) { setRecentListings([]); return; }
    fetch('/api/listings?ids=' + recentlyViewed.join(','))
      .then(r => r.json())
      .then(data => {
        const listings = data.listings || data || [];
        const sorted = recentlyViewed.map(id => listings.find((l: ListingData) => l.id === id)).filter(Boolean) as ListingData[];
        setRecentListings(sorted);
      }).catch(() => {});
  }, [recentlyViewed]);

  useEffect(() => {
    if (session?.access_token) {
      fetch('/api/profile', { headers: { 'Authorization': 'Bearer ' + session.access_token } })
        .then(r => r.json())
        .then(data => {
          setProfileName(data.name || '');
          setProfilePhone(data.phone || '');
          setProfileAreas(data.preferred_areas || []);
          setProfileTypes(data.preferred_types || []);
        }).catch(() => {});
      fetch('/api/alerts', { headers: { 'Authorization': 'Bearer ' + session.access_token } })
        .then(r => r.json())
        .then(data => {
          setAlertAreas(data.areas || []);
          setAlertTypes(data.types || []);
          setAlertDeals(data.deals || []);
          setAlertEnabled(data.enabled || false);
        }).catch(() => {});
    }
  }, [session]);

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session?.access_token },
        body: JSON.stringify({ name: profileName, phone: profilePhone, preferred_areas: profileAreas, preferred_types: profileTypes }),
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch {}
    setProfileLoading(false);
  };

  const handleSaveAlerts = async () => {
    setAlertLoading(true);
    try {
      await fetch('/api/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session?.access_token },
        body: JSON.stringify({ areas: alertAreas, types: alertTypes, deals: alertDeals, enabled: alertEnabled }),
      });
      setAlertSaved(true);
      setTimeout(() => setAlertSaved(false), 2000);
    } catch {}
    setAlertLoading(false);
  };

  const toggleChip = (arr: string[], setArr: (v: string[]) => void, val: string, max: number) => {
    if (arr.includes(val)) setArr(arr.filter(a => a !== val));
    else if (arr.length < max) setArr([...arr, val]);
  };

  if (authLoading) return (<div className="min-h-screen flex items-center justify-center pt-20"><Loader2 className="w-8 h-8 animate-spin text-wishes-secondary" /></div>);
  if (!user) return null;

  // 실제 로드된 매물 기준으로 카운트 (고아/삭제된 ID 제외)
  const visibleFavCount = favListings.length;
  const visibleRecentCount = recentListings.length;

  const tabs = [
    { id: 'favorites' as TabType, label: '찜한 매물', icon: Heart, count: visibleFavCount },
    { id: 'recent' as TabType, label: '최근 본', icon: Clock, count: visibleRecentCount },
    { id: 'saved' as TabType, label: '저장 검색', icon: Bookmark, count: savedSearches.length },
    { id: 'profile' as TabType, label: '내 정보', icon: Settings },
    { id: 'alerts' as TabType, label: '알림 설정', icon: Bell },
  ];

  // 저장 검색 → URL 쿼리스트링 변환
  const toQueryString = (query: Record<string, string>) => {
    const sp = new URLSearchParams();
    Object.keys(query).forEach((k) => { if (query[k]) sp.set(k, query[k]); });
    return sp.toString();
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <div className="max-w-6xl mx-auto px-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-wishes-muted hover:text-wishes-secondary mb-6 transition-colors"><ArrowLeft className="w-4 h-4" />홈으로</Link>

        {/* 프로필 헤더 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {user.user_metadata?.avatar_url ? (<div className="relative w-14 h-14"><Image src={user.user_metadata.avatar_url} alt="" className="rounded-full border-2 border-wishes-secondary/20 object-cover" fill sizes="56px" /></div>) : (<div className="w-14 h-14 rounded-full bg-wishes-secondary/10 flex items-center justify-center"><User className="w-7 h-7 text-wishes-secondary" /></div>)}
              <div>
                <h1 className="text-lg font-bold text-wishes-primary">{user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '회원'}님</h1>
                <p className="text-sm text-wishes-muted">{user.email}</p>
              </div>
            </div>
            <button onClick={signOut} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><LogOut className="w-4 h-4" />로그아웃</button>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100">
            <div className="text-center"><p className="text-2xl font-bold text-wishes-secondary">{visibleFavCount}</p><p className="text-xs text-wishes-muted mt-1">찜한 매물</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-wishes-accent">{visibleRecentCount}</p><p className="text-xs text-wishes-muted mt-1">최근 본 매물</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-wishes-primary">{savedSearches.length}</p><p className="text-xs text-wishes-muted mt-1">저장 검색</p></div>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 shrink-0', activeTab === tab.id ? 'bg-wishes-secondary text-white shadow-lg shadow-wishes-secondary/30' : 'bg-white text-wishes-muted hover:bg-gray-100 border border-gray-200')}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {'count' in tab && <span className={cn('ml-1 px-2 py-0.5 text-xs rounded-full', activeTab === tab.id ? 'bg-white/20' : 'bg-gray-100')}>{tab.count}</span>}
            </button>))}
        </div>

        {activeTab === 'favorites' && (
          <div>{favoritesLoading || loadingListings ? (<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-wishes-secondary" /></div>) : favListings.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-100"><Heart className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-lg font-semibold text-gray-400 mb-2">찜한 매물이 없습니다</p><p className="text-sm text-gray-400 mb-6">마음에 드는 매물의 하트를 눌러 저장해보세요</p><Link href="/map" className="inline-flex items-center gap-2 px-6 py-3 bg-wishes-secondary text-white rounded-xl text-sm font-semibold hover:bg-wishes-secondary/90 transition-colors">매물 둘러보기</Link></div>
          ) : (<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">{favListings.map(listing => (<MypageListingCard key={listing.id} listing={listing} onRemoveFavorite={toggleFavorite} />))}</div>)}</div>)}

        {activeTab === 'recent' && (
          <div>{recentListings.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-100"><Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-lg font-semibold text-gray-400 mb-2">최근 본 매물이 없습니다</p><p className="text-sm text-gray-400 mb-6">매물 상세페이지를 방문하면 여기에 기록됩니다</p><Link href="/map" className="inline-flex items-center gap-2 px-6 py-3 bg-wishes-secondary text-white rounded-xl text-sm font-semibold hover:bg-wishes-secondary/90 transition-colors">매물 둘러보기</Link></div>
          ) : (<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">{recentListings.map(listing => (<MypageListingCard key={listing.id} listing={listing} />))}</div>)}</div>)}

        {activeTab === 'saved' && (
          <div>
            {savedSearches.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                <Bookmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-400 mb-2">저장된 검색이 없습니다</p>
                <p className="text-sm text-gray-400 mb-6">매물 검색 페이지 상단에서 "이 조건 저장" 을 눌러 검색 조건을 보관하세요.</p>
                <Link href="/map" className="inline-flex items-center gap-2 px-6 py-3 bg-wishes-secondary text-white rounded-xl text-sm font-semibold hover:bg-wishes-secondary/90 transition-colors">
                  <SearchIcon className="w-4 h-4" /> 지도검색으로 이동
                </Link>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
                {savedSearches.map((s) => {
                  const qs = toQueryString(s.query);
                  const dateStr = new Date(s.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
                  return (
                    <div key={s.id} className="p-4 sm:p-5 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-wishes-primary/10 flex items-center justify-center shrink-0">
                        <Bookmark className="w-4 h-4 text-wishes-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link href={qs ? `/map?${qs}` : '/map'} className="block group">
                          <p className="text-sm font-semibold text-wishes-primary group-hover:text-wishes-secondary transition-colors line-clamp-1">
                            {s.label}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">저장일 {dateStr}</p>
                        </Link>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => toggleNotify(s.id)}
                          title={s.notifyOnNew ? '알림 ON' : '알림 OFF'}
                          className={cn('p-2 rounded-lg transition-colors', s.notifyOnNew ? 'bg-wishes-secondary/10 text-wishes-secondary' : 'bg-gray-50 text-gray-400 hover:bg-gray-100')}
                        >
                          <Bell className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => removeSearch(s.id)}
                          title="삭제"
                          className="p-2 rounded-lg bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-wishes-primary mb-6">내 정보 수정</h3>
            <div className="space-y-5 max-w-lg">
              <div><label className="block text-sm font-semibold text-gray-700 mb-2">이름</label><input type="text" value={profileName} onChange={e => setProfileName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-wishes-secondary focus:ring-2 focus:ring-wishes-secondary/20 outline-none transition-all text-sm" /></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-2">연락처</label><input type="tel" value={profilePhone} onChange={e => setProfilePhone(e.target.value)} placeholder="010-0000-0000" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-wishes-secondary focus:ring-2 focus:ring-wishes-secondary/20 outline-none transition-all text-sm" /></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-2"><MapPin className="w-4 h-4 inline mr-1" />관심 지역 (최대 5개)</label><div className="flex flex-wrap gap-2">{AREA_OPTIONS.map(area => (<button key={area} onClick={() => toggleChip(profileAreas, setProfileAreas, area, 5)} className={cn('px-3 py-2 rounded-lg text-xs font-medium border transition-all', profileAreas.includes(area) ? 'bg-wishes-secondary text-white border-wishes-secondary' : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-secondary/50')}>{area}</button>))}</div></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-2"><Building2 className="w-4 h-4 inline mr-1" />관심 유형 (최대 4개)</label><div className="flex flex-wrap gap-2">{TYPE_OPTIONS.map(type => (<button key={type} onClick={() => toggleChip(profileTypes, setProfileTypes, type, 4)} className={cn('px-3 py-2 rounded-lg text-xs font-medium border transition-all', profileTypes.includes(type) ? 'bg-wishes-accent text-white border-wishes-accent' : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-accent/50')}>{type}</button>))}</div></div>
              <button onClick={handleSaveProfile} disabled={profileLoading} className="flex items-center gap-2 px-6 py-3 bg-wishes-secondary text-white rounded-xl font-semibold text-sm hover:bg-wishes-secondary/90 transition-colors disabled:opacity-60">
                {profileSaved ? <><Check className="w-4 h-4" />저장 완료</> : profileLoading ? '저장 중...' : <><Save className="w-4 h-4" />저장하기</>}
              </button>
            </div>
          </div>)}

        {activeTab === 'alerts' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-wishes-primary">신규 매물 알림 설정</h3>
              {/* L-a11y4 (2026-04-22): div onClick → 실제 button + role=switch.
                  키보드(Space/Enter)·스크린리더에 접근 가능하도록 교체. */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{alertEnabled ? '알림 ON' : '알림 OFF'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={alertEnabled}
                  aria-label="신규 매물 알림"
                  onClick={() => setAlertEnabled(!alertEnabled)}
                  className={cn('relative w-11 h-6 rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-wishes-secondary/40 focus:ring-offset-2', alertEnabled ? 'bg-wishes-secondary' : 'bg-gray-300')}
                >
                  <span className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform', alertEnabled ? 'translate-x-5.5' : 'translate-x-0.5')} />
                </button>
              </div>
            </div>
            <div className="space-y-5 max-w-lg">
              <div><label className="block text-sm font-semibold text-gray-700 mb-2"><MapPin className="w-4 h-4 inline mr-1" />알림 받을 지역</label><div className="flex flex-wrap gap-2">{AREA_OPTIONS.map(area => (<button key={area} onClick={() => toggleChip(alertAreas, setAlertAreas, area, 5)} className={cn('px-3 py-2 rounded-lg text-xs font-medium border transition-all', alertAreas.includes(area) ? 'bg-wishes-secondary text-white border-wishes-secondary' : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-secondary/50')}>{area}</button>))}</div></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-2"><Building2 className="w-4 h-4 inline mr-1" />매물 유형</label><div className="flex flex-wrap gap-2">{TYPE_OPTIONS.map(type => (<button key={type} onClick={() => toggleChip(alertTypes, setAlertTypes, type, 4)} className={cn('px-3 py-2 rounded-lg text-xs font-medium border transition-all', alertTypes.includes(type) ? 'bg-wishes-accent text-white border-wishes-accent' : 'bg-white text-gray-600 border-gray-200 hover:border-wishes-accent/50')}>{type}</button>))}</div></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-2">거래 유형</label><div className="flex flex-wrap gap-2">{DEAL_OPTIONS.map(deal => (<button key={deal} onClick={() => toggleChip(alertDeals, setAlertDeals, deal, 3)} className={cn('px-3 py-2 rounded-lg text-xs font-medium border transition-all', alertDeals.includes(deal) ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300')}>{deal}</button>))}</div></div>
              <button onClick={handleSaveAlerts} disabled={alertLoading} className="flex items-center gap-2 px-6 py-3 bg-wishes-secondary text-white rounded-xl font-semibold text-sm hover:bg-wishes-secondary/90 transition-colors disabled:opacity-60">
                {alertSaved ? <><Check className="w-4 h-4" />저장 완료</> : alertLoading ? '저장 중...' : <><Bell className="w-4 h-4" />알림 설정 저장</>}
              </button>
              <p className="text-xs text-gray-400">설정한 조건에 맞는 신규 매물이 등록되면 알림을 보내드립니다.</p>
            </div>
          </div>)}

      </div>
    </div>
  );
}