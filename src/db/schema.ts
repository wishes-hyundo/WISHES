// Drizzle ORM 스키마 정의
// STEP 0: SQLite (로컬 개발)
// STEP 1: sqliteTable -> pgTable 로 교체

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// 매물 테이블
export const listings = sqliteTable('listings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  type: text('type', {
    enum: ['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'],
  }).notNull(),
  deal: text('deal', {
    enum: ['전세', '월세', '매매'],
  }).notNull(),
  deposit: integer('deposit').notNull().default(0),
  monthly: integer('monthly'),
  price: integer('price'),
  area: real('area').notNull(),
  floor: text('floor').notNull(),
  address: text('address').notNull(),
  dong: text('dong').notNull(),
  lat: real('lat'),
  lng: real('lng'),
  description: text('description'),
  available: integer('available', { mode: 'boolean' }).default(true),
  availableDate: text('available_date'),
  built: text('built'),
  parking: integer('parking', { mode: 'boolean' }).default(false),
  elevator: integer('elevator', { mode: 'boolean' }).default(false),
  pet: integer('pet', { mode: 'boolean' }).default(false),
  status: text('status', {
    enum: ['가용', '계약중', '계약완료'],
  }).notNull().default('가용'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// 매물 이미지 테이블
export const listingImages = sqliteTable('listing_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  listingId: integer('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  alt: text('alt'),
  order: integer('order').notNull().default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// 매물 옵션/특징 테이블
export const listingFeatures = sqliteTable('listing_features', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  listingId: integer('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
  feature: text('feature').notNull(),
});

// 상담 문의 테이블
export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  message: text('message'),
  listingId: integer('listing_id').references(() => listings.id),
  status: text('status', {
    enum: ['접수', '처리중', '완료'],
  }).notNull().default('접수'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// 사이트 설정 테이블
export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});
