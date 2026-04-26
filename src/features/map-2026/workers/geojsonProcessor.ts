// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// geojsonProcessor — L-naver-2026worker1 (2026-04-26)
// Web Worker: 대용량 GeoJSON 파싱 + bbox 사전계산을 메인 스레드 밖에서.
// dong GeoJSON (~34MB) 파싱이 메인 스레드 막던 문제 해결.
//
// 사용:
//   const w = new Worker(new URL('./geojsonProcessor.ts', import.meta.url));
//   w.postMessage({ type: 'process', json: rawJson });
//   w.onmessage = (e) => { const { features, bboxes } = e.data; }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FeatureLike {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
}

interface IncomingMessage {
  type: 'process';
  json: { features: FeatureLike[] };
}

interface OutgoingMessage {
  features: FeatureLike[];
  bboxes: Array<{ idx: number; west: number; south: number; east: number; north: number } | null>;
}

function computeBbox(feat: FeatureLike): { west: number; south: number; east: number; north: number } | null {
  const geom = feat.geometry;
  const paths: number[][][][] = geom.type === 'Polygon'
    ? [geom.coordinates as number[][][]]
    : geom.type === 'MultiPolygon' ? (geom.coordinates as number[][][][]) : [];
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const poly of paths) {
    for (const ring of poly) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  if (!Number.isFinite(minLng)) return null;
  return { west: minLng, south: minLat, east: maxLng, north: maxLat };
}

self.addEventListener('message', (e: MessageEvent<IncomingMessage>) => {
  const msg = e.data;
  if (msg.type !== 'process') return;
  const features = msg.json.features ?? [];
  const bboxes = features.map((f, idx) => {
    const b = computeBbox(f);
    return b ? { idx, ...b } : null;
  });
  const out: OutgoingMessage = { features, bboxes };
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(out);
});

export {};  // module file marker
