// Provider types and interfaces

export type ProviderId = 'openrouter' | 'openai' | 'anthropic';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ProviderResponse {
  content: string;
  usage?: TokenUsage;
}

export interface ProviderCapabilities {
  streaming: boolean;
  webSearch: boolean;
}

export interface ProviderConfig {
  apiKey: string;
  model?: string;
}

export interface RequestContext {
  action: string;  // e.g., "generate", "edit", "comment", "reply"
  pageName?: string;
  promptExcerpt?: string;
}
