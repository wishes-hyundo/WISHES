'use client';

import { useState, useCallback, useEffect } from 'react';
import { Building2, ChevronLeft, ChevronRight, X, ZoomIn, Images } from 'lucide-react';

interface ImageGalleryProps {
  images: { id: number; url: string; alt: string | null }[];
  title: string;
  deal: string;
  status: string;
  dealColor: string;
  statusColor: string;
}

export default function ImageGallery({ images, title, deal, status, dealColor, statusColor }: ImageGalleryProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const hasImages = images.length > 0 && images[0].url;

  const goTo = useCallback((idx: number) => {
    if (idx < 0) setCurrentIdx(images.length - 1);
    else if (idx >= images.length) setCurrentIdx(0);
    else setCurrentIdx(idx);
  }, [images.length]);

  // 키보드 네비게이션 (라이트박스)
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowLeft') goTo(currentIdx - 1);
      if (e.key === 'ArrowRight') goTo(currentIdx + 1);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [lightboxOpen, currentIdx, goTo]);

  return (
    <>
      <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
        {/* 메인 이미지 */}
        <div className="aspect-[16/10] bg-gray-100 relative group cursor-pointer" onClick={() => hasImages && setLightboxOpen(true)}>
          {hasImages ? (
            <>
              <img
                src={images[currentIdx].url}
                alt={images[currentIdx].alt || title}
                className="w-full h-full object-cover transition-transform duration-300"
              />
              {/* 확대 오버레이 */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/50 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2">
                  <ZoomIn className="w-4 h-4" />
                  크게 보기
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gradient-to-br from-gray-100 to-gray-200">
              <Building2 className="w-16 h-16 mb-2" />
              <p className="text-sm">이미지 준비 중</p>
            </div>
          )}

          {/* 거래/상태 뱃지 */}
          <span className={`absolute top-4 left-4 px-3 py-1 text-sm font-bold rounded-lg ${dealColor}`}>
            {deal}
          </span>
          <span className={`absolute top-4 right-4 px-3 py-1 text-sm font-medium rounded-lg ${statusColor}`}>
            {status}
          </span>

          {/* 좌우 네비 */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); goTo(currentIdx - 1); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200"
                aria-label="이전 이미지"
              >
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); goTo(currentIdx + 1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200"
                aria-label="다음 이미지"
              >
                <ChevronRight className="w-5 h-5 text-gray-700" />
              </button>
            </>
          )}

          {/* 이미지 카운터 */}
          {images.length > 1 && (
            <div className="absolute bottom-3 right-3 bg-black/60 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1.5">
              <Images className="w-3.5 h-3.5" />
              {currentIdx + 1} / {images.length}
            </div>
          )}
        </div>

        {/* 썸네일 */}
        {images.length > 1 && (
          <div className="flex gap-1.5 p-2.5 overflow-x-auto">
            {images.map((img, idx) => (
              <button
                key={img.id}
                onClick={() => setCurrentIdx(idx)}
                className={`w-20 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                  idx === currentIdx
                    ? 'border-wishes-secondary ring-1 ring-wishes-secondary/30 scale-[1.02]'
                    : 'border-transparent hover:border-gray-300 opacity-70 hover:opacity-100'
                }`}
              >
                <img src={img.url} alt={img.alt || ''} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 라이트박스 */}
      {lightboxOpen && hasImages && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          {/* 닫기 */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-10"
            aria-label="닫기"
          >
            <X className="w-6 h-6" />
          </button>

          {/* 카운터 */}
          <div className="absolute top-4 left-4 text-white/70 text-sm z-10">
            {currentIdx + 1} / {images.length}
          </div>

          {/* 메인 이미지 */}
          <div className="max-w-[90vw] max-h-[85vh] relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={images[currentIdx].url}
              alt={images[currentIdx].alt || title}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>

          {/* 좌우 네비 */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); goTo(currentIdx - 1); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                aria-label="이전 이미지"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); goTo(currentIdx + 1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                aria-label="다음 이미지"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* 하단 썴네일 */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 px-4 py-2 bg-black/50 rounded-full max-w-[90vw] overflow-x-auto">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={(e) => { e.stopPropagation(); setCurrentIdx(idx); }}
                  className={`w-12 h-9 shrink-0 rounded overflow-hidden border-2 transition-all ${
                    idx === currentIdx
                      ? 'border-white opacity-100'
                      : 'border-transparent opacity-50 hover:opacity-80'
                  }`}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
