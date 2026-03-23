// DB connection - handles both local dev and Vercel deployment
import * as schema from './schema';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { seedListings } from './seed-data';

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

  // Auto-create tables if fresh DB (Vercel /tmp is ephemeral)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '원룸',
      deal TEXT NOT NULL DEFAULT '월세',
      deposit INTEGER NOT NULL DEFAULT 0,
      monthly INTEGER,
      price INTEGER,
      area REAL NOT NULL,
      floor TEXT NOT NULL,
      address TEXT NOT NULL,
      dong TEXT NOT NULL,
      lat REAL,
      lng REAL,
      description TEXT,
      available INTEGER DEFAULT 1,
      available_date TEXT,
      built TEXT,
      parking INTEGER DEFAULT 0,
      elevator INTEGER DEFAULT 0,
      pet INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT '가용',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS listing_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      alt TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS listing_features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      feature TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      message TEXT,
      listing_id INTEGER REFERENCES listings(id),
      status TEXT NOT NULL DEFAULT '접수',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Auto-seed if listings table is empty (Vercel cold start)
  const countResult = sqlite.prepare('SELECT COUNT(*) as cnt FROM listings').get() as { cnt: number };
  if (countResult.cnt === 0 && seedListings.length > 0) {
    console.log('DB is empty, auto-seeding ' + seedListings.length + ' listings...');
    
    const insertListing = sqlite.prepare(`
      INSERT INTO listings (title, type, deal, deposit, monthly, price, area, floor, address, dong, description, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '가용')
    `);
    
    const insertImage = sqlite.prepare(`
      INSERT INTO listing_images (listing_id, url, alt, "order")
      VALUES (?, ?, ?, 0)
    `);

    const seedAll = sqlite.transaction(() => {
      for (const item of seedListings) {
        const title = item.type + ' ' + item.deal + ' ' + item.dong;
        const result = insertListing.run(
          title,
          item.type,
          item.deal,
          item.deposit,
          item.monthly || null,
          item.price || null,
          item.area,
          item.floor,
          item.address,
          item.dong,
          item.description
        );
        
        if (item.image) {
          insertImage.run(result.lastInsertRowid, item.image, title);
        }
      }
    });
    
    seedAll();
    console.log('Auto-seed complete: ' + seedListings.length + ' listings inserted');
  }
} catch (e) {
  console.error('DB init error:', e);
  sqlite = new Database(':memory:');
  _db = drizzle(sqlite, { schema });
}

export const db = _db;
export type DB = typeof db;
