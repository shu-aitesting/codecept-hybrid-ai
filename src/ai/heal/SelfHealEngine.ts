import { z } from 'zod';

import { PromptLibrary } from '../prompts/PromptLibrary';
import { StructuredOutputParser } from '../providers/StructuredOutputParser';
import { TaskAwareRouter } from '../providers/TaskAwareRouter';
import { ChatMessage, ChatResult } from '../providers/types';
import { DomSanitizer } from '../utils/DomSanitizer';

import { HealTelemetry } from './HealTelemetry';
import { LocatorRepository } from './LocatorRepository';

export interface PageLike {
  content(): Promise<string>;
  /** Returns an object exposing `.count()` like Playwright's Locator. */
  locator(selector: string): { count(): Promise<number> };
}

export interface HealContext {
  testFile: string;
  step: string;
  locator: string;
  error: string;
  page: PageLike;
}

export interface HealResult {
  healedSelector: string | null;
  fromCache: boolean;
  candidates: string[];
  sanitizedDomBytes: number;
  costUsd: number;
  latencyMs: number;
  provider?: string;
  reason?: string;
}

interface EngineDeps {
  router?: TaskAwareRouter;
  repository?: LocatorRepository;
  sanitizer?: DomSanitizer;
  promptLibrary?: PromptLibrary;
  parser?: StructuredOutputParser;
  telemetry?: HealTelemetry;
  /** Hard cap on tokens fed into the heal LLM call. */
  maxTokens?: number;
}

const candidatesSchema = z.object({
  candidates: z.array(z.string().min(1)).min(1).max(8),
});

/**
 * Four-phase self-healing flow. Each phase is independently observable:
 * the cost reduction from sanitize and the verification step from candidate
 * checking are measured end-to-end and surfaced in `output/heal-events.jsonl`.
 */
export class SelfHealEngine {
  private readonly router: TaskAwareRouter;
  private readonly repo: LocatorRepository;
  private readonly sanitizer: DomSanitizer;
  private readonly prompts: PromptLibrary;
  private readonly parser: StructuredOutputParser;
  private readonly telemetry: HealTelemetry;
  private readonly maxTokens: number;

  constructor(deps: EngineDeps = {}) {
    this.router = deps.router ?? new TaskAwareRouter('heal');
    this.repo = deps.repository ?? new LocatorRepository();
    this.sanitizer = deps.sanitizer ?? new DomSanitizer();
    this.prompts = deps.promptLibrary ?? new PromptLibrary();
    this.parser = deps.parser ?? new StructuredOutputParser();
    this.telemetry = deps.telemetry ?? new HealTelemetry();
    this.maxTokens = deps.maxTokens ?? 6000;
  }

