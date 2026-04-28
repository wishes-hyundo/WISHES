/**
 * useFormPersist — IndexedDB 기반 폼 자동 저장 hook
 * Tier 4 Phase 2 Step 1 (2026-04-28)
 *
 * 사장님이 매물 등록 폼 작성 중 페이지 닫아도 자동 저장 + 복원.
 * 비용 0원 (IndexedDB browser native).
 *
 * 사용:
 *   const { savedForm, clearSaved, lastSavedAt } = useFormPersist('listing-new', form);
 *
 *   useEffect(() => {
 *     if (savedForm) setForm(savedForm); // 페이지 로드 시 복원 1회
 *   }, [savedForm]);
 *
 *   form 변경 시 자동 IDB 저장 (debounce 500ms).
 *   사장님이 등록 완료하면 clearSaved() 호출.
 */
import { useEffect, useRef, useState } from 'react';

const DB_NAME = 'wishes-form-persist';
const DB_VERSION = 1;
const STORE = 'forms';

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        try {
          if (!req.result.objectStoreNames.contains(STORE)) {
            req.result.createObjectStore(STORE);
          }
        } catch { /* noop */ }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveToDB(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function loadFromDB<T>(key: string): Promise<T | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function deleteFromDB(key: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export interface FormPersistResult<T> {
  savedForm: T | null;
  loaded: boolean;
  lastSavedAt: number | null;
  clearSaved: () => Promise<void>;
}

export function useFormPersist<T>(
  key: string,
  form: T,
  options?: { debounceMs?: number; ttlMs?: number },
): FormPersistResult<T> {
  const debounceMs = options?.debounceMs ?? 500;
  const ttlMs = options?.ttlMs ?? 7 * 24 * 60 * 60 * 1000; // 7d default

  const [savedForm, setSavedForm] = useState<T | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  // 초기 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await loadFromDB<{ form: T; ts: number }>(key);
      if (cancelled) return;
      if (data && Date.now() - data.ts < ttlMs) {
        setSavedForm(data.form);
        setLastSavedAt(data.ts);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [key, ttlMs]);

  // form 변경 시 debounce 저장
  useEffect(() => {
    if (!loaded) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const ts = Date.now();
      saveToDB(key, { form, ts });
      setLastSavedAt(ts);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, form, loaded, debounceMs]);

  const clearSaved = async () => {
    await deleteFromDB(key);
    setSavedForm(null);
    setLastSavedAt(null);
  };

  return { savedForm, loaded, lastSavedAt, clearSaved };
}
