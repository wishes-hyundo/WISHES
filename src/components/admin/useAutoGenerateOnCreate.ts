/* ============================================================
   매물 등록 시 AI 자동 생성 + 건축물대장 자동 조회 훅
   파일: src/components/admin/useAutoGenerateOnCreate.ts
   용도: 매물 신규 등록 후 자동으로:
         1) AI 제목/설명/SEO 생성
         2) 건축물대장 정보 조회
   적용: admin/page.tsx 또는 admin/listings/new/page.tsx 에서 사용
   ============================================================ */

import { useCallback } from 'react';
// L-sec147 (2026-04-23, C-2 phase 3b): adminFetch wrapper for CSRF + cookie + Bearer.
import { adminFetch } from '@/lib/adminFetch';

interface ListingData {
  id: string;
  address: string;
  type?: string;
  deal?: string;
  deposit?: number;
  monthly?: number;
  price?: number;
  area_m2?: number;
  [key: string]: any;
}

interface AutoGenerateResult {
  aiGenerated: boolean;
  buildingFetched: boolean;
  errors: string[];
}

export function useAutoGenerateOnCreate() {
  const autoGenerate = useCallback(async (listing: ListingData): Promise<AutoGenerateResult> => {
    const token = localStorage.getItem('wishes_token') || '';
    const result: AutoGenerateResult = {
      aiGenerated: false,
      buildingFetched: false,
      errors: [],
    };

    // 1. AI 제목/설명/SEO 자동 생성
    try {
      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
      const aiRes = await adminFetch('/api/admin/generate-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: token,
        },
        body: JSON.stringify({
          listing: {
            ...listing,
            generateOptions: {
              excludePrice: true,
              excludeBasicInfo: true,
              focusOnAttraction: true,
              includeTransport: true,
              includeLifestyle: true,
              targetAudience: true,
              useEmoji: true,
              seoOptimized: true,
            },
          },
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();

        // 생성된 내용을 매물에 바로 적용
        // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
        const updateRes = await adminFetch(`/api/admin/listings/${listing.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            authorization: token,
          },
          body: JSON.stringify({
            title: aiData.title || aiData.generated_title,
            description: aiData.description || aiData.generated_description,
            seo_keywords: aiData.seo_keywords || aiData.keywords || [],
            seo_tags: aiData.seo_tags || aiData.tags || [],
            seo_title: aiData.seo_title || '',
            seo_description: aiData.seo_description || '',
          }),
        });

        result.aiGenerated = updateRes.ok;
      }
    } catch (err: any) {
      result.errors.push('AI 생성 실패: ' + err.message);
    }

    // 2. 건축물대장 자동 조회
    try {
      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
      const bldgRes = await adminFetch('/api/admin/building-registry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: token,
        },
        body: JSON.stringify({
          address: listing.address,
          listingId: listing.id,
        }),
      });

      result.buildingFetched = bldgRes.ok;
    } catch (err: any) {
      result.errors.push('건축물대장 조회 실패: ' + err.message);
    }

    return result;
  }, []);

  return { autoGenerate };
}

/* ── 사용 예시 ──

// admin/page.tsx 또는 admin/listings/new/page.tsx 내:

import { useAutoGenerateOnCreate } from '@/components/admin/useAutoGenerateOnCreate';

function AdminPage() {
  const { autoGenerate } = useAutoGenerateOnCreate();

  const handleListingCreate = async (newListing) => {
    // 1. 먼저 매물을 DB에 저장
    const res = await fetch('/api/admin/listings', {
      method: 'POST',
      body: JSON.stringify(newListing),
      ...
    });
    const saved = await res.json();

    // 2. 저장 후 자동으로 AI + 건축물대장 조회
    const result = await autoGenerate(saved);

    if (result.aiGenerated) {
      alert('✅ AI가 제목과 설명을 자동 생성했습니다.');
    }
    if (result.buildingFetched) {
      alert('✅ 건축물대장 정보를 자동으로 가져왔습니다.');
    }
    if (result.errors.length > 0) {
      console.warn('자동 생성 오류:', result.errors);
    }
  };
}
*/
