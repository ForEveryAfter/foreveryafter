"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseStorageAdapter = exports.LocalStorageAdapter = void 0;
exports.getStorageAdapter = getStorageAdapter;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const supabase_1 = require("./supabase");
class LocalStorageAdapter {
    baseDir;
    constructor() {
        // Base directory is apps/web/private/
        this.baseDir = path_1.default.resolve(process.cwd(), '../web/private');
    }
    async save(filePath, data, _mimeType) {
        const fullPath = path_1.default.join(this.baseDir, filePath);
        await promises_1.default.mkdir(path_1.default.dirname(fullPath), { recursive: true });
        await promises_1.default.writeFile(fullPath, data);
        return filePath;
    }
    async get(fileKey) {
        const fullPath = path_1.default.join(this.baseDir, fileKey);
        return await promises_1.default.readFile(fullPath);
    }
    async delete(fileKey) {
        const fullPath = path_1.default.join(this.baseDir, fileKey);
        await promises_1.default.unlink(fullPath);
    }
}
exports.LocalStorageAdapter = LocalStorageAdapter;
class SupabaseStorageAdapter {
    bucket;
    constructor() {
        this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'legacybridge-storage';
    }
    async ensureBucket() {
        const { data: buckets, error: listError } = await supabase_1.supabase.storage.listBuckets();
        if (listError)
            throw listError;
        if (!buckets.find(b => b.name === this.bucket)) {
            const { error: createError } = await supabase_1.supabase.storage.createBucket(this.bucket, {
                public: false,
                fileSizeLimit: 52428800, // 50MB
            });
            if (createError)
                throw createError;
        }
    }
    async save(filePath, data, mimeType) {
        await this.ensureBucket();
        const { data: uploadData, error } = await supabase_1.supabase.storage
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
    async get(fileKey) {
        await this.ensureBucket();
        const { data, error } = await supabase_1.supabase.storage
            .from(this.bucket)
            .download(fileKey);
        if (error) {
            throw new Error(`Supabase Storage Get Error: ${error.message}`);
        }
        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
    async delete(fileKey) {
        await this.ensureBucket();
        const { error } = await supabase_1.supabase.storage
            .from(this.bucket)
            .remove([fileKey]);
        if (error) {
            throw new Error(`Supabase Storage Delete Error: ${error.message}`);
        }
    }
}
exports.SupabaseStorageAdapter = SupabaseStorageAdapter;
function getStorageAdapter() {
    const provider = process.env.STORAGE_PROVIDER || 'local';
    if (provider === 'supabase') {
        return new SupabaseStorageAdapter();
    }
    return new LocalStorageAdapter();
}
