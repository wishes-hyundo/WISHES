'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Heart, Clock, User, LogOut, Building2, MapPin, Maximize, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useFavorites } from '@/contexts/FavoritesContext';
import { cn } from '@/lib/utils';
import Image from 'next/image';

type TabType = 'favorites' | 'recent';

interface ListingData {
  id: number;
  title: string;
  deal: string;
  type: string;
  deposit: number;
  monthly: number;
  price: number;
  dong: string;
  address: string;
  area_m2: number;
  floor_current: string;
  listing_images: { url: string }[];
}

const formatNumber = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const formatPrice = (listing: ListingData) => {
  const deposit = listing.deposit || 0;
  const monthly = listing.monthly || 0;
  const price = listing.price || 0;

  if (listing.deal === '매매') {
    if (price >= 10000) {
      const uk = Math.floor(price / 10000);
      const man = price % 10000;
      return man > 0 ? `${uk}억 ${formatNumber(man)}` : `${uk}억`;
    }
    return `${formatNumber(price)}`;
  } else if (listing.deal === '전세') {
    if (deposit >= 10000) {
      const uk = Math.floor(deposit / 10000);
      const man = deposit % 10000;
      return `전세 ${man > 0 ? `${uk}억 ${formatNumber(man)}` : `${uk}억`}`;
    }
    return `전세 ${formatNumber(deposit)}`;
  } else {
    return `${formatNumber(deposit)}/${monthly}`;
  }
};

const getDealColor = (deal: string) => {
  switch (deal) {
    case '전세': return 'bg-wishes-secondary text-white';
    case '월세': return 'bg-emerald-500 text-white';
    case '매매': return 'bg-wishes-accent text-white';
    default: return 'bg-gray-400 text-white';
  }
};

