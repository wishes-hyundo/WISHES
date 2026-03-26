'use client';

import { useEffect, useCallback } from 'react';

const STORAGE_KEY = 'wishes_draft_listing';

interface UseListingDraftOptions {
  formData: any;
  setFormData: (fn: (prev: any) => any) => void;
  setPreviewImages: (images: string[]) => void;
  isSubmitting: boolean;
}

export function useListingDraft({
  formData,
  setFormData,
  setPreviewImages,
  isSubmitting,
}: UseListingDraftOptions) {

  // 1. 페이지 이탈 방지 (beforeunload)
  useEffect(() => {
    const hasData = !!(
      formData.title ||
      formData.address ||
      formData.description ||
      formData.images?.length > 0 ||
      formData.price > 0
    );

    const handler = (e: BeforeUnloadEvent) => {
      if (hasData && !isSubmitting) {
        e.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [
    formData.title,
    formData.address,
    formData.description,
    formData.images?.length,
    formData.price,
    isSubmitting,
  ]);

  // 2. 자동 임시저장 (formData 변경 시 1초 디바운스)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
      } catch (_) {
        // 용량 초과 등 무시
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [formData]);

  // 3. 페이지 최초 로드 시 임시저장 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      const hasContent = parsed.title || parsed.address || parsed.price > 0;
      if (!hasContent) return;

      if (window.confirm('이전에 작성하던 매물 정보가 있습니다.\n불러올까요?')) {
        setFormData((prev: any) => ({ ...prev, ...parsed }));
        if (parsed.images?.length > 0) {
          setPreviewImages(parsed.images);
        }
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (_) {
      // 파싱 오류 무시
    }
  }, []);

  // 임시저장 삭제 (등록 성공 시 호출)
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }, []);

  // 4. 스텝별 유효성 검사
  const validateStep = useCallback(
    (step: number): string | null => {
      switch (step) {
        case 2: // 주소 & 건축물대장
          if (!formData.address) return '주소를 입력해주세요.';
          return null;
        case 3: // 매물 정보
          if (!formData.transactionType) return '거래유형을 선택해주세요.';
          if (!formData.price || formData.price <= 0) return '가격을 입력해주세요.';
          return null;
        default:
          return null;
      }
    },
    [formData.address, formData.transactionType, formData.price],
  );

  // 최종 등록 전 유효성 검사
  const validateSubmit = useCallback((): string | null => {
    if (!formData.address) return '주소를 입력해주세요.';
    if (!formData.transactionType) return '거래유형을 선택해주세요.';
    if (!formData.price || formData.price <= 0) return '가격을 입력해주세요.';
    if (!formData.area || formData.area <= 0) return '면적(m\u00B2)을 입력해주세요.';
    return null;
  }, [formData.address, formData.transactionType, formData.price, formData.area]);

  return { clearDraft, validateStep, validateSubmit };
}
