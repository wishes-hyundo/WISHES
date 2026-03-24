// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 이미지 스토리지 추상화 레이어
// STEP 0: 로컬 파일시스템
// STEP 1: Cloudflare R2
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';

// 스토리지 인터페이스
export interface StorageAdapter {
  upload(buffer: Buffer, filePath: string): Promise<string>;
  delete(filePath: string): Promise<void>;
  getUrl(filePath: string): string;
}

// ─── STEP 0: 로컬 파일 저장 ───
class LocalStorage implements StorageAdapter {
  private basePath = path.join(process.cwd(), 'public', 'images');

  async upload(buffer: Buffer, filePath: string): Promise<string> {
    const fullPath = path.join(this.basePath, filePath);
    const dir = path.dirname(fullPath);
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, buffer);
    return this.getUrl(filePath);
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, filePath);
    try {
      await unlink(fullPath);
    } catch {
      // 파일이 없으면 쬴시
    }
  }

  getUrl(filePath: string): string {
    return `/images/${filePath}`;
  }
}

// ─── STEP 1: Cloudflare R2 ───
class R2Storage implements StorageAdapter {
  // S3 호환 SDK 사용
  // import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
  //
  // private client = new S3Client({
  //   region: 'auto',
  //   endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  //   credentials: {
  //     accessKeyId: process.env.R2_ACCESS_KEY_ID,
  //     secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  //   },
  // });

  async upload(buffer: Buffer, filePath: string): Promise<string> {
    // STEP 1: 에서 구현
    // await this.client.send(new PutObjectCommand({
    //   Bucket: process.env.R2_BUCKET_NAME!,
    //   Key: filePath,
    //   Body: buffer,
    //   ContentType: 'image/webp',
    // }));
    return this.getUrl(filePath);
  }

  async delete(filePath: string): Promise<void> {
    // STEP 2: w��서 구현
    // await this.client.send(new DeleteObjectCommand({
    //   Bucket: process.env.R2_BUCKET_NAME!,
    //   Key: filePath,
    // }));
  }

  getUrl(filePath: string): string {
    return `${process.env.R2_PUBLIC_URL || 'https://images.wishes.co.kr'}/${filePath}`;
  }
}

// 환경변수로 스토리지 전환
export const storage: StorageAdapter =
  process.env.STORAGE_TYPE === 'r2'
    ? new R2Storage()
    : new LocalStorage();