function MypageListingCard({ listing, onRemoveFavorite }: { listing: ListingData; onRemoveFavorite?: (id: number) => void }) {
  const images = listing.listing_images || [];
  const thumbUrl = images.length > 0 ? images[0].url : null;
  const area = listing.area_m2 || 0;
  const pyeong = area > 0 ? (area / 3.3).toFixed(1) : null;

  return (
    <div className="group relative bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300">
      <Link href={`/listings/${listing.id}`} className="block">
        {/* 이미지 */}
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-200 to-gray-300 aspect-[16/10]">
          {thumbUrl ? (
            <Image
              src={thumbUrl}
              alt={listing.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Building2 className="w-12 h-12 text-gray-400" />
            </div>
          )}
          <span className={cn('absolute top-3 left-3 px-3 py-1 text-xs font-bold rounded-lg shadow-lg', getDealColor(listing.deal))}>
            {listing.deal}
          </span>
        </div>

        {/* 정보 */}
        <div className="p-4 space-y-2">
          <p className="text-xl font-bold text-wishes-primary">{formatPrice(listing)}</p>
          <p className="text-sm font-medium text-wishes-text line-clamp-1">{listing.title}</p>
          <div className="flex items-center gap-3 text-xs text-wishes-muted">
            {area > 0 && (
              <span className="flex items-center gap-1">
                <Maximize className="w-3.5 h-3.5" /> {area}㎡{pyeong && ` (${pyeong}평)`}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> {listing.dong}
            </span>
          </div>
        </div>
      </Link>

      {/* 찜 해제 버튼 */}
      {onRemoveFavorite && (
        <button
          onClick={(e) => { e.preventDefault(); onRemoveFavorite(listing.id); }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md hover:bg-red-50 transition-colors"
          title="찜 해제"
        >
          <Heart className="w-4 h-4 fill-red-500 text-red-500" />
        </button>
      )}
    </div>
  );
}

export default function MyPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut, setShowAuthModal } = useAuth();
  const { favorites, recentlyViewed, toggleFavorite, favoritesLoading } = useFavorites();
  const [activeTab, setActiveTab] = useState<TabType>('favorites');
  const [favListings, setFavListings] = useState<ListingData[]>([]);
  const [recentListings, setRecentListings] = useState<ListingData[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      setShowAuthModal(true);
      router.push('/');
    }
  }, [user, authLoading, router, setShowAuthModal]);

  // Fetch favorite listings data
  useEffect(() => {
    if (favorites.length === 0) {
      setFavListings([]);
      return;
    }
    setLoadingListings(true);
    fetch(`/api/listings?ids=${favorites.join(',')}`)
      .then(r => r.json())
      .then(data => {
        setFavListings(data.listings || data || []);
        setLoadingListings(false);
      })
      .catch(() => setLoadingListings(false));
  }, [favorites]);

  // Fetch recently viewed listings data
  useEffect(() => {
    if (recentlyViewed.length === 0) {
      setRecentListings([]);
      return;
    }
    fetch(`/api/listings?ids=${recentlyViewed.join(',')}`)
      .then(r => r.json())
      .then(data => {
        const listings = data.listings || data || [];
        // Sort by recentlyViewed order
        const sorted = recentlyViewed
          .map(id => listings.find((l: ListingData) => l.id === id))
          .filter(Boolean) as ListingData[];
        setRecentListings(sorted);
      })
      .catch(() => {});
  }, [recentlyViewed]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="w-8 h-8 animate-spin text-wishes-secondary" />
      </div>
    );
  }

  if (!user) return null;

  const tabs = [
    { id: 'favorites' as TabType, label: '찜한 매물', icon: Heart, count: favorites.length },
    { id: 'recent' as TabType, label: '최근 본 매물', icon: Clock, count: recentlyViewed.length },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <div className="max-w-6xl mx-auto px-4">
        {/* 뒤로가기 */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-wishes-muted hover:text-wishes-secondary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          홈으로
        </Link>

        {/* 프로필 헤더 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {user.user_metadata?.avatar_url ? (
                <Image
                  src={user.user_metadata.avatar_url}
                  alt=""
                  className="w-14 h-14 rounded-full border-2 border-wishes-secondary/20"
                
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-wishes-secondary/10 flex items-center justify-center">
                  <User className="w-7 h-7 text-wishes-secondary" />
                </div>
              )}
              <div>
                <h1 className="text-lg font-bold text-wishes-primary">
                  {user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '회원'}님
                </h1>
                <p className="text-sm text-wishes-muted">{user.email}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </div>

          {/* 통계 */}
          <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-gray-100">
            <div className="text-center">
              <p className="text-2xl font-bold text-wishes-secondary">{favorites.length}</p>
              <p className="text-xs text-wishes-muted mt-1">찜한 매물</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-wishes-accent">{recentlyViewed.length}</p>
              <p className="text-xs text-wishes-muted mt-1">최근 본 매물</p>
            </div>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-2 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200',
                activeTab === tab.id
                  ? 'bg-wishes-secondary text-white shadow-lg shadow-wishes-secondary/30'
                  : 'bg-white text-wishes-muted hover:bg-gray-100 border border-gray-200'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              <span className={cn(
                'ml-1 px-2 py-0.5 text-xs rounded-full',
                activeTab === tab.id ? 'bg-white/20' : 'bg-gray-100'
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* 컨텐츠 */}
        {activeTab === 'favorites' && (
          <div>
            {favoritesLoading || loadingListings ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-wishes-secondary" />
              </div>
            ) : favListings.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                <Heart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-400 mb-2">찜한 매물이 없습니다</p>
                <p className="text-sm text-gray-400 mb-6">마음에 드는 매물의 하트를 눌러 저장해보세요</p>
                <Link
                  href="/listings"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-wishes-secondary text-white rounded-xl text-sm font-semibold hover:bg-wishes-secondary/90 transition-colors"
                >
                  매물 둘러보기
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {favListings.map(listing => (
                  <MypageListingCard
                    key={listing.id}
                    listing={listing}
                    onRemoveFavorite={toggleFavorite}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'recent' && (
          <div>
            {recentListings.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-400 mb-2">최근 본 매물이 없습니다</p>
                <p className="text-sm text-gray-400 mb-6">매물 상세페이지를 방문하면 여기에 기록됩니다</p>
                <Link
                  href="/listings"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-wishes-secondary text-white rounded-xl text-sm font-semibold hover:bg-wishes-secondary/90 transition-colors"
                >
                  매물 둘러보기
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {recentListings.map(listing => (
                  <MypageListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
