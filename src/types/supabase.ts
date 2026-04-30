/**
 * 임시 stub 타입 — 정확한 타입은 Supabase CLI 로 재생성 권장:
 *   npx supabase gen types typescript --project-id xbjgdsyukjdkfvcbzmjc > src/types/supabase.ts
 *
 * 작성: 2026-04-29 wishes-v2 → wishes-fresh 이전 빌드 복구용
 * 다음 세션 PR-A (SSOT registry v0.1) 에서 정확한 타입으로 교체.
 */

type AnyTable = { Row: any; Insert: any; Update: any; Relationships: any[] };

export type Database = {
  public: {
    Tables: Record<string, AnyTable>;
    Views: Record<string, { Row: any }>;
    Functions: Record<string, any>;
    Enums: Record<string, any>;
    CompositeTypes: Record<string, any>;
  };
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
