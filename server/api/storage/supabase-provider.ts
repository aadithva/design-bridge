import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StorageProvider } from './types.js';

/**
 * Supabase storage provider. Persists each item as a row with a JSONB `data` column.
 * Table schema (create once per collection):
 *
 *   CREATE TABLE analyses (
 *     key TEXT PRIMARY KEY,
 *     data JSONB NOT NULL,
 *     created_at TIMESTAMPTZ DEFAULT now()
 *   );
 *
 *   CREATE TABLE reviews (
 *     key TEXT PRIMARY KEY,
 *     data JSONB NOT NULL,
 *     created_at TIMESTAMPTZ DEFAULT now()
 *   );
 */
export class SupabaseProvider<T> implements StorageProvider<T> {
  private client: SupabaseClient;
  private table: string;

  constructor(supabaseUrl: string, supabaseKey: string, table: string) {
    this.client = createClient(supabaseUrl, supabaseKey);
    this.table = table;
  }

  async get(key: string): Promise<T | undefined> {
    const { data, error } = await this.client
      .from(this.table)
      .select('data')
      .eq('key', key)
      .single();

    if (error || !data) return undefined;
    return data.data as T;
  }

  async set(key: string, value: T): Promise<void> {
    const { error } = await this.client
      .from(this.table)
      .upsert(
        { key, data: value, created_at: new Date().toISOString() },
        { onConflict: 'key' },
      );

    if (error) throw new Error(`Supabase set failed: ${error.message}`);
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.client
      .from(this.table)
      .delete()
      .eq('key', key);

    if (error) throw new Error(`Supabase delete failed: ${error.message}`);
  }

  async list(): Promise<T[]> {
    const { data, error } = await this.client
      .from(this.table)
      .select('data')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Supabase list failed: ${error.message}`);
    return (data || []).map(row => row.data as T);
  }
}
