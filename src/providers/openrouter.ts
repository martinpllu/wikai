// OpenRouter provider implementation

import { BaseProvider } from './base.js';
import { addCostRecord, type CostRecord } from '../costs.js';
import type {
  ProviderId,
  ChatMessage,
  ProviderResponse,
  ProviderCapabilities,
  ProviderConfig,
  TokenUsage,
  RequestContext,
} from './types.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_GENERATION_URL = 'https://openrouter.ai/api/v1/generation';

interface OpenRouterResponse {
  id?: string;
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  error?: {
    message: string;
  };
}

interface OpenRouterStreamChunk {
  id?: string;
  choices: Array<{
    delta: {
      content?: string;
    };
  }>;
}

interface GenerationResponse {
  data: {
    id: string;
    model: string;
    streamed: boolean;
    generation_time: number;
    created_at: string;
    tokens_prompt: number;
    tokens_completion: number;
    native_tokens_prompt: number;
    native_tokens_completion: number;
    total_cost: number;
    cache_discount: number | null;
  };
}

export class OpenRouterProvider extends BaseProvider {
  get id(): ProviderId {
    return 'openrouter';
  }

  get name(): string {
    return 'OpenRouter';
  }

  get capabilities(): ProviderCapabilities {
    return {
      streaming: true,
      webSearch: true,
    };
  }

  getDefaultModel(): string {
    return 'anthropic/claude-sonnet-4';
  }

  applyWebSearch(model: string, enabled: boolean): string {
    if (enabled && !model.endsWith(':online')) {
      return `${model}:online`;
    }
    if (!enabled && model.endsWith(':online')) {
      return model.replace(/:online$/, '');
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

    console.log('Invoking OpenRouter API with model:', model, 'messages:', messages.length);

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3171',
        'X-Title': 'Delve',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as OpenRouterResponse;

    if (data.error) {
      throw new Error(`OpenRouter error: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenRouter response');
    }

    // Fetch and record cost in background (don't block the response)
    if (data.id) {
      this.fetchGenerationCost(data.id, model, context).catch(console.error);
    }

    return { content: content.trim() };
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

    console.log('Invoking OpenRouter API (streaming) with model:', model, 'messages:', messages.length);

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3171',
        'X-Title': 'Delve',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        stream: true,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let generationId: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6)) as OpenRouterStreamChunk;
            // Capture generation ID from the first chunk
            if (json.id && !generationId) {
              generationId = json.id;
            }
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    // Fetch and record cost in background after streaming completes
    if (generationId) {
      this.fetchGenerationCost(generationId, model, context).catch(console.error);
    }

    // OpenRouter doesn't provide usage in stream, cost is fetched separately
    return undefined;
  }

  private async fetchGenerationCost(
    generationId: string,
    model: string,
    context?: RequestContext
  ): Promise<void> {
    if (!this.config.apiKey || !generationId) return;

    // Wait a short time for OpenRouter to process the generation stats
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const response = await fetch(`${OPENROUTER_GENERATION_URL}?id=${generationId}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        console.error('Failed to fetch generation cost:', response.status);
        return;
      }

      const data = await response.json() as GenerationResponse;

      if (data.data) {
        const record: CostRecord = {
          id: data.data.id,
          timestamp: data.data.created_at || new Date().toISOString(),
          model: data.data.model,
          tokensPrompt: data.data.tokens_prompt,
          tokensCompletion: data.data.tokens_completion,
          nativeTokensPrompt: data.data.native_tokens_prompt,
          nativeTokensCompletion: data.data.native_tokens_completion,
          totalCost: data.data.total_cost,
          generationTime: data.data.generation_time,
          streamed: data.data.streamed,
          cacheDiscount: data.data.cache_discount,
          action: context?.action,
          pageName: context?.pageName,
          promptExcerpt: context?.promptExcerpt,
        };

        addCostRecord(record);
        console.log(`Cost recorded: $${record.totalCost.toFixed(6)} for ${record.model} (${context?.action || 'unknown'})`);
      }
    } catch (error) {
      console.error('Error fetching generation cost:', error);
    }
  }
}
