/**
 * DeepSeek Provider Implementation
 */

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  FIMCompletionRequest,
  FIMCompletionResponse,
  StreamChunk,
  ChatMessage
} from '../types';
import type { LLMClient, LLMClientConfig } from '../client';

const BASE_URL = 'https://api.deepseek.com';
const BETA_URL = 'https://api.deepseek.com/beta';

export interface DeepSeekConfig extends LLMClientConfig {
  useBeta?: boolean;
}

export class DeepSeekClient implements LLMClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: DeepSeekConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.useBeta ? BETA_URL : config.baseUrl || BASE_URL;
  }

  private get headers(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ ...request, stream: false })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message ?? `API error: ${response.status}`);
    }

    return response.json();
  }

  async *chatCompletionStream(request: ChatCompletionRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ ...request, stream: true })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message ?? `API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const chunk = JSON.parse(trimmed.slice(6)) as StreamChunk;
            yield chunk;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  async fimCompletion(request: FIMCompletionRequest): Promise<FIMCompletionResponse> {
    const response = await fetch(`${BETA_URL}/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ ...request, stream: false })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message ?? `API error: ${response.status}`);
    }

    return response.json();
  }

  async *fimCompletionStream(request: FIMCompletionRequest): AsyncGenerator<{ text: string }, void, unknown> {
    const response = await fetch(`${BETA_URL}/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ ...request, stream: true })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message ?? `API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const chunk = JSON.parse(trimmed.slice(6));
            if (chunk.choices?.[0]?.text) {
              yield { text: chunk.choices[0].text };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}

// ============================================================================
// Validation Helpers
// ============================================================================

export function validateThinkingMode(request: ChatCompletionRequest): string[] {
  const warnings: string[] = [];

  if (request.model?.includes('reasoner')) {
    if (request.temperature !== undefined) {
      warnings.push('temperature is not supported in thinking mode');
    }
    if (request.top_p !== undefined) {
      warnings.push('top_p is not supported in thinking mode');
    }
  }

  return warnings;
}

export function validateJsonMode(request: ChatCompletionRequest): string[] {
  const warnings: string[] = [];

  if (request.response_format?.type === 'json_object') {
    const hasJsonKeyword = request.messages.some(m =>
      m.content.toLowerCase().includes('json')
    );
    if (!hasJsonKeyword) {
      warnings.push('Prompt must contain the word "json" when using json_object response format');
    }
  }

  return warnings;
}

export function validatePrefixCompletion(messages: ChatMessage[]): string[] {
  const warnings: string[] = [];

  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.prefix) {
    if (lastMessage.role !== 'assistant') {
      warnings.push('Prefix completion requires the last message to have role "assistant"');
    }
  }

  return warnings;
}