  async heal(ctx: HealContext): Promise<HealResult> {
    const start = Date.now();

    // Phase 0 — cache lookup.
    const cached = this.repo.lookup(ctx.testFile, ctx.locator);
    if (cached) {
      const ok = await this.verifyUnique(ctx, cached);
      if (ok) {
        const result: HealResult = {
          healedSelector: cached,
          fromCache: true,
          candidates: [cached],
          sanitizedDomBytes: 0,
          costUsd: 0,
          latencyMs: Date.now() - start,
          reason: 'cache-hit',
        };
        this.repo.record(ctx.testFile, ctx.locator, cached, true);
        this.telemetry.append({ ...this.telemetryBase(ctx, result), success: true });
        return result;
      }
      // Cache stale — continue to LLM phase.
      this.repo.record(ctx.testFile, ctx.locator, cached, false);
    }

    // Phase 1 — sanitize DOM around the failed locator.
    const rawHtml = await ctx.page.content();
    const sanitized = this.sanitizer.sanitizeAround(rawHtml, ctx.locator, {
      ancestorLevels: 3,
      siblingsRadius: 2,
    });
    const tokenEst = this.sanitizer.estimateTokens(sanitized);
    if (tokenEst > this.maxTokens) {
      const result = this.failResult(ctx, start, sanitized, 'dom-too-large');
      this.telemetry.append({ ...this.telemetryBase(ctx, result), success: false });
      return result;
    }

    // Phase 2 — LLM candidate generation.
    const messages = this.prompts.loadChatMessages(
      'heal',
      { step: ctx.step, locator: ctx.locator, error: ctx.error, dom: sanitized },
      { cacheSystem: true },
    );
    let llmResult: ChatResult;
    let candidates: string[];
    try {
      llmResult = await this.router.chat(messages, {}, { testFile: ctx.testFile, agentName: 'self-heal' });
      const parsed = await this.parser.parse(llmResult.text, {
        schema: candidatesSchema,
        llmFix: async (errMsg) => this.fixupViaLlm(messages, errMsg),
        maxFixRetries: 1,
      });
      candidates = parsed.candidates;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'llm-failed';
      const result = this.failResult(ctx, start, sanitized, reason);
      this.telemetry.append({ ...this.telemetryBase(ctx, result), success: false });
      return result;
    }

    // Phase 3 — DOM verification: pick the first uniquely-matching candidate.
    let healed: string | null = null;
    for (const candidate of candidates) {
      const cleaned = candidate.trim();
      if (!cleaned) continue;
      try {
        const count = await ctx.page.locator(cleaned).count();
        if (count === 1) {
          healed = cleaned;
          break;
        }
      } catch {
        // invalid selector — skip
      }
    }

    // Phase 4 — record outcome + telemetry.
    const cost = this.estimateCost(llmResult);
    const result: HealResult = {
      healedSelector: healed,
      fromCache: false,
      candidates,
      sanitizedDomBytes: Buffer.byteLength(sanitized, 'utf8'),
      costUsd: cost,
      latencyMs: Date.now() - start,
      provider: llmResult.provider,
      reason: healed ? 'llm-verified' : 'no-unique-candidate',
    };
    this.repo.record(ctx.testFile, ctx.locator, healed ?? candidates[0] ?? '', !!healed, llmResult.provider);
    this.telemetry.append({ ...this.telemetryBase(ctx, result), success: !!healed });
    return result;
  }

  private async verifyUnique(ctx: HealContext, selector: string): Promise<boolean> {
    try {
      return (await ctx.page.locator(selector).count()) === 1;
    } catch {
      return false;
    }
  }

  private failResult(
    ctx: HealContext,
    start: number,
    sanitized: string,
    reason: string,
  ): HealResult {
    return {
      healedSelector: null,
      fromCache: false,
      candidates: [],
      sanitizedDomBytes: Buffer.byteLength(sanitized, 'utf8'),
      costUsd: 0,
      latencyMs: Date.now() - start,
      reason,
    };
  }

  private telemetryBase(ctx: HealContext, r: HealResult) {
    return {
      testFile: ctx.testFile,
      originalSelector: ctx.locator,
      healedSelector: r.healedSelector,
      candidatesCount: r.candidates.length,
      sanitizedDomBytes: r.sanitizedDomBytes,
      provider: r.provider,
      latencyMs: r.latencyMs,
      costUsd: r.costUsd,
      reason: r.reason,
    };
  }

  private estimateCost(result: ChatResult): number {
    // Cost is also written by TaskAwareRouter into the cost ledger; we
    // recompute a tiny estimate here for the per-event telemetry stream.
    if (result.provider === 'anthropic') {
      const cached = result.usage.cachedTokens ?? 0;
      const uncached = Math.max(0, result.usage.inputTokens - cached);
      return Number(
        (
          (uncached / 1_000_000) * 0.8 +
          (cached / 1_000_000) * 0.08 +
          (result.usage.outputTokens / 1_000_000) * 4
        ).toFixed(6),
      );
    }
    return 0;
  }

  private async fixupViaLlm(messages: ChatMessage[], errMsg: string): Promise<string> {
    const fixupMessages: ChatMessage[] = [
      ...messages,
      {
        role: 'user',
        content: `Your last response failed validation: ${errMsg}. Reply with valid JSON only matching {"candidates": string[]}.`,
      },
    ];
    const result = await this.router.chat(fixupMessages, { temperature: 0 });
    return result.text;
  }
}
