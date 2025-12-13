// Anthropic provider implementation

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

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface AnthropicResponse {
  id?: string;
  content: Array<{
    type: string;
    text?: string;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: {
    message: string;
  };
}

// Anthropic SSE event types
interface AnthropicMessageStart {
  type: 'message_start';
  message: {
    id: string;
    usage?: {
      input_tokens: number;
    };
  };
}

interface AnthropicContentBlockDelta {
  type: 'content_block_delta';
  delta: {
    type: 'text_delta';
    text: string;
  };
}

interface AnthropicMessageDelta {
  type: 'message_delta';
  usage?: {
    output_tokens: number;
  };
}

type AnthropicStreamEvent = AnthropicMessageStart | AnthropicContentBlockDelta | AnthropicMessageDelta | { type: string };

export class AnthropicProvider extends BaseProvider {
  get id(): ProviderId {
    return 'anthropic';
  }

  get name(): string {
    return 'Anthropic';
  }

  get capabilities(): ProviderCapabilities {
    return {
      streaming: true,
      webSearch: false, // Anthropic doesn't have built-in web search
    };
  }

  getDefaultModel(): string {
    return 'claude-sonnet-4-20250514';
  }

  applyWebSearch(model: string, _enabled: boolean): string {
    // Anthropic doesn't support web search, return model unchanged
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

    console.log('Invoking Anthropic API with model:', model, 'messages:', messages.length);

    // Extract system message if present
    const systemMessage = messages.find(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: systemMessage?.content,
        messages: nonSystemMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as AnthropicResponse;

    if (data.error) {
      throw new Error(`Anthropic error: ${data.error.message}`);
    }

    const textContent = data.content?.find(c => c.type === 'text');
    const content = textContent?.text;
    if (!content) {
      throw new Error('No content in Anthropic response');
    }

    const usage: TokenUsage | undefined = data.usage ? {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
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

    console.log('Invoking Anthropic API (streaming) with model:', model, 'messages:', messages.length);

    // Extract system message if present
    const systemMessage = messages.find(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        stream: true,
        system: systemMessage?.content,
        messages: nonSystemMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Anthropic SSE format: "event: type\ndata: {...}"
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6)) as AnthropicStreamEvent;

            if (json.type === 'message_start') {
              const event = json as AnthropicMessageStart;
              inputTokens = event.message?.usage?.input_tokens || 0;
            } else if (json.type === 'content_block_delta') {
              const event = json as AnthropicContentBlockDelta;
              const text = event.delta?.text;
              if (text) {
                yield text;
              }
            } else if (json.type === 'message_delta') {
              const event = json as AnthropicMessageDelta;
              outputTokens = event.usage?.output_tokens || 0;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    const usage: TokenUsage | undefined = (inputTokens || outputTokens) ? {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
    } : undefined;

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
      id: `anthropic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
      promptExcerpt: context?.promptExcerpt,
    };

    addCostRecord(record);
    console.log(`Tokens recorded: ${usage.promptTokens} in / ${usage.completionTokens} out for ${model} (${context?.action || 'unknown'})`);
  }
}
