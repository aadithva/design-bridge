import { TableClient, TableServiceClient } from '@azure/data-tables';
import type { StorageProvider } from './types.js';

/**
 * Azure Table Storage provider. Persists data as JSON string blobs.
 * PartitionKey = table name, RowKey = item key.
 */
export class AzureTableProvider<T> implements StorageProvider<T> {
  private client: TableClient;
  private partitionKey: string;
  private ready: Promise<void>;

  constructor(connectionString: string, tableName: string) {
    this.partitionKey = tableName;
    this.client = TableClient.fromConnectionString(connectionString, tableName);
    // Ensure table exists (idempotent)
    this.ready = this.client.createTable().catch(() => {
      // Table already exists — ignore
    });
  }

  async get(key: string): Promise<T | undefined> {
    await this.ready;
    try {
      const entity = await this.client.getEntity<{ data: string }>(this.partitionKey, key);
      return JSON.parse(entity.data) as T;
    } catch (err: any) {
      if (err.statusCode === 404) return undefined;
      throw err;
    }
  }

  async set(key: string, value: T): Promise<void> {
    await this.ready;
    await this.client.upsertEntity({
      partitionKey: this.partitionKey,
      rowKey: key,
      data: JSON.stringify(value),
    });
  }

  async delete(key: string): Promise<void> {
    await this.ready;
    try {
      await this.client.deleteEntity(this.partitionKey, key);
    } catch (err: any) {
      if (err.statusCode === 404) return;
      throw err;
    }
  }

  async list(): Promise<T[]> {
    await this.ready;
    const results: T[] = [];
    const entities = this.client.listEntities<{ data: string }>({
      queryOptions: { filter: `PartitionKey eq '${this.partitionKey}'` },
    });
    for await (const entity of entities) {
      results.push(JSON.parse(entity.data) as T);
    }
    return results;
  }
}
