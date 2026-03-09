import type { StorageProvider } from './types.js';

/**
 * In-memory storage provider. Data is lost on restart.
 * Default for local development.
 */
export class MemoryProvider<T> implements StorageProvider<T> {
  private store = new Map<string, T>();
  private maxItems: number;

  constructor(maxItems = Infinity) {
    this.maxItems = maxItems;
  }

  async get(key: string): Promise<T | undefined> {
    return this.store.get(key);
  }

  async set(key: string, value: T): Promise<void> {
    this.store.set(key, value);
    // Enforce max items (FIFO eviction)
    if (this.store.size > this.maxItems) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<T[]> {
    return Array.from(this.store.values());
  }
}
