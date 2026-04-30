// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PR-FIX: Supabase Database type stub (라이브 main 안정화)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 사장님 commit 99feedd "fix(types+deps): supabase types stub" 시도가
// working copy 에서 손실된 상태. PR-FIX 로 generic stub 보강.
//
// 임시 형식 — type 안전성 X, 빌드 통과 우선.
// 정식 generated types 는 `npm run db:generate` 후 자동 생성 (별도 PR).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/* eslint-disable */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      [key: string]: {
        Row: any;
        Insert: any;
        Update: any;
        Relationships: [];
      };
    };
    Views: {
      [key: string]: { Row: any };
    };
    Functions: {
      [key: string]: { Args: any; Returns: any };
    };
    Enums: {
      [key: string]: string;
    };
  };
};
