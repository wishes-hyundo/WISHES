// DB connection abstraction
// This file handles SQLite for local dev and Vercel deployment
import * as schema from './schema';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

// Vercel uses read-only filesystem, only /tmp is writable
const isVercel = !!process.env.VERCEL;
const DB_PATH = isVercel
  ? '/tmp/wishes.db'
  : resolve(process.cwd(), 'data', 'wishes.db');

const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

let sqlite: InstanceType<typeof Database>;
let _db: ReturnType<typeof drizzle<typeof schema>>;

try {
  sqlite = new Database(DB_PATH);
  _db = drizzle(sqlite, { schema });

  // Auto-create tables if they don't exist (fresh DB on Vercel /tmp)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      property_type TEXT NOT NULL DEFAULT 'apartment',
      deal_type TEXT NOT NULL DEFAULT 'monthly',
      price_main INTEGER,
      price_deposit INTEGER,
      price_monthly INTEGER,
      area_m2 REAL,
      area_pyeong REAL,
      floor TEXT,
      total_floors INTEGER,
      address TEXT NOT NULL,
      address_detail TEXT,
      latitude REAL,
      longitude REAL,
      status TEXT NOT NULL DEFAULT 'active',
      featured INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      thumbnail TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS listing_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      alt TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (listing_id) REFERENCES listings(id)
    );
    CREATE TABLE IF NOT EXISTS listing_features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      feature TEXT NOT NULL,
      FOREIGN KEY (listing_id) REFERENCES listings(id)
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      listing_id INTEGER,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (listing_id) REFERENCES listings(id)
    );
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
} catch (e) {
  console.error('DB initialization error:', e);
  // Fallback: create in-memory database
  sqlite = new Database(':memory:');
  _db = drizzle(sqlite, { schema });
}

export const db = _db;
export type DB = typeof db;
