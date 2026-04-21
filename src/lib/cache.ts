// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 프로세스 레벨 인메모리 캐시 (Stale-While-Revalidate)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Supabase Free Plan (Nano) DB 과부하 방지를 위한 핵심 캐시 레이어
// - DB가 느려도 캐시된 데이터를 즉시 반환
// - 백그라운드에서 DB 갱신 시도 (stale-while-revalidate)
// - Vercel Serverless Function 프로세스 내에서 global 변수로 유지
//

interface CacheEntry<T> {
  data: T;
  timestamp: number;       // 캐시 저장 시각
  isRefreshing: boolean;   // 백그라운드 갱신 중 여부
}

const store = new Map<string, CacheEntry<any>>();

/**
 * stale-while-revalidate 캐시
 *
 * @param key       캐시 키
 * @param fetcher   데이터를 가져오는 비동기 함수
 * @param maxAge    캐시 유효 시간 (ms) — 이 시간 내에는 캐시 즉시 반환
 * @param staleAge  stale 허용 시간 (ms) — 이 시간까지는 stale 데이터 반환 + 백그라운드 갱신
 * @param timeoutMs fetcher 타임아웃 (ms) — 이 시간 초과 시 stale 데이터 반환
 * @returns         캐시된 데이터 또는 fresh 데이터
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  maxAge: number = 30_000,      // 기본 30초 fresh
  staleAge: number = 300_000,   // 기본 5분 stale 허용
  timeoutMs: number = 5_000,    // 기본 5초 타임아웃
): Promise<T | null> {
  const now = Date.now();
  const entry = store.get(key);

  // 1) 캐시 있고, fresh → 즉시 반환
  if (entry && (now - entry.timestamp) < maxAge) {
    return entry.data;
  }

  // 2) 캐시 있고, stale → stale 데이터 반환 + 백그라운드 갱신
  if (entry && (now - entry.timestamp) < staleAge) {
    if (!entry.isRefreshing) {
      entry.isRefreshing = true;
      // 백그라운드에서 갱신 (결과를 기다리지 않음)
      refreshInBackground(key, fetcher, timeoutMs).catch(() => {});
    }
    return entry.data;
  }

  // 3) 캐시 없거나 완전 만료 → 직접 fetch (타임아웃 적용)
  try {
    const data = await withTimeout(fetcher(), timeoutMs);
    store.set(key, { data, timestamp: now, isRefreshing: false });
    return data;
  } catch {
    // fetch 실패 → 혹시 stale 데이터라도 있으면 반환
    if (entry) {
      return entry.data;
    }
    return null;
  }
}

/**
 * 캐시 무효화
 */
export function invalidateCache(keyPattern?: string) {
  if (!keyPattern) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.includes(keyPattern)) {
      store.delete(key);
    }
  }
}

/**
 * 특정 키의 캐시 설정 (외부에서 직접 캐시 업데이트)
 */
export function setCache<T>(key: string, data: T) {
  store.set(key, { data, timestamp: Date.now(), isRefreshing: false });
}

// ── 내부 헬퍼 ──

async function refreshInBackground<T>(
  key: string,
  fetcher: () => Promise<T>,
  timeoutMs: number,
) {
  try {
    const data = await withTimeout(fetcher(), timeoutMs);
    store.set(key, { data, timestamp: Date.now(), isRefreshing: false });
  } catch {
    // 갱신 실패 → refreshing 플래그만 해제 (기존 stale 데이터 유지)
    const entry = store.get(key);
    if (entry) entry.isRefreshing = false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('cache-timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
