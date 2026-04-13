// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 시드 데이터: 관악구 30+ 매물 + 설정 초기화
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
    status TEXT NOT NULL DEFAULT '공개' CHECK(status IN ('공개', '계약중', '계약완료')),
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

// ── 이미지 URL 풀 (다양한 부동산 이미지) ──
const imageUrls = {
  원룸: [
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1567521464027-f127ff144326?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1615873694918-cc1a3fa10c00?w=800&h=600&fit=crop',
  ],
  투룸: [
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop',
  ],
  쓰리룸: [
    'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop',
  ],
  오피스텔: [
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop',
  ],
  아파트: [
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop',
  ],
  상가: [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&h=600&fit=crop',
  ],
  사무실: [
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=600&fit=crop',
  ],
};

// ── 샘플 매물 데이터 (30+ 리스팅) ──
const sampleListings = [
  // 신림동 원룸 (월세)
  {
    title: '신림역 도보5분 풀옵션 원룸',
    type: '원룸', deal: '월세',
    deposit: 500, monthly: 45, price: null,
    area: 19.8, floor: '3/5층',
    address: '서울특별시 관악구 신림로 330', dong: '신림동',
    lat: 37.4841, lng: 126.9293,
    description: '신림역 도보 5분 거리의 깔끔한 풀옵션 원룸입니다.\n에어컨, 세탁기, 냉장고, 전자레인지 완비.\n남향으로 채광이 좋습니다.\n근처: 신림역(2호선), GS편의점, 카페거리',
    available: 1, availableDate: '즉시입주', built: '2019',
    parking: 0, elevator: 1, pet: 0, status: '공개',
    images: ['원룸', '원룸', '원룸']
  },
  {
    title: '신림동 맞춤형 원룸 - 월세',
    type: '원룸', deal: '월세',
    deposit: 300, monthly: 38, price: null,
    area: 17.5, floor: '2/3층',
    address: '서울특별시 관악구 신림로64길 45', dong: '신림동',
    lat: 37.4860, lng: 126.9275,
    description: '신림동 조용한 골목의 깔끔한 원룸입니다.\n새로 도배, 장판 완료.\n냉난방비 저렴, 인터넷 무료.\n근처: 신림중학교, 편의점 5개 이상',
    available: 1, availableDate: '2026-04-15', built: '2016',
    parking: 0, elevator: 0, pet: 0, status: '공개',
    images: ['원룸', '원룸', '원룸']
  },
  {
    title: '신림역 신축 원룸 오피스텔식',
    type: '원룸', deal: '월세',
    deposit: 800, monthly: 52, price: null,
    area: 21.3, floor: '7/12층',
    address: '서울특별시 관악구 신림로 180', dong: '신림동',
    lat: 37.4825, lng: 126.9260,
    description: '2023년 신축 원룸! 모던한 인테리어.\n에어컨, 세탁기, 드럼세탁기, 냉장고.\n스터디 카페, 경비실 24시간 운영.\n근처: 신림역, 카페, 편의점',
    available: 1, availableDate: '즉시입주', built: '2023',
    parking: 0, elevator: 1, pet: 0, status: '계약중',
    images: ['원룸', '원룸', '원룸']
  },
  {
    title: '신림동 전월세 가능 원룸',
    type: '원룸', deal: '월세',
    deposit: 600, monthly: 42, price: null,
    area: 18.9, floor: '4/6층',
    address: '서울특별시 관악구 신림로 220', dong: '신림동',
    lat: 37.4845, lng: 126.9290,
    description: '신림동 번화가 원룸 - 전월세 전환 가능.\n에어컨, 세탁기, 인덕션 완비.\n화장실 리모델링 완료.\n근처: 신림역, 학원가, 음식점거리',
    available: 1, availableDate: '즉시입주', built: '2017',
    parking: 0, elevator: 1, pet: 0, status: '공개',
    images: ['원룸', '원룸', '원룸']
  },

  // 봉천동 원룸 (월세)
  {
    title: '봉천동 신축 원룸 월세',
    type: '원룸', deal: '월세',
    deposit: 1000, monthly: 55, price: null,
    area: 23.1, floor: '5/7층',
    address: '서울특별시 관악구 은천로 200', dong: '봉천동',
    lat: 37.4790, lng: 126.9480,
    description: '2024년 신축 원룸! 풀옵션 + 빌트인 가구.\n냉난방 효율 좋은 신축 건물.\n관악구청역 도보 7분.\n근처: 관악구청역, 아모레퍼시픽, 편의점',
    available: 1, availableDate: '즉시입주', built: '2024',
    parking: 0, elevator: 1, pet: 0, status: '공개',
    images: ['원룸', '원룸', '원룸']
  },
  {
    title: '봉천동 넓은 원룸 - 실사용 25평',
    type: '원룸', deal: '월세',
    deposit: 700, monthly: 48, price: null,
    area: 25.5, floor: '3/5층',
    address: '서울특별시 관악구 봉천로 320', dong: '봉천동',
    lat: 37.4770, lng: 126.9510,
    description: '봉천동 대로변 넓은 원룸입니다.\n침실, 거실, 부엌 분리형.\n에어컨, 세탁기, 냉장고 완비.\n근처: 봉천역(9호선 예정), 버스정류장',
    available: 1, availableDate: '2026-04-20', built: '2018',
    parking: 0, elevator: 1, pet: 0, status: '공개',
    images: ['원룸', '원룸', '원룸']
  },
  {
    title: '봉천동 저가 원룸 월세',
    type: '원룸', deal: '월세',
    deposit: 200, monthly: 32, price: null,
    area: 15.8, floor: '1/3층',
    address: '서울특별시 관악구 은천로 150', dong: '봉천동',
    lat: 37.4800, lng: 126.9470,
    description: '봉천동 골목의 저가 원룸입니다.\n도배 새로 완료, 화장실 리모델링.\n에어컨, 세탁기 기본 구비.\n근처: 편의점, 버스정류장, 밥집거리',
    available: 1, availableDate: '즉시입주', built: '2015',
    parking: 0, elevator: 0, pet: 0, status: '공개',
    images: ['원룸', '원룸', '원룸']
  },

  // 투룸 (전세, 월세)
  {
    title: '봉천동 넓은 투룸 전세',
    type: '투룸', deal: '전세',
    deposit: 15000, monthly: null, price: null,
    area: 39.6, floor: '2/4층',
    address: '서울특별시 관악구 봉천로 456', dong: '봉천동',
    lat: 37.4780, lng: 126.9520,
    description: '봉천동 조용한 골목에 위치한 넓은 투룸입니다.\n분리형 구조로 방 2개 + 거실.\n도배, 장판 새로 완료.\n근처: 봉천중학교, 편의점, 공원',
    available: 1, availableDate: '2026-04-01', built: '2015',
    parking: 1, elevator: 0, pet: 1, status: '공개',
    images: ['투룸', '투룸', '투룸']
  },
  {
    title: '신림동 투룸 월세 - 반려동물 가능',
    type: '투룸', deal: '월세',
    deposit: 2000, monthly: 55, price: null,
    area: 36.4, floor: '3/5층',
    address: '서울특별시 관악구 신림로64길 80', dong: '신림동',
    lat: 37.4870, lng: 126.9285,
    description: '신림동 투룸 월세 - 반려동물 가능합니다.\n방 2개, 넓은 거실, 복층식.\n에어컨, 세탁기, 가스레인지 완비.\n근처: 신림역, 공원, 초등학교',
    available: 1, availableDate: '즉시입주', built: '2018',
    parking: 1, elevator: 1, pet: 1, status: '공개',
    images: ['투룸', '투룸', '투룸']
  },
  {
    title: '봉천동 투룸 전세 - 저금리',
    type: '투룸', deal: '전세',
    deposit: 13500, monthly: null, price: null,
    area: 37.2, floor: '4/6층',
    address: '서울특별시 관악구 봉천로 380', dong: '봉천동',
    lat: 37.4785, lng: 126.9535,
    description: '봉천동 투룸 전세 - 금리 협의 가능.\n방 2개 + 거실 + 주방 분리.\n현관 신발장, 침실 붙박이장.\n근처: 봉천역 예정지, 대형마트',
    available: 1, availableDate: '2026-05-15', built: '2014',
    parking: 1, elevator: 0, pet: 0, status: '공개',
    images: ['투룸', '투룸', '투룸']
  },

  // 쓰리룸 (전세, 월세)
  {
    title: '신림동 역세권 쓰리룸 전세',
    type: '쓰리룸', deal: '전세',
    deposit: 25000, monthly: null, price: null,
    area: 59.5, floor: '4/5층',
    address: '서울특별시 관악구 신림로64길 15', dong: '신림동',
    lat: 37.4855, lng: 126.9280,
    description: '신림역 도보 3분 역세권 넓은 쓰리룸입니다.\n방 3개 + 거실, 가족 거주에 적합.\n주차 가능, 엘리베이터 있음.\n근처: 신림역, 학교, 공원, 시장',
    available: 1, availableDate: '2026-05-01', built: '2012',
    parking: 1, elevator: 1, pet: 1, status: '공개',
    images: ['쓰리룸', '쓰리룸', '쓰리룸']
  },
  {
    title: '봉천동 패밀리 쓰리룸 월세',
    type: '쓰리룸', deal: '월세',
    deposit: 4000, monthly: 75, price: null,
    area: 62.3, floor: '2/4층',
    address: '서울특별시 관악구 봉천로 290', dong: '봉천동',
    lat: 37.4795, lng: 126.9505,
    description: '봉천동 패밀리 쓰리룸 월세입니다.\n방 3개, 넓은 거실 + 주방.\n세탁기, 에어컨 완비.\n근처: 초등학교, 유치원, 공원, 병원',
    available: 1, availableDate: '2026-04-10', built: '2016',
    parking: 1, elevator: 1, pet: 1, status: '계약중',
    images: ['쓰리룸', '쓰리룸', '쓰리룸']
  },
  {
    title: '신림동 대형 쓰리룸 - 방 3개 + 서재',
    type: '쓰리룸', deal: '월세',
    deposit: 5000, monthly: 80, price: null,
    area: 64.8, floor: '5/7층',
    address: '서울특별시 관악구 신림로 160', dong: '신림동',
    lat: 37.4835, lng: 126.9250,
    description: '신림동 대형 쓰리룸 - 방 3개 + 서재.\n거실 20평대, 주방 오픈형.\n엘리베이터, 주차 2대 가능.\n근처: 신림역, 학원가, 음식점',
    available: 1, availableDate: '즉시입주', built: '2017',
    parking: 1, elevator: 1, pet: 1, status: '공개',
    images: ['쓰리룸', '쓰리룸', '쓰리룸']
  },

  // 오피스텔 (매매, 월세, 전세)
  {
    title: '서울대입구역 오피스텔 매매',
    type: '오피스텔', deal: '매매',
    deposit: 0, monthly: null, price: 18000,
    area: 26.4, floor: '8/15층',
    address: '서울특별시 관악구 관악로 100', dong: '봉천동',
    lat: 37.4812, lng: 126.9527,
    description: '서울대입구역 초역세권 오피스텔입니다.\n풀옵션 완비, 투자 및 실거주 모두 적합.\n관리비 저렴, 월 수익성 좋음.\n근처: 서울대입구역, 상업지구, 카페거리',
    available: 1, availableDate: '협의', built: '2020',
    parking: 1, elevator: 1, pet: 0, status: '공개',
    images: ['오피스텔', '오피스텔', '오피스텔']
  },
  {
    title: '봉천동 오피스텔 월세 - 초역세권',
    type: '오피스텔', deal: '월세',
    deposit: 1500, monthly: 48, price: null,
    area: 23.8, floor: '12/20층',
    address: '서울특별시 관악구 봉천로 250', dong: '봉천동',
    lat: 37.4800, lng: 126.9540,
    description: '봉천역 초역세권 오피스텔 월세입니다.\n풀옵션, 엘리베이터, 24시간 경비.\n투자 및 실거주 모두 적합.\n근처: 봉천역 예정지, 편의점, 은행',
    available: 1, availableDate: '2026-04-01', built: '2021',
    parking: 1, elevator: 1, pet: 0, status: '공개',
    images: ['오피스텔', '오피스텔', '오피스텔']
  },
  {
    title: '신림동 오피스텔 전세',
    type: '오피스텔', deal: '전세',
    deposit: 8000, monthly: null, price: null,
    area: 21.5, floor: '6/10층',
    address: '서울특별시 관악구 신림로 150', dong: '신림동',
    lat: 37.4840, lng: 126.9270,
    description: '신림역 도보 7분 오피스텔 전세입니다.\n풀옵션, 엘리베이터, 주차 가능.\n관리비 저렴한 구축 건물.\n근처: 신림역, 학원, 카페, 음식점',
    available: 1, availableDate: '2026-05-01', built: '2014',
    parking: 1, elevator: 1, pet: 0, status: '공개',
    images: ['오피스텔', '오피스텔', '오피스텔']
  },
  {
    title: '관악구청역 오피스텔 매매',
    type: '오피스텔', deal: '매매',
    deposit: 0, monthly: null, price: 16500,
    area: 24.2, floor: '9/18층',
    address: '서울특별시 관악구 은천로 180', dong: '봉천동',
    lat: 37.4805, lng: 126.9465,
    description: '관악구청역 초역세권 오피스텔입니다.\n신축 수준 인테리어, 풀옵션.\n높은 수익률, 임차인 많음.\n근처: 관악구청역, 편의점, 병원',
    available: 1, availableDate: '협의', built: '2022',
    parking: 1, elevator: 1, pet: 0, status: '계약중',
    images: ['오피스텔', '오피스텔', '오피스텔']
  },

  // 아파트 (전세, 월세, 매매)
  {
    title: '관악구 아파트 전세',
    type: '아파트', deal: '전세',
    deposit: 35000, monthly: null, price: null,
    area: 84.9, floor: '12/20층',
    address: '서울특별시 관악구 남부순환로 1800', dong: '신림동',
    lat: 37.4870, lng: 126.9250,
    description: '관악구 대단지 아파트 전세입니다.\n방 3개, 넓은 거실, 조망 좋음.\n초등학교 도보 5분, 안전한 단지.\n근처: 신림역, 공원, 학교, 편의점',
    available: 1, availableDate: '2026-06-01', built: '2008',
    parking: 1, elevator: 1, pet: 1, status: '공개',
    images: ['아파트', '아파트', '아파트']
  },
  {
    title: '신림동 아파트 월세 - 재건축예정지',
    type: '아파트', deal: '월세',
    deposit: 2000, monthly: 60, price: null,
    area: 72.3, floor: '8/15층',
    address: '서울특별시 관악구 신림로64길 50', dong: '신림동',
    lat: 37.4865, lng: 126.9290,
    description: '신림동 아파트 월세 - 재건축 예정지.\n방 3개, 넓은 거실, 창고 있음.\n관리비 저렴, 엘리베이터 있음.\n근처: 신림역, 학교, 공원, 마트',
    available: 1, availableDate: '즉시입주', built: '2005',
    parking: 1, elevator: 1, pet: 1, status: '공개',
    images: ['아파트', '아파트', '아파트']
  },
  {
    title: '봉천동 신축 아파트 매매',
    type: '아파트', deal: '매매',
    deposit: 0, monthly: null, price: 85000,
    area: 99.2, floor: '15/25층',
    address: '서울특별시 관악구 은천로 300', dong: '봉천동',
    lat: 37.4795, lng: 126.9490,
    description: '봉천동 신축 아파트 매매입니다.\n방 4개, 넓은 거실, 현대식 인테리어.\n단지 편의시설 많음, 조망 우수.\n근처: 관악구청역, 상업지구, 병원',
    available: 1, availableDate: '협의', built: '2023',
    parking: 2, elevator: 1, pet: 1, status: '공개',
    images: ['아파트', '아파트', '아파트']
  },

  // 상가 (매매, 월세)
  {
    title: '신림동 상가 1층 매매',
    type: '상가', deal: '매매',
    deposit: 0, monthly: null, price: 45000,
    area: 49.5, floor: '1/3층',
    address: '서울특별시 관악구 신림로 250', dong: '신림동',
    lat: 37.4835, lng: 126.9310,
    description: '신림역 상권 중심부 1층 상가입니다.\n유동인구 多, 배달/포장 매장 적합.\n현재 임대 수익 월 200만원.\n근처: 신림역, 학원, 음식점거리',
    available: 1, availableDate: '협의', built: '2010',
    parking: 0, elevator: 0, pet: 0, status: '공개',
    images: ['상가', '상가', '상가']
  },
  {
    title: '신림동 상가 2층 월세',
    type: '상가', deal: '월세',
    deposit: 5000, monthly: 120, price: null,
    area: 42.8, floor: '2/3층',
    address: '서울특별시 관악구 신림로 280', dong: '신림동',
    lat: 37.4842, lng: 126.9320,
    description: '신림역 번화가 2층 상가입니다.\n학원, 의류, 카페 등 적합.\n주차 가능, 화장실 분리.\n근처: 신림역, 학원가, 음식점',
    available: 1, availableDate: '2026-04-15', built: '2012',
    parking: 0, elevator: 0, pet: 0, status: '공개',
    images: ['상가', '상가', '상가']
  },
  {
    title: '봉천동 상가 1층 - 유동인구 많음',
    type: '상가', deal: '매매',
    deposit: 0, monthly: null, price: 38000,
    area: 38.5, floor: '1/2층',
    address: '서울특별시 관악구 봉천로 320', dong: '봉천동',
    lat: 37.4770, lng: 126.9520,
    description: '봉천동 대로변 1층 상가 매매입니다.\n유동인구 많음, 임차인 풍부.\n현재 카페 운영 중, 월 임대료 180만원.\n근처: 봉천역 예정지, 버스정류장',
    available: 1, availableDate: '협의', built: '2015',
    parking: 0, elevator: 0, pet: 0, status: '공개',
    images: ['상가', '상가', '상가']
  },

  // 사무실 (월세, 전세)
  {
    title: '신림동 사무실 임대',
    type: '사무실', deal: '월세',
    deposit: 3000, monthly: 80, price: null,
    area: 66.0, floor: '6/10층',
    address: '서울특별시 관악구 신림로 280', dong: '신림동',
    lat: 37.4848, lng: 126.9300,
    description: '신림역 대로변 사무실 임대입니다.\n회의실 분리, 인터넷 완비.\n법인 사무실로 적합, 관리비 저렴.\n근처: 신림역, 학원, 은행, 음식점',
    available: 1, availableDate: '즉시입주', built: '2016',
    parking: 1, elevator: 1, pet: 0, status: '공개',
    images: ['사무실', '사무실', '사무실']
  },
  {
    title: '봉천동 사무실 - 개방형 레이아웃',
    type: '사무실', deal: '월세',
    deposit: 2500, monthly: 65, price: null,
    area: 55.3, floor: '4/8층',
    address: '서울특별시 관악구 봉천로 380', dong: '봉천동',
    lat: 37.4785, lng: 126.9535,
    description: '봉천동 사무실 - 개방형 레이아웃.\n자유로운 공간분할 가능.\n엘리베이터 있음, 화장실 깔끔.\n근처: 봉천역 예정지, 편의점, 병원',
    available: 1, availableDate: '2026-04-01', built: '2017',
    parking: 1, elevator: 1, pet: 0, status: '공개',
    images: ['사무실', '사무실', '사무실']
  },
  {
    title: '신림동 소규모 사무실',
    type: '사무실', deal: '월세',
    deposit: 1500, monthly: 45, price: null,
    area: 33.0, floor: '3/6층',
    address: '서울특별시 관악구 신림로 200', dong: '신림동',
    lat: 37.4835, lng: 126.9280,
    description: '신림역 근처 소규모 사무실입니다.\n스타트업, 프리랜서 적합.\n인터넷, 에어컨 완비.\n근처: 신림역, 카페, 음식점',
    available: 1, availableDate: '즉시입주', built: '2014',
    parking: 0, elevator: 0, pet: 0, status: '계약중',
    images: ['사무실', '사무실', '사무실']
  },

  // 추가 다양한 물건들
  {
    title: '신림동 원룸 - 저가 전세',
    type: '원룸', deal: '전세',
    deposit: 5000, monthly: null, price: null,
    area: 19.5, floor: '2/3층',
    address: '서울특별시 관악구 신림로64길 30', dong: '신림동',
    lat: 37.4855, lng: 126.9270,
    description: '신림동 원룸 전세입니다.\n새 도배, 장판 완료.\n에어컨, 세탁기 기본 구비.\n근처: 신림역, 편의점, 이용원',
    available: 1, availableDate: '2026-04-20', built: '2013',
    parking: 0, elevator: 0, pet: 0, status: '공개',
    images: ['원룸', '원룸', '원룸']
  },
  {
    title: '봉천동 투룸 월세 - 조용함',
    type: '투룸', deal: '월세',
    deposit: 1500, monthly: 50, price: null,
    area: 35.4, floor: '3/4층',
    address: '서울특별시 관악구 봉천로 400', dong: '봉천동',
    lat: 37.4775, lng: 126.9515,
    description: '봉천동 조용한 주택가 투룸입니다.\n방 2개 + 거실, 분리형 주방.\n세탁기, 에어컨 완비.\n근처: 공원, 초등학교, 편의점',
    available: 1, availableDate: '즉시입주', built: '2016',
    parking: 1, elevator: 0, pet: 1, status: '공개',
    images: ['투룸', '투룸', '투룸']
  },
  {
    title: '신림동 오피스텔 월세',
    type: '오피스텔', deal: '월세',
    deposit: 1000, monthly: 42, price: null,
    area: 20.5, floor: '7/15층',
    address: '서울특별시 관악구 신림로 140', dong: '신림동',
    lat: 37.4835, lng: 126.9255,
    description: '신림역 근처 오피스텔 월세입니다.\n풀옵션, 엘리베이터, 주차 가능.\n관리비 저렴, 투자 적합.\n근처: 신림역, 학원, 카페',
    available: 1, availableDate: '2026-04-30', built: '2018',
    parking: 1, elevator: 1, pet: 0, status: '공개',
    images: ['오피스텔', '오피스텔', '오피스텔']
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

  // 이미지 삽입 (2-3개)
  const imageTypeKey = listing.images[0];
  const urls = imageUrls[imageTypeKey as keyof typeof imageUrls] || imageUrls.원룸;
  const selectedImages = urls.slice(0, 3);

  for (let i = 0; i < selectedImages.length; i++) {
    sqlite.prepare(`
      INSERT INTO listing_images (listing_id, url, alt, "order", created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(listingId, selectedImages[i], `${listing.title} - 사진 ${i + 1}`, i, now);
  }

  // 특징 삽입
  const features: string[] = [];
  if (listing.type === '원룸' || listing.type === '투룸' || listing.type === '쓰리룸') {
    features.push('에어컨', '세탁기', '냉장고');
    if (listing.type !== '원룸') {
      features.push('가스레인지', '신발장');
    }
  } else if (listing.type === '오피스텔' || listing.type === '아파트') {
    features.push('에어컨', '세탁기', '냉장고', '풀옵션');
  } else if (listing.type === '상가' || listing.type === '사무실') {
    features.push('인터넷', '에어컨', '화장실');
  }

  for (const feature of features) {
    sqlite.prepare('INSERT INTO listing_features (listing_id, feature) VALUES (?, ?)').run(listingId, feature);
  }
}

// 사이트 설정 초기화
const settings = [
  { key: 'company_name', value: '주식회사 위시스부동산중개법인' },
  { key: 'company_phone', value: '1533-9580' },
  { key: 'company_email', value: 'wishes@wishes.co.kr' },
  { key: 'company_mobile', value: '010-1234-5678' },
  { key: 'kakao_channel', value: 'https://pf.kakao.com/_xnxaxjxj' },
  { key: 'company_address', value: '서울특별시 관악구 신림로64길 23, 8층(신림동)' },
  { key: 'business_license', value: '110-81-123456' },
  { key: 'representative_name', value: '임대인' },
  { key: 'office_hours', value: '월-금 09:00-18:00, 토 10:00-16:00 (일요일 휴무)' },
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
