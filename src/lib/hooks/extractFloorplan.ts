/**
 * L-Step4 (2026-04-29): Vision LLM 도면 자동 분석 hook
 *
 * /admin/listings/new STEP 3 사진 업로드 시 첫 사진을 Gemini Flash 에 보내
 * 도면이면 rooms/bathrooms/direction 자동 추출 → 콜백으로 form 채우기.
 * 
 * 사장님 손 0 — 자동화 우선 정책.
 */

export interface FloorplanAutoResult {
  rooms: number | null;
  bathrooms: number | null;
  direction: string;
  confidence: number;
  notes?: string;
}

/**
 * Browser-side: file → base64 → POST /api/admin/extract-floorplan
 * Returns null if 도면 아니거나 confidence < 50.
 */
export async function extractFloorplanFromFile(file: File): Promise<FloorplanAutoResult | null> {
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);

    let wsToken = '';
    try {
      wsToken = sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
    } catch { /* */ }
    if (!wsToken) return null;

    const res = await fetch('/api/admin/extract-floorplan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + wsToken,
      },
      body: JSON.stringify({ imageBase64: b64, mime: file.type || 'image/jpeg' }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      floorplan?: {
        isFloorplan?: boolean;
        rooms?: number | null;
        bathrooms?: number | null;
        direction?: string | null;
        confidence?: number;
        notes?: string | null;
      };
    };
    const fp = json.floorplan;
    if (!json.success || !fp || !fp.isFloorplan) return null;
    if ((fp.confidence ?? 0) < 50) return null;

    return {
      rooms: fp.rooms ?? null,
      bathrooms: fp.bathrooms ?? null,
      direction: fp.direction || '',
      confidence: fp.confidence ?? 0,
      notes: fp.notes ?? undefined,
    };
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[L-Step4] extractFloorplanFromFile failed', e);
    return null;
  }
}
