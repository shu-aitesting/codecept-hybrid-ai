/**
 * LLM provider contract — every concrete provider (Anthropic, Cohere, HF, G4F,
 * Mock) implements this interface so the rest of the framework treats them
 * interchangeably.
 */

export type Role = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: Role;
  content: string;
  /**
   * When true, the provider should mark this message for prompt caching
   * (Anthropic ephemeral cache_control). Other providers ignore the flag.
   */
  cache?: boolean;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
  /** Optional JSON schema hint forwarded to providers that support it. */
  jsonSchema?: object;
  /** Hard timeout in ms; BaseProvider enforces this around `chat()`. */
  timeoutMs?: number;
  /** Override default retries for this single call. */
  maxRetries?: number;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  /** Tokens served from prompt cache (Anthropic). */
  cachedTokens?: number;
}

export interface ChatResult {
  text: string;
  usage: ChatUsage;
  provider: string;
  model: string;
  latencyMs: number;
}

export interface LLMProvider {
  readonly name: string;
  isConfigured(): boolean;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;
  estimateCostUsd(usage: ChatUsage): number;
}

export type TaskProfile = 'heal' | 'codegen' | 'data-gen' | 'review';

export type ErrorClass =
  | 'rate_limit'
  | 'timeout'
  | 'auth'
  | 'transient'
  | 'fatal';

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly classification: ErrorClass,
    public readonly cause?: unknown,
    /** seconds suggested by the upstream Retry-After header, if present */
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly spentUsd: number,
    public readonly capUsd: number,
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class NoMockResponseError extends Error {
  constructor(public readonly key: string) {
    super(`MockProvider has no response registered for key: ${key}`);
    this.name = 'NoMockResponseError';
  }
}
