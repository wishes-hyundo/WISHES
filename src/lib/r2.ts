// src/lib/r2.ts
// v2.3.11 — S3Client 에 checksum 옵션 WHEN_REQUIRED 로 고정.
//           AWS SDK v3 최신 기본값(WHEN_SUPPORTED)이 presigned URL 에
//           x-amz-checksum-crc32 / x-amz-sdk-checksum-algorithm 를 자동 추가해서
//           모바일 브라우저 PUT 이 CORS/네트워크 오류로 실패하는 문제를 해결.
//
// 변경점:
//   (기존) r2Client, R2_BUCKET, R2_PUBLIC_URL, uploadToR2, deleteFromR2  → 그대로
//   (추가) getPresignedPutUrl, getPublicUrl
//
// 호환성: 기존 라우트(videos/route.ts의 POST multipart 업로드)는 전혀 영향 없음.

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || '',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  // v2.3.11: presigned URL 에 checksum 자동 추가 방지 (모바일 PUT 호환성)
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export const R2_BUCKET = 'wishes-listings';
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

// Site base URL for image/video proxy
// L-www-fix (2026-04-24): 환경변수가 'https://www.wishes.co.kr' 로 세팅된 경우
//   Vercel 이 apex 로 307 redirect 해서 브라우저 Image() 가 CORS+redirect 이중
//   처리에서 'Failed to fetch' 로 터짐. DB 에 박힌 URL 자체를 apex 로 고정한다.
const _RAW_SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';
const SITE_URL = _RAW_SITE.replace('://www.', '://');

// ─────────────────────────────────────────────────────────────
// 기존 함수 (건드리지 않음)
// ─────────────────────────────────────────────────────────────

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await r2Client.send(command);
  // Return proxy URL instead of direct R2 URL
  return SITE_URL + '/api/images/' + key;
}

export async function deleteFromR2(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  await r2Client.send(command);
}

// ─────────────────────────────────────────────────────────────
// v2.3.8 추가: 클라이언트 → R2 직업로드용 Presigned PUT URL
// ─────────────────────────────────────────────────────────────

/**
 * 클라이언트 브라우저가 R2 로 PUT 업로드할 수 있는 서명된 URL 발급.
 * @param key         R2 객체 키 (예: listings/123/videos/1713588800000-abc12345.mp4)
 * @param contentType 업로드 파일 MIME (반드시 클라이언트 PUT 의 Content-Type 과 일치)
 * @param expiresIn   URL 유효시간(초). 기본 600초(10분).
 */
export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn: number = 600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return await getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * DB 에 저장할 공개 URL 문자열. 기존 uploadToR2 와 동일한 프록시 경로.
 * listing_videos.url 컬럼에 들어갈 값을 계산할 때 사용.
 */
export function getPublicUrl(key: string): string {
  return SITE_URL + '/api/images/' + key;
}
