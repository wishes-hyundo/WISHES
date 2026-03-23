// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB 연결 추상화
// 이 파일 하나만 수정하면 DB 엔진 교체 완료!
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import * as schema from './schema';

// ─── STEP 0: SQLite (로컬 개발) ───
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('./data/wishes.db');
export const db = drizzle(sqlite, { schema });

// ─── STEP 1: Supabase PostgreSQL (프로덕션) ───
// 아래 주석을 해제하고 위 SQLite 코드를 주석 처리
//
// import { drizzle } from 'drizzle-orm/postgres-js';
// import postgres from 'postgres';
//
// const client = postgres(process.env.DATABASE_URL!);
// export const db = drizzle(client, { schema });

export type DB = typeof db;
