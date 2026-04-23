/* ============================================================
   ë§¤ë¬¼ ë±ë¡ ì AI ìë ìì± + ê±´ì¶ë¬¼ëì¥ ìë ì¡°í í
   íì¼: src/components/admin/useAutoGenerateOnCreate.ts
   ì©ë: ë§¤ë¬¼ ì ê· ë±ë¡ í ìëì¼ë¡:
         1) AI ì ëª©/ì¤ëª/SEO ìì±
         2) ê±´ì¶ë¬¼ëì¥ ì ë³´ ì¡°í
   ì ì©: admin/page.tsx ëë admin/listings/new/page.tsx ìì ì¬ì©
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

    // 1. AI ì ëª©/ì¤ëª/SEO ìë ìì±
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

        // ìì±ë ë´ì©ì ë§¤ë¬¼ì ë°ë¡ ì ì©
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
      result.errors.push('AI ìì± ì¤í¨: ' + err.message);
    }

    // 2. ê±´ì¶ë¬¼ëì¥ ìë ì¡°í
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
      result.errors.push('ê±´ì¶ë¬¼ëì¥ ì¡°í ì¤í¨: ' + err.message);
    }

    return result;
  }, []);

  return { autoGenerate };
}

/* ââ ì¬ì© ìì ââ

// admin/page.tsx ëë admin/listings/new/page.tsx ë´:

import { useAutoGenerateOnCreate } from '@/components/admin/useAutoGenerateOnCreate';

function AdminPage() {
  const { autoGenerate } = useAutoGenerateOnCreate();

  const handleListingCreate = async (newListing) => {
    // 1. ë¨¼ì  ë§¤ë¬¼ì DBì ì ì¥
    const res = await fetch('/api/admin/listings', {
      method: 'POST',
      body: JSON.stringify(newListing),
      ...
    });
    const saved = await res.json();

    // 2. ì ì¥ í ìëì¼ë¡ AI + ê±´ì¶ë¬¼ëì¥ ì¡°í
    const result = await autoGenerate(saved);

    if (result.aiGenerated) {
      alert('â AIê° ì ëª©ê³¼ ì¤ëªì ìë ìì±íìµëë¤.');
    }
    if (result.buildingFetched) {
      alert('â ê±´ì¶ë¬¼ëì¥ ì ë³´ë¥¼ ìëì¼ë¡ ê°ì ¸ììµëë¤.');
    }
    if (result.errors.length > 0) {
      console.warn('ìë ìì± ì¤ë¥:', result.errors);
    }
  };
}
*/
