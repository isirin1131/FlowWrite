/**
 * Generic LLM API Types
 * Provider-agnostic types for OpenAI-compatible APIs
 */

// ============================================================================
// Message Types
// ============================================================================

export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  prefix?: boolean;
  reasoning_content?: string;
}

export interface ReasoningMessage {
  role: 'assistant';
  content: string;
  reasoning_content: string;
}

// ============================================================================
// Request Types
// ============================================================================

export interface ResponseFormat {
  type: 'text' | 'json_object';
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  response_format?: ResponseFormat;
  [key: string]: unknown;
}

export interface FIMCompletionRequest {
  model: string;
  prompt: string;
  suffix?: string;
  max_tokens?: number;
  temperature?: number;
  stop?: string | string[];
  stream?: boolean;
  [key: string]: unknown;
}

// ============================================================================
// Response Types
// ============================================================================

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
  finish_reason: string | null;
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
  finish_reason: string | null;
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
  finish_reason: string | null;
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
// Provider Configuration
// ============================================================================

export type ProviderType = 'deepseek' | 'openai' | 'anthropic' | 'custom';

export interface ProviderConfig {
  type: ProviderType;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  supportsThinkingMode: boolean;
  supportsFIM: boolean;
  supportsPrefixCompletion: boolean;
}

export const PROVIDERS: Record<ProviderType, Omit<ProviderConfig, 'type'>> = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    supportsThinkingMode: true,
    supportsFIM: true,
    supportsPrefixCompletion: true
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    supportsThinkingMode: false,
    supportsFIM: false,
    supportsPrefixCompletion: false
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-haiku-3-20250514'],
    supportsThinkingMode: false,
    supportsFIM: false,
    supportsPrefixCompletion: false
  },
  custom: {
    name: 'Custom',
    baseUrl: '',
    defaultModel: '',
    models: [],
    supportsThinkingMode: true,
    supportsFIM: true,
    supportsPrefixCompletion: true
  }
};

// ============================================================================
// Connection Settings
// ============================================================================

export interface ConnectionSettings {
  provider: ProviderType;
  customName: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const defaultConnectionSettings: ConnectionSettings = {
  provider: 'deepseek',
  customName: '',
  apiKey: '',
  baseUrl: '',
  model: 'deepseek-chat'
};

// ============================================================================
// Request Parameters
// ============================================================================

export interface RequestParameters {
  temperature: number;
  maxTokens: number;
  topP: number;
  presencePenalty: number;
  frequencyPenalty: number;
  stopSequences: string[];
}

export const defaultRequestParameters: RequestParameters = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
  presencePenalty: 0,
  frequencyPenalty: 0,
  stopSequences: []
};

// ============================================================================
// Feature Toggles
// ============================================================================

export interface FeatureToggles {
  thinkingMode: boolean;
  prefixCompletion: boolean;
  jsonMode: boolean;
  fimMode: boolean;
  streaming: boolean;
}

export const defaultFeatureToggles: FeatureToggles = {
  thinkingMode: false,
  prefixCompletion: false,
  jsonMode: false,
  fimMode: false,
  streaming: true
};

// ============================================================================
// FIM Settings
// ============================================================================

export interface FIMSettings {
  prefix: string;
  suffix: string;
}

export const defaultFIMSettings: FIMSettings = {
  prefix: '',
  suffix: ''
};

// ============================================================================
// Messages
// ============================================================================

export interface TestMessage extends ChatMessage {
  id: string;
  timestamp: number;
}

export function createTestMessage(
  role: ChatMessage['role'],
  content: string,
  options: Partial<TestMessage> = {}
): TestMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
    ...options
  };
}

// ============================================================================
// Response State
// ============================================================================

export type ResponseStatus = 'idle' | 'loading' | 'streaming' | 'success' | 'error';

export interface ResponseState {
  status: ResponseStatus;
  content: string;
  reasoningContent: string;
  error: string | null;
  usage: UsageInfo | null;
  responseTime: number | null;
}

export const defaultResponseState: ResponseState = {
  status: 'idle',
  content: '',
  reasoningContent: '',
  error: null,
  usage: null,
  responseTime: null
};

// ============================================================================
// Full API Test State
// ============================================================================

export interface ApiTestState {
  connection: ConnectionSettings;
  parameters: RequestParameters;
  features: FeatureToggles;
  fim: FIMSettings;
  systemPrompt: string;
  messages: TestMessage[];
  response: ResponseState;
}

export const defaultApiTestState: ApiTestState = {
  connection: defaultConnectionSettings,
  parameters: defaultRequestParameters,
  features: defaultFeatureToggles,
  fim: defaultFIMSettings,
  systemPrompt: '',
  messages: [],
  response: defaultResponseState
};

// ============================================================================
// Export to Node
// ============================================================================

export interface ExportToNodeData {
  systemPrompt: string;
  messages: ChatMessage[];
  model: string;
  parameters: RequestParameters;
  features: FeatureToggles;
  lastResponse: {
    content: string;
    reasoningContent?: string;
  } | null;
}
