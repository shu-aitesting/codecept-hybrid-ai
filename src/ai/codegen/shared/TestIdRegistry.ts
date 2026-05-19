import * as fs from 'node:fs';
import * as path from 'node:path';

import type { TestCasePlan } from './TestCasePlan';

const REGISTRY_PATH = path.join(process.cwd(), '.codegen', 'test-id-registry.json');

/**
 * Persisted record for one generated test case. The composite (group +
 * operationId + kind + mutation) acts as the lookup key — same plan always
 * resolves to the same {@link displayId}, even after regeneration.
 *
 * {@link qaseId} is reserved for future Qase test-management mapping; it stays
 * `null` until an explicit sync step populates it.
 */
export interface RegistryEntry {
  displayId: string;
  group: string;
  operationId: string;
  kind: string;
  mutationPath?: string | null;
  mutationKind?: string | null;
  file: string;
  qaseId?: number | null;
  createdAt: string;
}

interface Registry {
  version: 1;
  groupCounters: Record<string, number>;
  entries: Record<string, RegistryEntry>;
  byId: Record<string, string>;
}

function emptyRegistry(): Registry {
  return { version: 1, groupCounters: {}, entries: {}, byId: {} };
}

function load(): Registry {
  try {
    if (!fs.existsSync(REGISTRY_PATH)) return emptyRegistry();
    const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as Partial<Registry>;
    if (parsed.version !== 1) return emptyRegistry();
    return {
      version: 1,
      groupCounters: parsed.groupCounters ?? {},
      entries: parsed.entries ?? {},
      byId: parsed.byId ?? {},
    };
  } catch {
    return emptyRegistry();
  }
}

function save(reg: Registry): void {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), 'utf8');
}

function planKey(groupPrefix: string, plan: TestCasePlan): string {
  return [
    groupPrefix,
    plan.endpoint.operationId,
    plan.kind,
    plan.mutation?.path ?? '',
    plan.mutation?.kind ?? '',
  ].join('|');
}

function groupPrefix(groupName: string): string {
  return groupName.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

export class TestIdRegistry {
  private reg: Registry;
  private dirty = false;

  constructor() {
    this.reg = load();
  }

  /**
   * Assign — or recover — the display ID for a plan. Same plan key always
   * yields the same ID across runs, so adding new scenarios never renumbers
   * existing ones. Each group has its own monotonic counter.
   */
  assignId(groupName: string, plan: TestCasePlan, testFile: string): string {
    const prefix = groupPrefix(groupName);
    const key = planKey(prefix, plan);
    const relFile = path.isAbsolute(testFile)
      ? path.relative(process.cwd(), testFile).replace(/\\/g, '/')
      : testFile.replace(/\\/g, '/');

    const existing = this.reg.entries[key];
    if (existing) {
      if (existing.file !== relFile) {
        existing.file = relFile;
        this.dirty = true;
      }
      return existing.displayId;
    }

    const next = (this.reg.groupCounters[prefix] ?? 0) + 1;
    this.reg.groupCounters[prefix] = next;
    const displayId = `${prefix}-${pad(next)}`;

    this.reg.entries[key] = {
      displayId,
      group: prefix,
      operationId: plan.endpoint.operationId,
      kind: plan.kind,
      mutationPath: plan.mutation?.path ?? null,
      mutationKind: plan.mutation?.kind ?? null,
      file: relFile,
      qaseId: null,
      createdAt: new Date().toISOString(),
    };
    this.reg.byId[displayId] = key;
    this.dirty = true;
    return displayId;
  }

  flush(): void {
    if (this.dirty) {
      save(this.reg);
      this.dirty = false;
    }
  }

  /**
   * Resolve a display ID to its registry entry (file path + metadata).
   * Used by the test-id runner script.
   */
  static lookup(displayId: string): RegistryEntry | null {
    const reg = load();
    const key = reg.byId[displayId.toUpperCase()];
    if (!key) return null;
    return reg.entries[key] ?? null;
  }

  static all(): RegistryEntry[] {
    return Object.values(load().entries);
  }
}
