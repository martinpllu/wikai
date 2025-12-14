// OpenAI provider implementation

import { BaseProvider } from './base.js';
import { addCostRecord, type CostRecord } from '../costs.js';
import type {
  ProviderId,
  ChatMessage,
  ProviderResponse,
  ProviderCapabilities,
  TokenUsage,
  RequestContext,
} from './types.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

interface OpenAIResponse {
  id?: string;
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  error?: {
    message: string;
  };
}

interface OpenAIStreamChunk {
  id?: string;
  choices: Array<{
    delta: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class OpenAIProvider extends BaseProvider {
  get id(): ProviderId {
    return 'openai';
  }

  get name(): string {
    return 'OpenAI';
  }

  get capabilities(): ProviderCapabilities {
    return {
      streaming: true,
      webSearch: true,
    };
  }

  getDefaultModel(): string {
    return 'gpt-4o';
  }

  applyWebSearch(model: string, enabled: boolean): string {
    // OpenAI web search uses specific model variants
    if (enabled) {
      if (model.includes('gpt-4o-mini')) {
        return 'gpt-4o-mini-search-preview';
      }
      if (model.includes('gpt-4o') || model === 'gpt-4o') {
        return 'gpt-4o-search-preview';
      }
      // Default to gpt-4o search if model doesn't have a search variant
      return 'gpt-4o-search-preview';
    }
    // When disabling, revert search models to regular versions
    if (model === 'gpt-4o-search-preview') {
      return 'gpt-4o';
    }
    if (model === 'gpt-4o-mini-search-preview') {
      return 'gpt-4o-mini';
    }
    return model;
  }

  async invoke(
    messages: ChatMessage[],
    model: string,
    context?: RequestContext
  ): Promise<ProviderResponse> {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    console.log('Invoking OpenAI API with model:', model, 'messages:', messages.length);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as OpenAIResponse;

    if (data.error) {
      throw new Error(`OpenAI error: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    const usage: TokenUsage | undefined = data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
    } : undefined;

    // Record token usage
    if (usage) {
      this.recordTokenUsage(model, usage, false, context);
    }

    return { content: content.trim(), usage };
  }

  async *invokeStreaming(
    messages: ChatMessage[],
    model: string,
    context?: RequestContext
  ): AsyncGenerator<string, TokenUsage | undefined> {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    console.log('Invoking OpenAI API (streaming) with model:', model, 'messages:', messages.length);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        stream: true,
        stream_options: { include_usage: true },
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let usage: TokenUsage | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6)) as OpenAIStreamChunk;
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
            // Capture usage from the final chunk
            if (json.usage) {
              usage = {
                promptTokens: json.usage.prompt_tokens,
                completionTokens: json.usage.completion_tokens,
              };
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    // Record token usage
    if (usage) {
      this.recordTokenUsage(model, usage, true, context);
    }

    return usage;
  }

  private recordTokenUsage(
    model: string,
    usage: TokenUsage,
    streamed: boolean,
    context?: RequestContext
  ): void {
    const record: CostRecord = {
      id: `openai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      model,
      tokensPrompt: usage.promptTokens,
      tokensCompletion: usage.completionTokens,
      nativeTokensPrompt: usage.promptTokens,
      nativeTokensCompletion: usage.completionTokens,
      totalCost: 0, // Not tracking cost for direct API calls
      streamed,
      action: context?.action,
      pageName: context?.pageName,
      prompt: context?.prompt,
    };

    addCostRecord(record);
    console.log(`Tokens recorded: ${usage.promptTokens} in / ${usage.completionTokens} out for ${model} (${context?.action || 'unknown'})`);
  }
}
