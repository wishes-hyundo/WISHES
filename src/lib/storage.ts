// Image storage abstraction layer
// Cloudflare R2 (S3 compatible) based

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Storage interface
export interface StorageAdapter {
  upload(buffer: Buffer, filePath: string, contentType?: string): Promise<string>;
  delete(filePath: string): Promise<void>;
  getUrl(filePath: string): string;
}

// R2 client singleton
let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return r2Client;
}

// Cloudflare R2 Storage
class R2Storage implements StorageAdapter {
  private bucketName = process.env.R2_BUCKET_NAME || 'wishes-listings';
  private publicUrl = process.env.R2_PUBLIC_URL || 'https://pub-e16c7a50584c4db7be3571746cd80716.r2.dev';

  async upload(buffer: Buffer, filePath: string, contentType?: string): Promise<string> {
    const client = getR2Client();

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: filePath,
        Body: buffer,
        ContentType: contentType || 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    return this.getUrl(filePath);
  }

  async delete(filePath: string): Promise<void> {
    const client = getR2Client();

    await client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: filePath,
      })
    );
  }

  getUrl(filePath: string): string {
    return `${this.publicUrl}/${filePath}`;
  }
}

// Local file storage (fallback)
class LocalStorage implements StorageAdapter {
  async upload(buffer: Buffer, filePath: string): Promise<string> {
    const { writeFile, mkdir } = await import('fs/promises');
    const path = await import('path');
    const basePath = path.join(process.cwd(), 'public', 'images');
    const fullPath = path.join(basePath, filePath);
    const dir = path.dirname(fullPath);
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, buffer);
    return this.getUrl(filePath);
  }

  async delete(filePath: string): Promise<void> {
    const { unlink } = await import('fs/promises');
    const path = await import('path');
    const basePath = path.join(process.cwd(), 'public', 'images');
    const fullPath = path.join(basePath, filePath);
    try {
      await unlink(fullPath);
    } catch {
      // File doesn't exist
    }
  }

  getUrl(filePath: string): string {
    return `/images/${filePath}`;
  }
}

// Environment-based storage switch (default: R2)
export const storage: StorageAdapter =
  process.env.STORAGE_TYPE === 'local'
    ? new LocalStorage()
    : new R2Storage();
