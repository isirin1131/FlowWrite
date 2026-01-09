/**
 * DeepSeek API Client
 *
 * Supports all DeepSeek API features:
 * - Multi-round chat
 * - Thinking mode (deepseek-reasoner)
 * - Chat prefix completion (beta)
 * - FIM completion (beta)
 * - JSON mode
 */

// ============================================================================
// Types
// ============================================================================

export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  /** For assistant messages in prefix completion mode */
  prefix?: boolean;
  /** For reasoner model: chain of thought content */
  reasoning_content?: string;
}

export interface ThinkingConfig {
  type: 'enabled' | 'disabled';
}

export interface ResponseFormat {
  type: 'text' | 'json_object';
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  /** Enable thinking mode */
  thinking?: ThinkingConfig;
  /** Temperature (0-2), not supported in thinking mode */
  temperature?: number;
  /** Max tokens to generate */
  max_tokens?: number;
  /** Top P sampling */
  top_p?: number;
  /** Presence penalty (-2 to 2) */
  presence_penalty?: number;
  /** Frequency penalty (-2 to 2) */
  frequency_penalty?: number;
  /** Stop sequences */
  stop?: string[];
  /** Enable streaming */
  stream?: boolean;
  /** Response format (text or json_object) */
  response_format?: ResponseFormat;
}

export interface FIMCompletionRequest {
  model: string;
  /** Text before the cursor */
  prompt: string;
  /** Text after the cursor (optional) */
  suffix?: string;
  /** Max tokens to generate */
  max_tokens?: number;
  /** Temperature */
  temperature?: number;
  /** Stop sequences */
  stop?: string[];
  /** Enable streaming */
  stream?: boolean;
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string;
    reasoning_content?: string;
  };
  finish_reason: 'stop' | 'length' | 'content_filter' | null;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: UsageInfo;
}

export interface FIMCompletionChoice {
  index: number;
  text: string;
  finish_reason: 'stop' | 'length' | null;
}

export interface FIMCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: FIMCompletionChoice[];
  usage: UsageInfo;
}

export interface StreamDelta {
  role?: 'assistant';
  content?: string;
  reasoning_content?: string;
}

export interface StreamChoice {
  index: number;
  delta: StreamDelta;
  finish_reason: 'stop' | 'length' | 'content_filter' | null;
}

export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: StreamChoice[];
  usage?: UsageInfo;
}

// ============================================================================
// API Client
// ============================================================================

export interface DeepSeekClientConfig {
  apiKey: string;
  /** Use beta endpoint for prefix/FIM features */
  useBeta?: boolean;
  /** Custom base URL */
  baseUrl?: string;
}

const BASE_URL = 'https://api.deepseek.com';
const BETA_URL = 'https://api.deepseek.com/beta';

export class DeepSeekClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: DeepSeekClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? (config.useBeta ? BETA_URL : BASE_URL);
  }

  /**
   * Create a chat completion
   */
  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ ...request, stream: false })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message ?? `API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Create a streaming chat completion
   */
  async *chatCompletionStream(request: ChatCompletionRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
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

  /**
   * Create a FIM completion (beta)
   */
  async fimCompletion(request: FIMCompletionRequest): Promise<FIMCompletionResponse> {
    const betaClient = new DeepSeekClient({ apiKey: this.apiKey, useBeta: true });

    const response = await fetch(`${BETA_URL}/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${betaClient.apiKey}`
      },
      body: JSON.stringify({ ...request, stream: false })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message ?? `API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Create a streaming FIM completion (beta)
   */
  async *fimCompletionStream(request: FIMCompletionRequest): AsyncGenerator<{ text: string }, void, unknown> {
    const response = await fetch(`${BETA_URL}/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
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
// Helper Functions
// ============================================================================

/**
 * Create a chat completion request with common defaults
 */
export function createChatRequest(
  messages: ChatMessage[],
  options: Partial<ChatCompletionRequest> = {}
): ChatCompletionRequest {
  return {
    model: options.model ?? 'deepseek-chat',
    messages,
    max_tokens: options.max_tokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    ...options
  };
}

/**
 * Check if thinking mode is available for the request
 * (some parameters are not supported in thinking mode)
 */
export function validateThinkingMode(request: ChatCompletionRequest): string[] {
  const warnings: string[] = [];

  if (request.thinking?.type === 'enabled' || request.model === 'deepseek-reasoner') {
    if (request.temperature !== undefined) {
      warnings.push('temperature is not supported in thinking mode');
    }
    if (request.top_p !== undefined) {
      warnings.push('top_p is not supported in thinking mode');
    }
    if (request.presence_penalty !== undefined) {
      warnings.push('presence_penalty is not supported in thinking mode');
    }
    if (request.frequency_penalty !== undefined) {
      warnings.push('frequency_penalty is not supported in thinking mode');
    }
  }

  return warnings;
}

/**
 * Check if JSON mode is properly configured
 */
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

/**
 * Check if prefix completion is properly configured
 */
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
