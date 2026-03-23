// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 시드 데이터: 샘플 매물 + 설정 초기화
// 실행: pnpm db:seed (또는 npx tsx scripts/seed.ts)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/db/schema';
import { existsSync, mkdirSync } from 'fs';

// data 폴더 생성
if (!existsSync('./data')) {
  mkdirSync('./data', { recursive: true });
}

const sqlite = new Database('./data/wishes.db');
const db = drizzle(sqlite, { schema });

// 테이블 생성 (마이그레이션 대신 직접 생성)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실')),
    deal TEXT NOT NULL CHECK(deal IN ('전세', '월세', '매매')),
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
    status TEXT NOT NULL DEFAULT '가용' CHECK(status IN ('가용', '계약중', '계약완료')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS listing_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
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
    status TEXT NOT NULL DEFAULT '접수' CHECK(status IN ('접수', '처리중', '완료')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// 기존 데이터 삭제
sqlite.exec('DELETE FROM listing_features');
sqlite.exec('DELETE FROM listing_images');
sqlite.exec('DELETE FROM contacts');
sqlite.exec('DELETE FROM listings');

const now = new Date().toISOString();

// ── 샘플 매물 데이터 ──
const sampleListings = [
  {
    title: '신림역 도보5분 풀옵션 원룸',
    type: '원룸', deal: '월세',
    deposit: 500, monthly: 45, price: null,
    area: 19.8, floor: '3/5층',
    address: '서울특별시 관악구 신림로 330', dong: '신림동',
    lat: 37.4841, lng: 126.9293,
    description: '신림역 도보 5분 거리의 깔끔한 풀옵션 원룸입니다.\n에어컨, 세탁기, 냉장고, 전자레인지 완비.\n남향으로 채광이 좋습니다.',
    available: 1, availableDate: '즉시입주', built: '2019',
    parking: 0, elevator: 1, pet: 0, status: '가용',
  },
  {
    title: '봉천동 넓은 투룸 전세',
    type: '투룸', deal: '전세',
    deposit: 15000, monthly: null, price: null,
    area: 39.6, floor: '2/4층',
    address: '서울특별시 관악구 봉천로 456', dong: '봉천동',
    lat: 37.4780, lng: 126.9520,
    description: '봉천동 조용한 골목에 위치한 넓은 투룸입니다.\n분리형 구조로 방 2개 + 거실.\n도배, 장판 새로 완료.',
    available: 1, availableDate: '2026-04-01', built: '2015',
    parking: 1, elevator: 0, pet: 1, status: '가용',
  },
  {
    title: '서울대입구역 오피스텔 매매',
    type: '오피스텔', deal: '매매',
    deposit: 0, monthly: null, price: 18000,
    area: 26.4, floor: '8/15층',
    address: '서울특별시 관악구 관악로 100', dong: '봉천동',
    lat: 37.4812, lng: 126.9527,
    description: '서울대입구역 초역세권 오피스텔입니다.\n풀옵션 완비, 투자 및 실거주 모두 적합.\n관리비 저렴.',
    available: 1, availableDate: '협의', built: '2020',
    parking: 1, elevator: 1, pet: 0, status: '가용',
  },
  {
    title: '신림동 역세권 쓰리룸 전세',
    type: '쓰리룸', deal: '전세',
    deposit: 25000, monthly: null, price: null,
    area: 59.5, floor: '4/5층',
    address: '서울특별시 관악구 신림로64길 15', dong: '신림동',
    lat: 37.4855, lng: 126.9280,
    description: '신림역 도보 3분 역세권 넓은 쓰리룸입니다.\n방 3개 + 거실, 가족 거주에 적합.\n주차 가능.',
    available: 1, availableDate: '2026-05-01', built: '2012',
    parking: 1, elevator: 1, pet: 1, status: '가용',
  },
  {
    title: '봉천동 신축 원룸 월세',
    type: '원룸', deal: '월세',
    deposit: 1000, monthly: 55, price: null,
    area: 23.1, floor: '5/7층',
    address: '서울특별시 관악구 은천로 200', dong: '봉천동',
    lat: 37.4790, lng: 126.9480,
    description: '2024년 신축 원룸! 풀옵션 + 빌트인 가구.\n냉난방 효율 좋은 신축 건물.\n관악구청역 도보 7분.',
    available: 1, availableDate: '즉시입주', built: '2024',
    parking: 0, elevator: 1, pet: 0, status: '가용',
  },
  {
    title: '신림동 상가 1층 매매',
    type: '상가', deal: '매매',
    deposit: 0, monthly: null, price: 45000,
    area: 49.5, floor: '1/3층',
    address: '서울특별시 관악구 신림로 250', dong: '신림동',
    lat: 37.4835, lng: 126.9310,
    description: '신림역 상권 중심부 1층 상가입니다.\n유동인구 多, 배달/포장 매장 적합.\n현재 임대 수익 월 200만원.',
    available: 1, availableDate: '협의', built: '2010',
    parking: 0, elevator: 0, pet: 0, status: '가용',
  },
  {
    title: '관악구 아파트 전세',
    type: '아파트', deal: '전세',
    deposit: 35000, monthly: null, price: null,
    area: 84.9, floor: '12/20층',
    address: '서울특별시 관악구 남부순환로 1800', dong: '신림동',
    lat: 37.4870, lng: 126.9250,
    description: '관악구 대단지 아파트 전세입니다.\n방 3개, 넓은 거실, 조망 좋음.\n초등학교 도보 5분.',
    available: 1, availableDate: '2026-06-01', built: '2008',
    parking: 1, elevator: 1, pet: 1, status: '가용',
  },
  {
    title: '신림동 사무실 임대',
    type: '사무실', deal: '월세',
    deposit: 3000, monthly: 80, price: null,
    area: 66.0, floor: '6/10층',
    address: '서울특별시 관악구 신림로 280', dong: '신림동',
    lat: 37.4848, lng: 126.9300,
    description: '신림역 대로변 사무실 임대입니다.\n회의실 분리, 인터넷 완비.\n법인 사무실로 적합.',
    available: 1, availableDate: '즉시입주', built: '2016',
    parking: 1, elevator: 1, pet: 0, status: '가용',
  },
];

// 매물 삽입
for (const listing of sampleListings) {
  const stmt = sqlite.prepare(`
    INSERT INTO listings (title, type, deal, deposit, monthly, price, area, floor, address, dong, lat, lng, description, available, available_date, built, parking, elevator, pet, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    listing.title, listing.type, listing.deal,
    listing.deposit, listing.monthly, listing.price,
    listing.area, listing.floor,
    listing.address, listing.dong, listing.lat, listing.lng,
    listing.description, listing.available, listing.availableDate,
    listing.built, listing.parking ? 1 : 0, listing.elevator ? 1 : 0, listing.pet ? 1 : 0,
    listing.status, now, now
  );

  const listingId = result.lastInsertRowid;

  // 특징 삽입
  const features = ['에어컨', '세탁기', '냉장고'];
  if (listing.type === '원룸') features.push('전자레인지', '인덕션');
  if (listing.type === '투룸' || listing.type === '쓰리룸') features.push('가스레인지', '신발장');

  for (const feature of features) {
    sqlite.prepare('INSERT INTO listing_features (listing_id, feature) VALUES (?, ?)').run(listingId, feature);
  }
}

// 사이트 설정 초기화
const settings = [
  { key: 'company_name', value: '주식회사 위시스부동산중개법인' },
  { key: 'company_phone', value: '1533-9580' },
  { key: 'company_email', value: 'wishes@wishes.co.kr' },
  { key: 'kakao_channel', value: 'https://pf.kakao.com/_xnxaxjxj' },
  { key: 'company_address', value: '서울특별시 관악구 신림로64길 23, 8층(신림동)' },
];

for (const setting of settings) {
  sqlite.prepare('INSERT OR REPLACE INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
    setting.key, setting.value, now
  );
}

console.log('✅ 시드 데이터 입력 완료!');
console.log(`   - 매물 ${sampleListings.length}건`);
console.log(`   - 사이트 설정 ${settings.length}건`);
console.log('   - DB 위치: ./data/wishes.db');

sqlite.close();
