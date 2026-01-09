/**
 * Generic LLM Client Interface
 * Abstract interface for OpenAI-compatible API clients
 */

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  FIMCompletionRequest,
  FIMCompletionResponse,
  StreamChunk,
  ChatMessage,
  UsageInfo
} from './types';

// ============================================================================
// Client Interface
// ============================================================================

export interface LLMClient {
  /**
   * Create a non-streaming chat completion
   */
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;

  /**
   * Create a streaming chat completion
   */
  chatCompletionStream(request: ChatCompletionRequest): AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * Create a FIM completion (if supported)
   */
  fimCompletion?(request: FIMCompletionRequest): Promise<FIMCompletionResponse>;

  /**
   * Create a streaming FIM completion (if supported)
   */
  fimCompletionStream?(request: FIMCompletionRequest): AsyncGenerator<{ text: string }, void, unknown>;
}

export interface LLMClientConfig {
  apiKey: string;
  baseUrl?: string;
}

// ============================================================================
// Streaming Helper
// ============================================================================

export interface StreamHandlerOptions {
  onContent?: (content: string) => void;
  onReasoning?: (reasoning: string) => void;
  onUsage?: (usage: UsageInfo) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export async function* handleStream<T>(
  stream: AsyncGenerator<T, void, unknown>,
  options: StreamHandlerOptions
): AsyncGenerator<T, void, unknown> {
  try {
    for await (const chunk of stream) {
      yield chunk;
    }
    options.onComplete?.();
  } catch (err) {
    options.onError?.(err instanceof Error ? err : new Error(String(err)));
  }
}

// ============================================================================
// Request Builder
// ============================================================================

export function buildChatRequest(
  messages: ChatMessage[],
  model: string,
  options: Partial<ChatCompletionRequest> = {}
): ChatCompletionRequest {
  return {
    model,
    messages,
    max_tokens: 4096,
    temperature: 0.7,
    ...options
  };
}

// ============================================================================
// Response Parsers
// ============================================================================

export function extractContent(response: ChatCompletionResponse): string {
  return response.choices[0]?.message.content ?? '';
}

export function extractReasoningContent(response: ChatCompletionResponse): string {
  return response.choices[0]?.message.reasoning_content ?? '';
}

export function extractUsage(response: ChatCompletionResponse): UsageInfo {
  return response.usage;
}

export function extractStreamContent(chunk: StreamChunk): string {
  return chunk.choices[0]?.delta.content ?? '';
}

export function extractStreamReasoning(chunk: StreamChunk): string {
  return chunk.choices[0]?.delta.reasoning_content ?? '';
}
