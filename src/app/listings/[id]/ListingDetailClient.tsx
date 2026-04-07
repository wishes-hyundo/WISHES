'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import {
  Calendar, ArrowLeft, Check, X, Eye, Hash, ChevronRight, Home, Building2, Thermometer,
  Compass, DoorOpen, Banknote, Train, TrendingUp, MapPin, Navigation, Share2, Copy
} from 'lucide-react';
import CompassDirection from '@/components/CompassDirection';
import { getFormattedPrice, getDealColor, sqmToPyeong, getStatusColor, formatPrice } from '@/lib/utils';
import ImageGallery from '@/components/ImageGallery';
import { ListingCard } from '@/components/ListingCard';

declare global { interface Window { kakao: any; } }

interface NearbyStation {
  name: string;
  line: string;
  distance: number;
  walkMin: number;
}

interface RealPriceData {
  month: string;
  avgPrice: number;
  count: number;
}

interface Props { id: string; }

// ── 최근 본 매물 관리 ──
function addToRecentlyViewed(listing: any) {
  try {
    const key = 'recently_viewed_listings';
    const stored = localStorage.getItem(key);
    let arr: any[] = stored ? JSON.parse(stored) : [];
    arr = arr.filter((item: any) => item.id !== listing.id);
    arr.unshift({
      id: listing.id, title: listing.title, deal: listing.deal,
      price: listing.price, deposit: listing.deposit, monthly: listing.monthly,
      dong: listing.dong, type: listing.type, area_m2: listing.area_m2,
      image: listing.listing_images?.[0]?.url || null,
      viewedAt: new Date().toISOString(),
    });
    if (arr.length > 20) arr = arr.slice(0, 20);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {}
}

// ── 실거래가 차트 컴포넌트 ──
function RealPriceChart({ listingId, dong, type }: { listingId: number; dong: string; type: string }) {
  const [priceData, setPriceData] = useState<RealPriceData[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        setChartLoading(true);
        setChartError(null);
        const res = await fetch(`/api/listings/${listingId}/real-prices`);
        if (!res.ok) throw new Error('데이터를 불러올 수 없습니다');
        const json = await res.json();
        if (json.success && json.data?.length > 0) {
          setPriceData(json.data);
        } else {
          setChartError('실거래 데이터가 없습니다');
        }
      } catch (err) {
        setChartError(err instanceof Error ? err.message : '오류 발생');
      } finally {
        setChartLoading(false);
      }
    };
    fetchPrices();
  }, [listingId]);

  // Canvas 기반 차트 그리기
  useEffect(() => {
    if (!canvasRef.current || priceData.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const padL = 55, padR = 15, padT = 20, padB = 40;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    const prices = priceData.map(d => d.avgPrice);
    const counts = priceData.map(d => d.count);
    const maxPrice = Math.max(...prices) * 1.1 || 1;
    const maxCount = Math.max(...counts) * 1.3 || 1;
    const n = priceData.length;

    // 배경 그리드
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    }

    // 막대 차트 (거래량)
    const barWidth = Math.min(chartW / n * 0.5, 30);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    priceData.forEach((d, i) => {
      const x = padL + (chartW / (n - 1 || 1)) * i;
      const barH = (d.count / maxCount) * chartH;
      ctx.fillRect(x - barWidth / 2, padT + chartH - barH, barWidth, barH);
    });

    // 꺾은선 차트 (평균가)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    priceData.forEach((d, i) => {
      const x = padL + (chartW / (n - 1 || 1)) * i;
      const y = padT + chartH - (d.avgPrice / maxPrice) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 데이터 포인트
    priceData.forEach((d, i) => {
      const x = padL + (chartW / (n - 1 || 1)) * i;
      const y = padT + chartH - (d.avgPrice / maxPrice) * chartH;
      ctx.fillStyle = '#10b981';
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
    });

    // X축 라벨
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    priceData.forEach((d, i) => {
      if (n <= 6 || i % 2 === 0) {
        const x = padL + (chartW / (n - 1 || 1)) * i;
        ctx.fillText(d.month, x, H - 8);
      }
    });

    // Y축 라벨 (가격)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6b7280';
    for (let i = 0; i <= 4; i++) {
      const val = (maxPrice / 4) * (4 - i);
      const y = padT + (chartH / 4) * i;
      const label = val >= 10000 ? (val / 10000).toFixed(1) + '억' : Math.round(val).toLocaleString() + '만';
      ctx.fillText(label, padL - 5, y + 3);
    }
  }, [priceData]);

  if (chartLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-40 bg-gray-100 rounded-lg" />
      </div>
    );
  }

  if (chartError) {
    return (
      <div className="bg-green-50/50 rounded-xl p-3.5">
        <p className="text-xs text-gray-500">{chartError}</p>
        <a
          href="https://rt.molit.go.kr/pt/xls/xls.do#tabNm=6"
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-100 hover:bg-green-200 px-3 py-2 rounded-lg transition-colors font-medium mt-2"
        >
          <TrendingUp className="w-3 h-3" /> 국토교통부 실거래가 조회 <ChevronRight className="w-3 h-3" />
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <span className="flex items-center gap-1 text-[10px] text-gray-400">
          <span className="inline-block w-3 h-0.5 bg-emerald-500 rounded" /> 평균가
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-400">
          <span className="inline-block w-3 h-3 bg-blue-500/20 rounded-sm" /> 거래량
        </span>
      </div>
      <canvas ref={canvasRef} className="w-full" style={{ height: '200px' }} />
      <p className="text-[10px] text-gray-400 mt-1 text-right">최근 12개월 기준 · 국토교통부 실거래가 공개시스템</p>
    </div>
  );
}

