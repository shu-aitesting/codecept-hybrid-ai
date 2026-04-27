import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import Database from 'better-sqlite3';

export type GeneratedFiles = Record<string, string>;

interface CacheRow {
  agent_name: string;
  input_hash: string;
  output_files: string;
  created_at: number;
}

interface GenerationCacheOpts {
  dbPath?: string;
  /** TTL in days. Entries older than this are considered stale. Defaults to 7. */
  ttlDays?: number;
}

/**
 * SQLite-backed idempotency cache. Same input → same generated output without
 * re-calling the LLM. Hash key = SHA-256 of the stringified input.
 */
export class GenerationCache {
  private readonly db: Database.Database;
  private readonly ttlMs: number;

  constructor(opts: GenerationCacheOpts = {}) {
    const dbPath = opts.dbPath ?? path.join(process.cwd(), 'output', 'codegen-cache.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.ttlMs = (opts.ttlDays ?? 7) * 24 * 60 * 60 * 1000;
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS codegen_cache (
        agent_name  TEXT NOT NULL,
        input_hash  TEXT NOT NULL,
        output_files TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        PRIMARY KEY (agent_name, input_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_created_at ON codegen_cache (created_at);
    `);
  }

  /** SHA-256 hash of the input string — use as cache key. */
  static hashInput(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  lookup(agentName: string, inputHash: string): GeneratedFiles | null {
    const cutoff = Date.now() - this.ttlMs;
    const row = this.db
      .prepare<[string, string, number], CacheRow>(
        'SELECT * FROM codegen_cache WHERE agent_name = ? AND input_hash = ? AND created_at > ?',
      )
      .get(agentName, inputHash, cutoff);
    if (!row) return null;
    try {
      return JSON.parse(row.output_files) as GeneratedFiles;
    } catch {
      return null;
    }
  }

  store(agentName: string, inputHash: string, files: GeneratedFiles): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO codegen_cache (agent_name, input_hash, output_files, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(agentName, inputHash, JSON.stringify(files), Date.now());
  }

  /**
   * Delete entries older than `ttlDays`. Returns the number of rows removed.
   */
  purgeStale(): number {
    const cutoff = Date.now() - this.ttlMs;
    const result = this.db
      .prepare('DELETE FROM codegen_cache WHERE created_at <= ?')
      .run(cutoff);
    return result.changes;
  }

  /** Count cached entries for an agent (useful for testing). */
  countFor(agentName: string): number {
    const row = this.db
      .prepare<[string], { n: number }>('SELECT COUNT(*) as n FROM codegen_cache WHERE agent_name = ?')
      .get(agentName);
    return row?.n ?? 0;
  }

  close(): void {
    this.db.close();
  }
}
