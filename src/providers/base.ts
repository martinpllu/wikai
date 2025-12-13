// Abstract base provider class

import type {
  ProviderId,
  ChatMessage,
  ProviderResponse,
  ProviderCapabilities,
  ProviderConfig,
  TokenUsage,
  RequestContext,
} from './types.js';

export abstract class BaseProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /** Provider identifier */
  abstract get id(): ProviderId;

  /** Human-readable provider name */
  abstract get name(): string;

  /** Provider capabilities */
  abstract get capabilities(): ProviderCapabilities;

  /** Validate configuration (e.g., API key present) */
  validate(): { valid: boolean; error?: string } {
    if (!this.config.apiKey) {
      return { valid: false, error: `No API key configured for ${this.name}` };
    }
    return { valid: true };
  }

  /** Get default model for this provider */
  abstract getDefaultModel(): string;

  /** Apply web search to model if supported */
  abstract applyWebSearch(model: string, enabled: boolean): string;

  /** Non-streaming completion */
  abstract invoke(
    messages: ChatMessage[],
    model: string,
    context?: RequestContext
  ): Promise<ProviderResponse>;

  /** Streaming completion - yields content chunks, returns usage at end */
  abstract invokeStreaming(
    messages: ChatMessage[],
    model: string,
    context?: RequestContext
  ): AsyncGenerator<string, TokenUsage | undefined>;
}
