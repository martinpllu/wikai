// Provider registry and factory

import { BaseProvider } from './base.js';
import { OpenRouterProvider } from './openrouter.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import type { ProviderId, ProviderConfig, ProviderCapabilities, ChatMessage, RequestContext } from './types.js';

// Re-export types for convenience
export type { ProviderId, ChatMessage, TokenUsage, RequestContext } from './types.js';
export { BaseProvider } from './base.js';

// Provider registry
const providerClasses: Record<ProviderId, new (config: ProviderConfig) => BaseProvider> = {
  openrouter: OpenRouterProvider,
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
};

// Provider metadata
const providerInfo: Record<ProviderId, { name: string; defaultModel: string }> = {
  openrouter: { name: 'OpenRouter', defaultModel: 'anthropic/claude-sonnet-4' },
  openai: { name: 'OpenAI', defaultModel: 'gpt-4o' },
  anthropic: { name: 'Anthropic', defaultModel: 'claude-sonnet-4-20250514' },
};

export interface UserSettingsForProvider {
  provider?: ProviderId;
  model?: string;
  searchEnabled?: boolean;
  providerApiKeys?: Partial<Record<ProviderId, string>>;
}

/**
 * Create a provider instance from user settings
 */
export function createProvider(settings: UserSettingsForProvider): BaseProvider {
  const providerId = settings.provider || 'openrouter';
  const apiKey = settings.providerApiKeys?.[providerId] || '';

  const ProviderClass = providerClasses[providerId];
  if (!ProviderClass) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return new ProviderClass({
    apiKey,
    model: settings.model,
  });
}

/**
 * Get provider display name
 */
export function getProviderName(id: ProviderId): string {
  return providerInfo[id]?.name || id;
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(id: ProviderId): string {
  return providerInfo[id]?.defaultModel || '';
}

/**
 * Get provider capabilities
 */
export function getProviderCapabilities(id: ProviderId): ProviderCapabilities {
  const provider = new providerClasses[id]({ apiKey: '' });
  return provider.capabilities;
}

/**
 * List all available providers
 */
export function listProviders(): ProviderId[] {
  return Object.keys(providerClasses) as ProviderId[];
}

/**
 * Get the effective model with web search applied if enabled
 */
export function getEffectiveModel(settings: UserSettingsForProvider): string {
  const providerId = settings.provider || 'openrouter';
  const baseModel = settings.model || getDefaultModel(providerId);

  if (!settings.searchEnabled) {
    return baseModel;
  }

  // Apply web search transformation based on provider
  const provider = createProvider({ ...settings, searchEnabled: false });
  return provider.applyWebSearch(baseModel, true);
}

/**
 * Helper to build messages array from prompt and system prompt
 */
export function buildMessages(prompt: string, systemPrompt?: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });
  return messages;
}

/**
 * Convenience function: invoke model with settings (non-streaming)
 */
export async function invokeModel(
  prompt: string,
  systemPrompt?: string,
  settings?: UserSettingsForProvider,
  context?: RequestContext
): Promise<string> {
  const effectiveSettings = settings || {};
  const provider = createProvider(effectiveSettings);
  const model = getEffectiveModel(effectiveSettings);
  const messages = buildMessages(prompt, systemPrompt);

  const response = await provider.invoke(messages, model, context);
  return response.content;
}

/**
 * Convenience function: invoke model with settings (streaming)
 */
export async function* invokeModelStreaming(
  prompt: string,
  systemPrompt?: string,
  settings?: UserSettingsForProvider,
  context?: RequestContext
): AsyncGenerator<string, string | undefined> {
  const effectiveSettings = settings || {};
  const provider = createProvider(effectiveSettings);
  const model = getEffectiveModel(effectiveSettings);
  const messages = buildMessages(prompt, systemPrompt);

  const generator = provider.invokeStreaming(messages, model, context);

  while (true) {
    const result = await generator.next();
    if (result.done) {
      // Return undefined to match existing API (generation ID was returned before)
      return undefined;
    }
    yield result.value;
  }
}
