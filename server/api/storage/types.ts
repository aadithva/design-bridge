/**
 * Generic storage provider interface for persisting data.
 * Used for analysisStore and reviewHistory — caches stay in-memory.
 */
export interface StorageProvider<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<T[]>;
}
