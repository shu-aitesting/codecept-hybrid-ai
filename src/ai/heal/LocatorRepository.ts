import * as fs from 'node:fs';
import * as path from 'node:path';

import Database from 'better-sqlite3';

export interface HealedRow {
  id: number;
  testFile: string;
  originalSelector: string;
  healedSelector: string;
  successCount: number;
  failCount: number;
  lastUsedAt: number;
  createdAt: number;
  providerUsed: string | null;
}

interface RepoOpts {
  dbPath?: string;
  /** Inject clock for deterministic decay tests. */
  now?: () => number;
  /** Decay window in ms — entries older than this with no use are purged. */
  maxAgeMs?: number;
}

const DEFAULT_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

/**
 * SQLite-backed cache of locator → healed-locator mappings, with success/fail
 * stats so the engine can confidently re-use proven selectors and decay
 * forgotten ones. SQLite scales well past the JSON-file approach used by the
 * old framework once the test suite has thousands of entries.
 */
export class LocatorRepository {
  private readonly db: Database.Database;
  private readonly now: () => number;
  private readonly maxAge: number;

  constructor(opts: RepoOpts = {}) {
    const dbPath = opts.dbPath ?? path.join(process.cwd(), 'output', 'heal-cache.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS healed_locators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_file TEXT NOT NULL,
        original_selector TEXT NOT NULL,
        healed_selector TEXT NOT NULL,
        success_count INTEGER NOT NULL DEFAULT 0,
        fail_count INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        provider_used TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_test_orig
        ON healed_locators(test_file, original_selector);
    `);
    this.now = opts.now ?? Date.now;
    this.maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE;
  }

  /**
   * Returns a cached healed selector if (1) it exists, (2) success > fail,
   * and (3) it was used within the decay window.
   */
  lookup(testFile: string, originalSelector: string): string | null {
    const row = this.db
      .prepare<[string, string], HealedRow>(
        `SELECT id, test_file as testFile, original_selector as originalSelector,
                healed_selector as healedSelector, success_count as successCount,
                fail_count as failCount, last_used_at as lastUsedAt,
                created_at as createdAt, provider_used as providerUsed
           FROM healed_locators
          WHERE test_file = ? AND original_selector = ?`,
      )
      .get(testFile, originalSelector);
    if (!row) return null;
    if (this.now() - row.lastUsedAt > this.maxAge) return null;
    if (row.successCount <= row.failCount) return null;
    return row.healedSelector;
  }

  record(
    testFile: string,
    originalSelector: string,
    healedSelector: string,
    success: boolean,
    provider?: string,
  ): void {
    const now = this.now();
    const existing = this.db
      .prepare<[string, string], HealedRow>(
        `SELECT id, test_file as testFile, original_selector as originalSelector,
                healed_selector as healedSelector, success_count as successCount,
                fail_count as failCount, last_used_at as lastUsedAt,
                created_at as createdAt, provider_used as providerUsed
           FROM healed_locators
          WHERE test_file = ? AND original_selector = ?`,
      )
      .get(testFile, originalSelector);

    if (existing) {
      this.db
        .prepare(
          `UPDATE healed_locators SET healed_selector = ?, success_count = ?,
                  fail_count = ?, last_used_at = ?, provider_used = COALESCE(?, provider_used)
            WHERE id = ?`,
        )
        .run(
          healedSelector,
          existing.successCount + (success ? 1 : 0),
          existing.failCount + (success ? 0 : 1),
          now,
          provider ?? null,
          existing.id,
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO healed_locators
             (test_file, original_selector, healed_selector, success_count,
              fail_count, last_used_at, created_at, provider_used)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          testFile,
          originalSelector,
          healedSelector,
          success ? 1 : 0,
          success ? 0 : 1,
          now,
          now,
          provider ?? null,
        );
    }
  }

  /** Purge stale rows (last_used > maxAge). Returns rows removed. */
  decay(): number {
    const cutoff = this.now() - this.maxAge;
    const info = this.db
      .prepare(`DELETE FROM healed_locators WHERE last_used_at < ?`)
      .run(cutoff);
    return info.changes;
  }

  /** Rows worth promoting back into source code. */
  topPromotionCandidates(minSuccess = 10): HealedRow[] {
    return this.db
      .prepare<[number], HealedRow>(
        `SELECT id, test_file as testFile, original_selector as originalSelector,
                healed_selector as healedSelector, success_count as successCount,
                fail_count as failCount, last_used_at as lastUsedAt,
                created_at as createdAt, provider_used as providerUsed
           FROM healed_locators
          WHERE success_count > ? AND success_count > fail_count
          ORDER BY success_count DESC`,
      )
      .all(minSuccess);
  }

  close(): void {
    this.db.close();
  }
}
