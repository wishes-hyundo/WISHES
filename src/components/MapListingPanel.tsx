'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { formatPrice } from '@/lib/utils';
import {
  ArrowLeft, Maximize2, ChevronLeft, ChevronRight, Building2,
  Layers, Home, Compass, Flame as FlameIcon, Eye, ExternalLink,
  Train, TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

interface MapListingPanelProps {
  listingId: number;
  onClose: () => void;
}

const supabase = createClient();

const sqmToPyeong = (area: number) => (area / 3.3).toFixed(1);

const formatAmount = (amount: number) => {
  if (amount >= 10000) {
    const uk = Math.floor(amount / 10000);
    const man = amount % 10000;
    return man > 0 ? `${uk}억 ${man.toLocaleString('ko-KR')}` : `${uk}억`;
  }
  return `${amount.toLocaleString('ko-KR')}만`;
};

const getDealColor = (deal: string) => {
  switch (deal) {
    case '전세': return 'bg-blue-500';
    case '월세': return 'bg-orange-500';
    case '매매': return 'bg-emerald-500';
    default: return 'bg-gray-400';
  }
};

// ── 실거래가 미니 차트 ──
function RealPriceMiniChart({ listingId, type }: { listingId: number; type: string }) {
  const [priceData, setPriceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/listings/${listingId}/real-prices`);
        if (!res.ok) throw new Error('데이터 없음');
        const json = await res.json();
        if (json.success && json.data?.length > 0) {
          setPriceData(json.data);
        } else {
          setError('실거래 데이터 없음');
        }
      } catch {
        setError('실거래 데이터 없음');
      } finally {
        setLoading(false);
      }
    };
    fetchPrices();
  }, [listingId]);

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
    const padL = 45, padR = 10, padT = 10, padB = 25;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    const prices = priceData.map((d: any) => d.avgPrice);
    const counts = priceData.map((d: any) => d.count);
    const maxPrice = Math.max(...prices) * 1.1 || 1;
    const maxCount = Math.max(...counts) * 1.3 || 1;
    const n = priceData.length;

    // 배경 그리드
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 3; i++) {
      const y = padT + (chartH / 3) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    }

    // 막대 (거래량)
    const barWidth = Math.min(chartW / n * 0.5, 20);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    priceData.forEach((d: any, i: number) => {
      const x = padL + (chartW / (n - 1 || 1)) * i;
      const barH = (d.count / maxCount) * chartH;
      ctx.fillRect(x - barWidth / 2, padT + chartH - barH, barWidth, barH);
    });

    // 꺾은선 (평균가)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    priceData.forEach((d: any, i: number) => {
      const x = padL + (chartW / (n - 1 || 1)) * i;
      const y = padT + chartH - (d.avgPrice / maxPrice) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 포인트
    priceData.forEach((d: any, i: number) => {
      const x = padL + (chartW / (n - 1 || 1)) * i;
      const y = padT + chartH - (d.avgPrice / maxPrice) * chartH;
      ctx.fillStyle = '#10b981';
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    });

    // X축 라벨
    ctx.fillStyle = '#9ca3af';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    priceData.forEach((d: any, i: number) => {
      if (n <= 6 || i % 3 === 0 || i === n - 1) {
        const x = padL + (chartW / (n - 1 || 1)) * i;
        ctx.fillText(d.month, x, H - 5);
      }
    });

    // Y축 라벨
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6b7280';
    ctx.font = '9px sans-serif';
    for (let i = 0; i <= 3; i++) {
      const val = (maxPrice / 3) * (3 - i);
      const y = padT + (chartH / 3) * i;
      const label = val >= 10000 ? (val / 10000).toFixed(1) + '억' : Math.round(val).toLocaleString() + '만';
      ctx.fillText(label, padL - 4, y + 3);
    }
  }, [priceData]);

  if (loading) {
    return <div className="h-28 bg-gray-100 rounded animate-pulse" />;
  }

  if (error) {
    return (
      <a
        href="https://rt.molit.go.kr/pt/xls/xls.do#tabNm=6"
        target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
      >
        <TrendingUp className="w-5 h-5 text-blue-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-blue-900">국토교통부 실거래가 조회</p>
          <p className="text-xs text-gray-600 mt-0.5">실거래 데이터를 직접 확인하세요</p>
        </div>
        <ExternalLink className="w-4 h-4 text-blue-600 shrink-0" />
      </a>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="flex items-center gap-1 text-[9px] text-gray-400">
          <span className="inline-block w-2.5 h-0.5 bg-emerald-500 rounded" /> 평균가
        </span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400">
          <span className="inline-block w-2.5 h-2.5 bg-blue-500/20 rounded-sm" /> 거래량
        </span>
      </div>
      <canvas ref={canvasRef} className="w-full" style={{ height: '140px' }} />
      <p className="text-[9px] text-gray-400 mt-0.5 text-right">최근 12개월 · 국토교통부</p>
    </div>
  );
}

export default function MapListingPanel({ listingId, onClose }: MapListingPanelProps) {
  const [listing, setListing] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    setCurrentImageIndex(0);
    const fetchData = async () => {
      const [listingRes, imagesRes, featuresRes] = await Promise.all([
        supabase.from('listings').select('*').eq('id', listingId).single(),
        supabase.from('listing_images').select('*').eq('listing_id', listingId).order('sort_order', { ascending: true }),
        supabase.from('listing_features').select('*').eq('listing_id', listingId),
      ]);
      if (listingRes.data) setListing(listingRes.data);
      if (imagesRes.data) setImages(imagesRes.data);
      if (featuresRes.data) setFeatures(featuresRes.data);
      setLoading(false);
    };
    fetchData();
  }, [listingId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-3 border-wishes-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
        <Building2 className="w-10 h-10" />
        <p className="text-sm">매물 정보를 불러올 수 없습니다</p>
        <button onClick={onClose} className="text-xs text-wishes-secondary underline">돌아가기</button>
      </div>
    );
  }

  const priceDisplay = listing.deal === '매매'
    ? formatAmount(listing.price || 0)
    : listing.deal === '전세'
    ? formatAmount(listing.deposit)
    : `${formatAmount(listing.deposit)} / 월 ${listing.monthly || 0}만`;

  // 동까지만 주소 표시
  const displayAddress = listing.dong || (listing.address ? listing.address.split(' ').slice(0, 3).join(' ') : '');

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white shrink-0">
        <button onClick={onClose} className="flex items-center gap-1 text-sm text-gray-600 hover:text-wishes-primary transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="font-medium">목록</span>
        </button>
        <Link href={`/listings/${listing.id}`} className="flex items-center gap-1 text-xs text-wishes-secondary hover:underline">
          상세보기 <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* 스크롤 가능 영역 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* 이미지 슬라이더 */}
        <div className="relative aspect-[4/3] bg-gray-100">
          {images.length > 0 ? (
            <>
              <img src={images[currentImageIndex]?.url} alt={listing.title} className="w-full h-full object-cover" />
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                    {currentImageIndex + 1} / {images.length}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Building2 className="w-12 h-12 text-gray-300" />
            </div>
          )}
          <span className={`absolute top-3 left-3 px-3 py-1 text-xs font-bold text-white rounded-lg shadow-md ${getDealColor(listing.deal)}`}>
            {listing.deal}
          </span>
        </div>

        {/* 가격 */}
        <div className="px-4 py-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            {listing.deal === '매매' ? '매매가' : listing.deal === '전세' ? '전세금' : '보증금/월세'}
          </p>
          <p className="text-2xl font-bold text-wishes-primary">{priceDisplay}</p>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{listing.title}</p>
        </div>

        {/* 기본 정보 그리드 */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-3">
            {(listing.area_m2 || listing.area) ? (
              <div className="flex items-center gap-2 text-sm">
                <Maximize2 className="w-4 h-4 text-wishes-secondary/60 shrink-0" />
                <div>
                  <p className="text-gray-400 text-[10px]">면적</p>
                  <p className="font-medium text-gray-800">
                    {listing.area_m2 || listing.area}m&sup2; ({sqmToPyeong(listing.area_m2 || listing.area)}평)
                  </p>
                </div>
              </div>
            ) : null}
            {(listing.floor_current || listing.floor) ? (
              <div className="flex items-center gap-2 text-sm">
                <Layers className="w-4 h-4 text-wishes-secondary/60 shrink-0" />
                <div>
                  <p className="text-gray-400 text-[10px]">층수</p>
                  <p className="font-medium text-gray-800">
                    {listing.floor_current || listing.floor}
                    {listing.floor_total ? `/${listing.floor_total}층` : '층'}
                  </p>
                </div>
              </div>
            ) : null}
            {listing.rooms ? (
              <div className="flex items-center gap-2 text-sm">
                <Home className="w-4 h-4 text-wishes-secondary/60 shrink-0" />
                <div>
                  <p className="text-gray-400 text-[10px]">방/욕실</p>
                  <p className="font-medium text-gray-800">
                    {listing.rooms}방 {listing.bathrooms ? `/ ${listing.bathrooms}욕실` : ''}
                  </p>
                </div>
              </div>
            ) : null}
            {listing.direction ? (
              <div className="flex items-center gap-2 text-sm">
                <Compass className="w-4 h-4 text-wishes-secondary/60 shrink-0" />
                <div>
                  <p className="text-gray-400 text-[10px]">방향</p>
                  <p className="font-medium text-gray-800">{listing.direction}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* 옵션/펴의시설 */}
        {features.length > 0 && (
          <div className="px-4 py-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 mb-2">옵션/편의시설</p>
            <div className="flex flex-wrap gap-1.5">
              {features.map((f: any, i: number) => (
                <span key={i} className="px-2.5 py-1 text-xs bg-gray-50 text-gray-600 rounded-full border border-gray-200">
                  {f.feature || f.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 기본 옵션 태그 */}
        {(listing.parking || listing.elevator || listing.pet) && (
          <div className="px-4 py-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 mb-2">편의시설</p>
            <div className="flex flex-wrap gap-1.5">
              {listing.parking && (
                <span className="px-2.5 py-1 text-xs bg-wishes-secondary/10 text-wishes-secondary rounded-full border border-wishes-secondary/20">
                  주차가능
                </span>
              )}
              {listing.elevator && (
                <span className="px-2.5 py-1 text-xs bg-wishes-accent/10 text-wishes-accent rounded-full border border-wishes-accent/20">
                  엘리베이터
                </span>
              )}
              {listing.pet && (
                <span className="px-2.5 py-1 text-xs bg-emerald-500/10 text-emerald-600 rounded-full border border-emerald-500/20">
                  반려동물
                </span>
              )}
            </div>
          </div>
        )}

        {/* 설명 */}
        {listing.description && (
          <div className="px-4 py-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 mb-2">상세 설명</p>
            <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed line-clamp-6">
              {listing.description}
            </p>
          </div>
        )}

        {/* 위치 정보 - 동까지만 */}
        <div className="px-4 py-4 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-500 mb-2">위치</p>
          <p className="text-sm text-gray-600">{displayAddress}</p>
          <p className="text-[10px] text-gray-400 mt-1">* 정확한 위치는 상담 시 안내</p>
        </div>

        {/* 주변 교통 정보 */}
        <div className="px-4 py-4 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-500 mb-3">주변 교통 정보</p>
          <NearbyStationsSection listingId={listing.id} />
        </div>

        {/* 실거래가 동향 - 차트로 변경 */}
        <div className="px-4 py-4 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-500 mb-3">{listing.type || ''} 실거래가 동향</p>
          <RealPriceMiniChart listingId={listing.id} type={listing.type || '아파트'} />
        </div>

        {/* 조횋ㄘ + 등록일 */}
        <div className="px-4 py-3 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-3">
            {listing.views > 0 && (
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" /> {listing.views}
              </span>
            )}
            <span>W-{listing.id}</span>
          </div>
          {listing.created_at && (
            <span>
              {new Date(listing.created_at).toLocaleDateString('ko-KR', {
                timeZone: 'Asia/Seoul',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}
        </div>

        {/* 상세페이지 이동 버튼 */}
        <div className="px-4 py-4">
          <Link
            href={`/listings/${listing.id}`}
            className="block w-full py-3 text-center text-sm font-bold text-white bg-wishes-primary rounded-xl hover:bg-wishes-primary/90 transition-colors shadow-md"
          >
            매물 상세정보 보기
          </Link>
        </div>
      </div>
    </div>
  );
}

function NearbyStationsSection({ listingId }: { listingId: number }) {
  const [stations, setStations] = useState<any[]>([]);
  const [stationLoading, setStationLoading] = useState(true);
  const [stationError, setStationError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStations = async () => {
      try {
        setStationLoading(true);
        setStationError(null);
        const response = await fetch(`/api/listings/${listingId}/nearby`);
        if (!response.ok) {
          throw new Error('역 정보를 불러올 수 없습니다');
        }
        const data = await response.json();
        // API 응답 구조: { success, data: { stations } }
        const stationList = data.data?.stations || data.stations || [];
        setStations(stationList);
      } catch (error) {
        setStationError(error instanceof Error ? error.message : '오류 발생');
        setStations([]);
      } finally {
        setStationLoading(false);
      }
    };

    fetchStations();
  }, [listingId]);

  if (stationLoading) {
    return (
      <div className="space-y-2">
        <div className="h-10 bg-gray-200 rounded animate-pulse" />
        <div className="h-10 bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  if (stationError) {
    return (
      <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
        {stationError}
      </div>
    );
  }

  if (stations.length === 0) {
    return (
      <div className="p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
        반경 2km 내 지하철역 없음
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {stations.map((station: any, index: number) => (
        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold shrink-0">
              {station.line || <Train className="w-3 h-3" />}
            </span>
            <span className="text-xs font-semibold text-gray-800">{station.name}역</span>
          </div>
          <span className="text-xs text-blue-600 font-medium">
            {station.walkMin ? `도보 ${station.walkMin}분` : station.distance || '거리 정보 없음'}
          </span>
        </div>
      ))}
    </div>
  );
}