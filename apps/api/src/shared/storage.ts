import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { supabase } from './supabase';

export interface StorageAdapter {
  save(filePath: string, data: Buffer, mimeType: string): Promise<string>;
  get(fileKey: string): Promise<Buffer>;
  delete(fileKey: string): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;

  constructor() {
    // Base directory is apps/web/private/
    this.baseDir = path.resolve(process.cwd(), '../web/private');
  }

  async save(filePath: string, data: Buffer, _mimeType: string): Promise<string> {
    const fullPath = path.join(this.baseDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
    return filePath;
  }

  async get(fileKey: string): Promise<Buffer> {
    const fullPath = path.join(this.baseDir, fileKey);
    return await fs.readFile(fullPath);
  }

  async delete(fileKey: string): Promise<void> {
    const fullPath = path.join(this.baseDir, fileKey);
    await fs.unlink(fullPath);
  }
}


export class SupabaseStorageAdapter implements StorageAdapter {
  private bucket: string;

  constructor() {
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'legacybridge-storage';
  }

  private async ensureBucket() {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) throw listError;

    if (!buckets.find(b => b.name === this.bucket)) {
      const { error: createError } = await supabase.storage.createBucket(this.bucket, {
        public: false,
        fileSizeLimit: 52428800, // 50MB
      });
      if (createError) throw createError;
    }
  }

  async save(filePath: string, data: Buffer, mimeType: string): Promise<string> {
    await this.ensureBucket();
    const { data: uploadData, error } = await supabase.storage
      .from(this.bucket)
      .upload(filePath, data, {
        contentType: mimeType,
        upsert: true
      });

    if (error) {
      throw new Error(`Supabase Storage Save Error: ${error.message}`);
    }

    return uploadData.path;
  }

  async get(fileKey: string): Promise<Buffer> {
    await this.ensureBucket();
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .download(fileKey);

    if (error) {
      throw new Error(`Supabase Storage Get Error: ${error.message}`);
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(fileKey: string): Promise<void> {
    await this.ensureBucket();
    const { error } = await supabase.storage
      .from(this.bucket)
      .remove([fileKey]);

    if (error) {
      throw new Error(`Supabase Storage Delete Error: ${error.message}`);
    }
  }
}

// AWS S3. Requires env: S3_BUCKET, AWS_REGION, and credentials
// (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY — read automatically by the SDK).
export class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || 'legacybridge-storage';
    this.client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  }

  async save(filePath: string, data: Buffer, mimeType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: filePath, Body: data, ContentType: mimeType })
    );
    return filePath;
  }

  async get(fileKey: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: fileKey }));
    const bytes = await (res.Body as any).transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(fileKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: fileKey }));
  }
}

export function getStorageAdapter(): StorageAdapter {
  const provider = process.env.STORAGE_PROVIDER || 'local';
  if (provider === 's3' || provider === 'aws') {
    return new S3StorageAdapter();
  }
  if (provider === 'supabase') {
    return new SupabaseStorageAdapter();
  }
  return new LocalStorageAdapter();
}
