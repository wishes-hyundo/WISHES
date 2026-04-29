import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',

  // ─── STEP 0: SQLite (로컬 개발) ───
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/wishes.db',
  },

  // ─── STEP 1: Supabase PostgreSQL (프로덕션) ───
  // dialect: 'postgresql',
  // dbCredentials: {
  //   url: process.env.DATABASE_URL!,
  // },
});
