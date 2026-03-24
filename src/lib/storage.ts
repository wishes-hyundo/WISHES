import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';

export interface StorageAdapter {
  upload(buffer: Buffer, filePath: string): Promise<string>;
  delete(filePath: string): Promise<void>;
  getUrl(filePath: string): string;
}

class LocalStorage implements StorageAdapter {
  private basePath = path.join(process.cwd(), 'public', 'images');
  async upload(buffer: Buffer, filePath: string): Promise<string> {
    const fullPath = path.join(this.basePath, filePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    return this.getUrl(filePath);
  }
  async delete(filePath: string): Promise<void> {
    try { await unlink(path.join(this.basePath, filePath)); } catch {}
  }
  getUrl(filePath: string): string { return `/images/${filePath}`; }
}

class R2Storage implements StorageAdapter {
  async upload(buffer: Buffer, filePath: string): Promise<string> { return this.getUrl(filePath); }
  async delete(filePath: string): Promise<void> {}
  getUrl(filePath: string): string { return `${process.env.R2_PUBLIC_URL || 'https://images.wishes.co.kr'}/${filePath}`; }
}

export const storage: StorageAdapter = process.env.STORAGE_TYPE === 'r2' ? new R2Storage() : new LocalStorage();
