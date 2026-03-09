import { readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { StorageProvider } from './types.js';

/**
 * File-system storage provider. Persists each item as a JSON file.
 * Zero external dependencies — just needs a writable directory.
 */
export class FileStorageProvider<T> implements StorageProvider<T> {
  private dir: string;

  constructor(baseDir: string, collection: string) {
    this.dir = path.join(baseDir, collection);
    mkdirSync(this.dir, { recursive: true });
  }

  private filePath(key: string): string {
    // Sanitize key to be filesystem-safe
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dir, `${safe}.json`);
  }

  async get(key: string): Promise<T | undefined> {
    const fp = this.filePath(key);
    if (!existsSync(fp)) return undefined;
    try {
      const raw = readFileSync(fp, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: T): Promise<void> {
    writeFileSync(this.filePath(key), JSON.stringify(value, null, 2));
  }

  async delete(key: string): Promise<void> {
    const fp = this.filePath(key);
    if (existsSync(fp)) unlinkSync(fp);
  }

  async list(): Promise<T[]> {
    if (!existsSync(this.dir)) return [];
    const files = readdirSync(this.dir).filter(f => f.endsWith('.json'));
    const results: T[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(path.join(this.dir, file), 'utf-8');
        results.push(JSON.parse(raw) as T);
      } catch {
        // Skip corrupted files
      }
    }
    return results;
  }
}