export default function ListingDetailClient({ id }: Props) {
  const [listing, setListing] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nearbyListings, setNearbyListings] = useState<any[]>([]);

  // 주변 교통 정보
  const [nearbyStations, setNearbyStations] = useState<NearbyStation[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);

  // 카카오 지도 ref
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      const lid = parseInt(id);
      const supabase = createClient();
      const [lr, ir, fr] = await Promise.all([
        supabase.from('listings').select('*').eq('id', lid).single(),
        supabase.from('listing_images').select('id, url, sort_order').eq('listing_id', lid).order('sort_order', { ascending: true }),
        supabase.from('listing_features').select('id, feature').eq('listing_id', lid),
      ]);
      if (!lr.data) { setNotFound(true); setLoading(false); return; }
      addToRecentlyViewed(lr.data);
      setListing(lr.data);
      setImages(ir.data || []);
      setFeatures(fr.data || []);
      setLoading(false);
      supabase.from('listings').update({ views: (lr.data.views || 0) + 1 }).eq('id', lid).then(() => {}).catch(() => {});
      if (lr.data.dong) {
        const q = supabase.from('listings').select('*, listing_images(url, sort_order)').eq('status', '가용').neq('id', lid).limit(4);
        if (lr.data.dong) q.eq('dong', lr.data.dong);
        const { data: related } = await q;
        if (related) {
          const nearby = related.map((r: any) => ({ ...r, images: r.listing_images?.sort((a: any, b: any) => a.sort_order - b.sort_order) || [] }));
          setNearbyListings(nearby.slice(0, 4));
        }
      }
    };
    fetchData();
  }, [id]);

  // 주변 교통 API 호출
  useEffect(() => {
    if (!listing?.id) return;
    setStationsLoading(true);
    fetch(`/api/listings/${listing.id}/nearby`)
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data?.stations) {
          setNearbyStations(json.data.stations);
        }
      })
      .catch(() => {})
      .finally(() => setStationsLoading(false));
  }, [listing?.id]);

  // 카카오 지도 초기화 (이동 불가 + 마커 근사화)
  useEffect(() => {
    if (!listing?.lat || !listing?.lng || !mapRef.current) return;
    const initMap = () => {
      if (!window.kakao?.maps) return;
      window.kakao.maps.load(() => {
        const container = mapRef.current;
        if (!container) return;
        // 마커 위치 근사화: 원래 좌표에서 약 200~500m 범위 랜덤 오프셋
        const offsetLat = (Math.random() - 0.5) * 0.005;
        const offsetLng = (Math.random() - 0.5) * 0.005;
        const approxLat = listing.lat + offsetLat;
        const approxLng = listing.lng + offsetLng;
        const center = new window.kakao.maps.LatLng(approxLat, approxLng);
        const options = {
          center,
          level: 5,
          draggable: false,
          scrollwheel: false,
          disableDoubleClick: true,
          disableDoubleClickZoom: true,
        };
        const map = new window.kakao.maps.Map(container, options);
        map.setZoomable(false);
        // 근사 위치에 원형 오버레이 표시 (정확한 마커 대신)
        const circle = new window.kakao.maps.Circle({
          center,
          radius: 150,
          strokeWeight: 2,
          strokeColor: '#FF6B6B',
          strokeOpacity: 0.8,
          strokeStyle: 'solid',
          fillColor: '#FF6B6B',
          fillOpacity: 0.15,
        });
        circle.setMap(map);
        // 중심에 작은 마커도 표시
        new window.kakao.maps.Marker({ map, position: center });
      });
    };
    if (window.kakao?.maps) { initMap(); }
    else {
      const checkInterval = setInterval(() => {
        if (window.kakao?.maps) { clearInterval(checkInterval); initMap(); }
      }, 500);
      return () => clearInterval(checkInterval);
    }
  }, [listing?.lat, listing?.lng]);

  if (loading) return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
              <div className="aspect-[16/10] bg-gray-200" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-8 w-2/3 bg-gray-200 rounded mb-2" />
              <div className="h-9 w-1/3 bg-gray-200 rounded mb-6" />
              <div className="grid grid-cols-2 gap-4">
                {Array.from({length:6}).map((_,i)=>(<div key={i}><div className="h-3 w-12 bg-gray-100 rounded mb-1" /><div className="h-5 w-24 bg-gray-200 rounded" /></div>))}
              </div>
            </div>
          </div>
          <div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
              <div className="h-12 w-full bg-gray-200 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (notFound) return (
    <div className="pt-16 min-h-screen bg-wishes-bg flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-500 text-lg">매물을 찾을 수 없습니다</p>
        <Link href="/listings" className="text-wishes-secondary hover:underline mt-2 inline-block">매물 목록으로</Link>
      </div>
    </div>
  );

  const price = getFormattedPrice(listing.deal, listing.deposit, listing.monthly, listing.price);

  const handleCopyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  const handleKakaoShare = () => {
    if (typeof window !== 'undefined' && window.Kakao) {
      if (!window.Kakao.isInitialized()) return;
      const img = listing?.listing_images?.[0]?.url || listing?.images?.[0]?.url || '';
      const priceText = listing?.deal === '매매'
        ? (listing.price >= 10000 ? Math.floor(listing.price/10000)+'억' : listing.price?.toLocaleString()+'만원')
        : listing?.deposit?.toLocaleString()+'/'+listing?.monthly?.toLocaleString();
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: listing?.title || '매물 정보',
          description: (listing?.dong||'')+' '+(listing?.type||'')+' '+(listing?.deal||'')+' '+priceText,
          imageUrl: img,
          link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
        },
        buttons: [{ title: '매물 보기', link: { mobileWebUrl: window.location.href, webUrl: window.location.href } }],
      });
    }
  };

  // 동까지만 주소 표시
  const displayAddress = listing.dong || (listing.address ? listing.address.split(' ').slice(0, 3).join(' ') : '');

  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      {/* 상단 네비게이션 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/listings" className="flex items-center gap-1 text-sm text-gray-500 hover:text-wishes-secondary">
            <ArrowLeft className="w-4 h-4" />매물 목록
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-700 font-medium truncate">{listing.title}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 왼쪽 메인 영역 */}
          <div className="lg:col-span-2 space-y-6">
            <ImageGallery images={images} title={listing.title} deal={listing.deal} status={listing.status} dealColor={getDealColor(listing.deal)} statusColor={getStatusColor(listing.status)} />

            {/* 매물 기본 정보 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                  <Hash className="w-3 h-3" /> W-{listing.id}
                </span>
                {listing.views > 0 && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Eye className="w-3 h-3" /> 조회 {listing.views}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-wishes-primary">{listing.title}</h1>
              <p className="text-3xl font-bold text-wishes-accent mt-2">{price.main}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-6">
                <IR label="매물유형" value={listing.type} />
                <IR label="거래유형" value={listing.deal} />
                <IR label="전용면적" value={listing.area_m2 ? listing.area_m2 + '㎡ (' + sqmToPyeong(listing.area_m2) + '평)' : '정보 없음'} />
                <IR label="층수" value={listing.floor_current} />
                <IR label="소재지" value={displayAddress} fw />
                {listing.built_year && <IR label="준공년도" value={listing.built_year} />}
                {listing.available_date && <IR label="입주가능일" value={listing.available_date} />}
              </div>
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">옵션 / 시설</h3>
                <div className="flex flex-wrap gap-2">
                  <OB label="주차" a={listing.parking ?? false} />
                  <OB label="엘리베이터" a={listing.elevator ?? false} />
                  <OB label="반려동물" a={listing.pet ?? false} />
                  <OB label="발코니" a={listing.balcony ?? false} />
                  <OB label="풀옵션" a={listing.full_option ?? false} />
                  {features.map((f) => (
                    <span key={f.id} className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-full">{f.feature}</span>
                  ))}
                </div>
              </div>
              {listing.description && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">상세 설명</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{listing.description}</p>
                </div>
              )}
            </div>

            {/* 주변 교통 섹션 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Train className="w-5 h-5 text-blue-500" /> 주변 교통
              </h3>
              <div className="bg-blue-50/50 rounded-xl p-3.5">
                {stationsLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="flex items-center justify-between animate-pulse">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-blue-200" />
                          <div className="h-3.5 w-16 bg-blue-100 rounded" />
                        </div>
                        <div className="h-3 w-14 bg-blue-100 rounded" />
                      </div>
                    ))}
                  </div>
                ) : nearbyStations.length > 0 ? (
                  <div className="space-y-2">
                    {nearbyStations.map((station, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">{station.line}</span>
                          <span className="text-sm font-medium text-gray-800">{station.name}역</span>
                        </div>
                        <span className="text-xs text-blue-600 font-medium">도보 {station.walkMin}분</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">반경 2km 내 지하철역 없음</p>
                )}
              </div>
            </div>

            {/* 실거래가 동향 섹션 */}
            {listing.dong && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-500" /> {listing.dong} {listing.type || ''} 실거래가 동향
                </h3>
                <RealPriceChart listingId={listing.id} dong={listing.dong} type={listing.type || '아파트'} />
              </div>
            )}
          </div>

          {/* 오른쪽 사이드바 */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:sticky lg:top-24">
              <h3 className="text-lg font-bold text-wishes-primary mb-4">이 매물 문의하기</h3>
              <Link href={'/contact?listing_id=' + listing.id + '&listing_title=' + encodeURIComponent(listing.title)}
                className="flex items-center justify-center gap-2 w-full bg-wishes-primary text-white py-3 rounded-xl font-bold hover:bg-wishes-secondary transition-colors"
              >
                온라인 상담 신청
              </Link>
              <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                <p className="flex items-center gap-1"><Calendar className="w-3 h-3" />등록일: {new Date(listing.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
                <p className="flex items-center gap-1"><Calendar className="w-3 h-3" />수정일: {new Date(listing.updated_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 하단 공유 & 지도 & 연관매물 영역 */}
      <div className="max-w-5xl mx-auto px-4 pb-8 space-y-6">
        {/* 공유하기 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Share2 className="w-5 h-5 text-green-600" /> 공유하기
          </h3>
          <div className="flex gap-3">
            <button onClick={handleCopyLink} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border hover:bg-gray-50 transition-colors text-sm font-medium">
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              {copied ? '복사 완료!' : '링크 복사'}
            </button>
            <button onClick={handleKakaoShare} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-[#FEE500] hover:bg-[#F5DC00] transition-colors text-sm font-medium text-[#3C1E1E]">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#3C1E1E">
                <path d="M12 3C6.48 3 2 6.58 2 10.9c0 2.78 1.86 5.21 4.65 6.6-.15.56-.96 3.6-.99 3.83 0 0-.02.17.09.24.11.06.24.01.24.01.32-.04 3.7-2.44 4.28-2.86.55.08 1.13.13 1.73.13 5.52 0 10-3.58 10-7.95C22 6.58 17.52 3 12 3"/>
              </svg>
              카카오톡 공유
            </button>
          </div>
        </div>

        {/* 위치 정보 (카카오 SDK 지도) - 이동 불가, 근사 위치 */}
        {listing?.lat && listing?.lng && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-green-600" /> 위치 정보
            </h3>
            <p className="text-sm text-gray-600 mb-1">{displayAddress}</p>
            <p className="text-xs text-gray-400 mb-3">* 정홽한 위치는 상담 시 안내드립니다</p>
            <div ref={mapRef} className="rounded-lg overflow-hidden border" style={{height:'300px'}} />
          </div>
        )}

        {/* 연관 매물 */}
        {nearbyListings.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-bold mb-4">이 근처 다른 매물</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {nearbyListings.map((item) => (<ListingCard key={item.id} listing={item} />))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IR({ label, value, fw }: { label: string; value: string; fw?: boolean }) {
  return (
    <div className={fw ? 'col-span-2' : ''}>
      <span className="text-xs text-gray-400">{label}</span>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}

function OB({ label, a }: { label: string; a: boolean }) {
  if (!a) return null;
  return (
    <span className="flex items-center gap-1 px-3 py-1 text-sm rounded-full bg-green-50 text-green-700">
      <Check className="w-3 h-3" />{label}
    </span>
  );
}
