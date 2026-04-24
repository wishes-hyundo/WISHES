'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LightboxProps {
  images: { url: string; alt?: string | null }[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function Lightbox({ images, initialIndex = 0, isOpen, onClose }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoomed(false);
  }, [initialIndex, isOpen]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setZoomed(false);
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setZoomed(false);
  }, [images.length]);

  // 키보드 네비게이션
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          handlePrev();
          break;
        case 'ArrowRight':
          handleNext();
          break;
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || images.length === 0) return null;

  const current = images[currentIndex];

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/95 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="이미지 뷰어"
      onClick={onClose}
    >
      {/* 상단 바 */}
      <div className="flex items-center justify-between px-4 py-3 text-white/80" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-medium">
          {currentIndex + 1} / {images.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoomed(!zoomed)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label={zoomed ? '축소' : '확대'}
          >
            {zoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 이미지 */}
      <div className="flex-1 flex items-center justify-center px-4 relative" onClick={(e) => e.stopPropagation()}>
        {images.length > 1 && (
          <button
            onClick={handlePrev}
            className="absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
            aria-label="이전 이미지"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <img
          src={current.url}
          alt={current.alt || `이미지 ${currentIndex + 1}`}
          decoding="async"
          className={cn(
            'max-h-[80vh] max-w-full object-contain transition-transform duration-300 rounded-lg',
            zoomed ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in'
          )}
          onClick={() => setZoomed(!zoomed)}
        />

        {images.length > 1 && (
          <button
            onClick={handleNext}
            className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
            aria-label="다음 이미지"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* 썸네일 바 */}
      {images.length > 1 && (
        <div className="flex justify-center gap-2 px-4 py-3 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => { setCurrentIndex(idx); setZoomed(false); }}
              className={cn(
                'w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all',
                idx === currentIndex
                  ? 'border-wishes-accent opacity-100'
                  : 'border-transparent opacity-50 hover:opacity-80'
              )}
            >
              <img
                src={img.url}
                alt={img.alt || `썸네일 ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
