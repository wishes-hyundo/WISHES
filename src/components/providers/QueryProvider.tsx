// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QueryProvider — TanStack Query v5 + IndexedDB 영속화
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 목표: /map 에서 bounds·필터 변경 시 반복되는 동일 쿼리를 로컬 캐시에 박제.
//   - React Query v5 (suspense + 1세대 캐시 모델)
//   - IndexedDB persister → 새로고침 / 오프라인 시 캐시 복원
//   - 5분 gcTime + 30초 staleTime (지도 이동 시 즉시 캐시, 30초 지나면 재검증)
//
// ※ localStorage 는 사용 금지 (IndexedDB 가 용량·성능 모두 우세)

'use client';

import { ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';

// 경량 IndexedDB persister (browser only)
function createIdbPersister(dbName = 'wishes-query-cache') {
  if (typeof indexedDB === 'undefined') return null;
  const STORE = 'queries';
  const KEY = 'rq';

  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    persistClient: async (state: unknown) => {
      try {
        const db = await open();
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(state, KEY);
      } catch {
        /* noop */
      }
    },
    restoreClient: async () => {
      try {
        const db = await open();
        return await new Promise<unknown>((resolve) => {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(KEY);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        });
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        const db = await open();
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
      } catch {
        /* noop */
      }
    },
  };
}

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // 1회만 영속화 시도 (SSR 건너뜀)
  useState(() => {
    if (typeof window === 'undefined') return;
    const persister = createIdbPersister();
    if (!persister) return;
    persistQueryClient({
      // L-bob-phase1-fix (2026-04-27 v3): TanStack 의 nested query-core type 충돌 우회.
      //   react-query 와 react-query-persist-client 가 각자 자체 query-core 를 nest 해서 #private brand 비교 실패.
      //   root override @tanstack/query-core: 5.99.2 만으로는 부족 — 임시로 as unknown 캐스트.
      queryClient: client as unknown as Parameters<typeof persistQueryClient>[0]['queryClient'],
      // @ts-expect-error — 우리의 IDB persister 는 공식 Persister shape 와 구조 호환
      persister,
      maxAge: 1000 * 60 * 60 * 24, // 24h
      buster: 'wishes-v2',
    });
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
