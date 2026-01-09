<script lang="ts">
  import { DeepSeekClient } from './api/providers/deepseek';
  import { OpenAIClient } from './api/providers/openai';
  import type {
    ChatMessage,
    ChatCompletionRequest,
    StreamChunk,
    ConnectionSettings,
    RequestParameters,
    FeatureToggles,
    FIMSettings,
    TestMessage,
    ResponseState,
    ExportToNodeData,
    ProviderType,
    FIMCompletionRequest
  } from './api/types';
  import {
    PROVIDERS,
    defaultConnectionSettings,
    defaultRequestParameters,
    defaultFeatureToggles,
    defaultFIMSettings,
    defaultResponseState,
    createTestMessage
  } from './api/types';

  let connection = $state<ConnectionSettings>({ ...defaultConnectionSettings });
  let parameters = $state<RequestParameters>({ ...defaultRequestParameters });
  let features = $state<FeatureToggles>({ ...defaultFeatureToggles });
  let fim = $state<FIMSettings>({ ...defaultFIMSettings });
  let systemPrompt = $state('');
  let messages = $state<TestMessage[]>([]);
  let response = $state<ResponseState>({ ...defaultResponseState });
  let userInput = $state('');
  let prefixInput = $state('');
  let showSettings = $state(true);
  let abortController: AbortController | null = null;

  let currentProvider = $derived(PROVIDERS[connection.provider]);

  let availableModels = $derived(
    connection.provider === 'custom'
      ? connection.model ? [connection.model] : []
      : currentProvider.models
  );

  let isThinkingMode = $derived(
    features.thinkingMode && currentProvider.supportsThinkingMode
  );

  let needsBetaEndpoint = $derived(
    (features.prefixCompletion || features.fimMode) &&
    connection.provider === 'deepseek'
  );

  let warnings = $derived.by(() => {
    const w: string[] = [];

    if (isThinkingMode) {
      if (parameters.temperature !== 0.7) w.push('Temperature is ignored in thinking mode');
      if (parameters.topP !== 1) w.push('Top P is ignored in thinking mode');
    }

    if (features.jsonMode) {
      const allContent = systemPrompt + messages.map(m => m.content).join('') + userInput;
      if (!allContent.toLowerCase().includes('json')) {
        w.push('Prompt must contain "json" for JSON mode');
      }
    }

    if (features.prefixCompletion && !currentProvider.supportsPrefixCompletion) {
      w.push(`${currentProvider.name} does not support prefix completion`);
    }

    if (features.fimMode && !currentProvider.supportsFIM) {
      w.push(`${currentProvider.name} does not support FIM mode`);
    }

    if (features.prefixCompletion && !prefixInput.trim()) {
      w.push('Prefix completion requires assistant prefix content');
    }

    return w;
  });

  function handleProviderChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const provider = target.value as ProviderType;
    connection.provider = provider;
    const config = PROVIDERS[provider];
    connection.model = config.defaultModel;
    connection.baseUrl = provider === 'custom' ? '' : config.baseUrl;
  }

  function getClient(): DeepSeekClient | OpenAIClient {
    const isCustom = connection.provider === 'custom';

    if (connection.provider === 'deepseek') {
      const config: { apiKey: string; useBeta?: boolean; baseUrl?: string } = {
        apiKey: connection.apiKey,
        useBeta: needsBetaEndpoint
      };
      if (isCustom) {
        config.baseUrl = connection.baseUrl;
      }
      return new DeepSeekClient(config);
    }

    const baseUrl = isCustom ? connection.baseUrl : 'https://api.openai.com/v1';
    return new OpenAIClient({
      apiKey: connection.apiKey,
      baseUrl
    });
  }

  function buildRequest(): ChatCompletionRequest {
    const req_messages: ChatMessage[] = [];

    if (systemPrompt.trim()) {
      req_messages.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      req_messages.push({
        role: msg.role,
        content: msg.content,
        ...(msg.reasoning_content ? { reasoning_content: msg.reasoning_content } : {})
      });
    }

    if (userInput.trim() && !features.fimMode) {
      req_messages.push({ role: 'user', content: userInput });
    }

    if (features.prefixCompletion && prefixInput.trim()) {
      req_messages.push({
        role: 'assistant',
        content: prefixInput,
        prefix: true
      });
    }

    const request: ChatCompletionRequest = {
      model: connection.model,
      messages: req_messages,
      max_tokens: parameters.maxTokens,
      stream: features.streaming
    };

    if (!isThinkingMode) {
      request.temperature = parameters.temperature;
      request.top_p = parameters.topP;
      request.presence_penalty = parameters.presencePenalty;
      request.frequency_penalty = parameters.frequencyPenalty;
    }

    if (features.thinkingMode && connection.provider === 'deepseek') {
      request.thinking = { type: 'enabled' as const };
    }

    if (features.jsonMode) {
      request.response_format = { type: 'json_object' as const };
    }

    if (parameters.stopSequences.length > 0) {
      request.stop = parameters.stopSequences;
    }

    return request;
  }

  async function sendRequest() {
    if (!connection.apiKey) {
      response = { ...defaultResponseState, status: 'error', error: 'API key is required' };
      return;
    }

    if (!connection.baseUrl && connection.provider === 'custom') {
      response = { ...defaultResponseState, status: 'error', error: 'Base URL is required for custom provider' };
      return;
    }

    const client = getClient();
    const request = buildRequest();
    const startTime = Date.now();

    if (userInput.trim() && !features.fimMode) {
      messages = [...messages, createTestMessage('user', userInput)];
      userInput = '';
    }

    response = {
      ...defaultResponseState,
      status: features.streaming ? 'streaming' : 'loading'
    };

    abortController = new AbortController();

    try {
      if (features.fimMode) {
        const fimRequest: FIMCompletionRequest = {
          model: connection.model,
          prompt: fim.prefix,
          suffix: fim.suffix || undefined,
          max_tokens: parameters.maxTokens,
          temperature: parameters.temperature
        };

        if ('fimCompletion' in client) {
          const fimResponse = await (client as DeepSeekClient).fimCompletion(fimRequest);
          response = {
            status: 'success',
            content: fimResponse.choices[0]?.text ?? '',
            reasoningContent: '',
            error: null,
            usage: fimResponse.usage,
            responseTime: Date.now() - startTime
          };
        } else {
          throw new Error('FIM mode is not supported by this provider');
        }
      } else if (features.streaming) {
        let content = '';
        let reasoningContent = '';

        for await (const chunk of client.chatCompletionStream(request)) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            content += delta.content;
          }
          if (delta?.reasoning_content) {
            reasoningContent += delta.reasoning_content;
          }

          response = {
            status: 'streaming',
            content,
            reasoningContent,
            error: null,
            usage: chunk.usage ?? null,
            responseTime: Date.now() - startTime
          };
        }

        response = { ...response, status: 'success' };

        if (content) {
          messages = [...messages, createTestMessage('assistant', content, {
            reasoning_content: reasoningContent || undefined
          })];
        }
      } else {
        const chatResponse = await client.chatCompletion(request);
        const choice = chatResponse.choices[0];

        response = {
          status: 'success',
          content: choice?.message.content ?? '',
          reasoningContent: choice?.message.reasoning_content ?? '',
          error: null,
          usage: chatResponse.usage,
          responseTime: Date.now() - startTime
        };

        if (choice?.message.content) {
          messages = [...messages, createTestMessage('assistant', choice.message.content, {
            reasoning_content: choice.message.reasoning_content
          })];
        }
      }
    } catch (err) {
      response = {
        ...defaultResponseState,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        responseTime: Date.now() - startTime
      };
    }

    abortController = null;
  }

  function cancelRequest() {
    abortController?.abort();
    response = { ...response, status: 'idle' };
  }

  function clearHistory() {
    messages = [];
    response = { ...defaultResponseState };
  }

  function deleteMessage(id: string) {
    messages = messages.filter(m => m.id !== id);
  }

  function exportToNode(): ExportToNodeData {
    return {
      systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        reasoning_content: m.reasoning_content
      })),
      model: connection.model,
      parameters: { ...parameters },
      features: { ...features },
      lastResponse: response.content ? {
        content: response.content,
        reasoningContent: response.reasoningContent || undefined
      } : null
    };
  }

  function handleExportToNode() {
    const data = exportToNode();
    console.log('Export to Node:', data);
    alert('Exported! Check console for data.\n\nIntegration with workflow coming soon.');
  }

  function addStopSequence() {
    const seq = prompt('Enter stop sequence:');
    if (seq) {
      parameters.stopSequences = [...parameters.stopSequences, seq];
    }
  }

  function removeStopSequence(index: number) {
    parameters.stopSequences = parameters.stopSequences.filter((_, i) => i !== index);
  }
</script>

<div class="api-test">
  <div class="header">
    <h2>LLM API Test</h2>
    <div class="header-actions">
      <button class="btn-icon" onclick={() => showSettings = !showSettings}>
        {showSettings ? '◀' : '▶'} Settings
      </button>
      <button class="btn-primary" onclick={handleExportToNode} disabled={messages.length === 0}>
        Export to Node
      </button>
    </div>
  </div>

  <div class="main-layout" class:collapsed={!showSettings}>
    {#if showSettings}
      <div class="settings-panel">
        <section class="settings-section">
          <h3>Provider</h3>
          <div class="form-group">
            <label for="provider">Provider</label>
            <select id="provider" value={connection.provider} onchange={handleProviderChange}>
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </section>

        <section class="settings-section">
          <h3>Connection</h3>
          <div class="form-group">
            <label for="api-key">API Key</label>
            <input
              id="api-key"
              type="password"
              bind:value={connection.apiKey}
              placeholder="sk-..."
            />
          </div>
          <div class="form-group">
            <label for="model">Model</label>
            <select id="model" bind:value={connection.model}>
              {#each availableModels as model}
                <option value={model}>{model}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label for="base-url">Base URL</label>
            {#if connection.provider === 'custom'}
              <input
                type="text"
                bind:value={connection.baseUrl}
                placeholder="https://api.example.com/v1"
              />
            {:else}
              <input
                type="text"
                value={currentProvider.baseUrl}
                disabled
                class="disabled"
              />
              <span class="hint">{currentProvider.name} endpoint</span>
            {/if}
          </div>
        </section>

        <section class="settings-section">
          <h3>Features</h3>
          <label class="toggle">
            <input type="checkbox" bind:checked={features.streaming} />
            <span>Streaming</span>
          </label>
          <label class="toggle">
            <input type="checkbox" bind:checked={features.thinkingMode} disabled={!currentProvider.supportsThinkingMode} />
            <span>Thinking Mode {currentProvider.supportsThinkingMode ? '' : '(unsupported)'}</span>
          </label>
          <label class="toggle">
            <input type="checkbox" bind:checked={features.jsonMode} />
            <span>JSON Mode</span>
          </label>
          <label class="toggle">
            <input type="checkbox" bind:checked={features.prefixCompletion} disabled={!currentProvider.supportsPrefixCompletion} />
            <span>Prefix Completion {currentProvider.supportsPrefixCompletion ? '' : '(unsupported)'}</span>
          </label>
          <label class="toggle">
            <input type="checkbox" bind:checked={features.fimMode} disabled={!currentProvider.supportsFIM} />
            <span>FIM Mode {currentProvider.supportsFIM ? '' : '(unsupported)'}</span>
          </label>
        </section>

        <section class="settings-section">
          <h3>Parameters</h3>
          <div class="form-group">
            <label for="temperature">
              Temperature: {parameters.temperature.toFixed(1)}
            </label>
            <input
              id="temperature"
              type="range"
              min="0"
              max="2"
              step="0.1"
              bind:value={parameters.temperature}
              disabled={isThinkingMode}
            />
          </div>
          <div class="form-group">
            <label for="max-tokens">Max Tokens: {parameters.maxTokens}</label>
            <input
              id="max-tokens"
              type="range"
              min="256"
              max="8192"
              step="256"
              bind:value={parameters.maxTokens}
            />
          </div>
          <div class="form-group">
            <label for="top-p">Top P: {parameters.topP.toFixed(2)}</label>
            <input
              id="top-p"
              type="range"
              min="0"
              max="1"
              step="0.05"
              bind:value={parameters.topP}
              disabled={isThinkingMode}
            />
          </div>
          <div class="form-group">
            <label for="stop-sequences">Stop Sequences</label>
            <div class="stop-sequences">
              {#each parameters.stopSequences as seq, i}
                <span class="tag">
                  {seq}
                  <button onclick={() => removeStopSequence(i)}>×</button>
                </span>
              {/each}
              <button class="btn-small" onclick={addStopSequence}>+ Add</button>
            </div>
          </div>
        </section>

        {#if warnings.length > 0}
          <section class="warnings">
            {#each warnings as warning}
              <div class="warning">{warning}</div>
            {/each}
          </section>
        {/if}
      </div>
    {/if}

    <div class="chat-panel">
      <div class="system-prompt">
        <label for="system-prompt">System Prompt</label>
        <textarea
          id="system-prompt"
          bind:value={systemPrompt}
          placeholder="You are a helpful assistant..."
          rows="3"
        ></textarea>
      </div>

      {#if features.fimMode}
        <div class="fim-panel">
          <div class="form-group">
            <label for="fim-prefix">Prefix (before cursor)</label>
            <textarea
              id="fim-prefix"
              bind:value={fim.prefix}
              placeholder="Code before the insertion point..."
              rows="4"
            ></textarea>
          </div>
          <div class="fim-cursor">▌ cursor position</div>
          <div class="form-group">
            <label for="fim-suffix">Suffix (after cursor)</label>
            <textarea
              id="fim-suffix"
              bind:value={fim.suffix}
              placeholder="Code after the insertion point..."
              rows="4"
            ></textarea>
          </div>
        </div>
      {:else}
        <div class="messages">
          {#each messages as msg (msg.id)}
            <div class="message {msg.role}">
              <div class="message-header">
                <span class="role">{msg.role}</span>
                <button class="btn-delete" onclick={() => deleteMessage(msg.id)}>×</button>
              </div>
              {#if msg.reasoning_content}
                <details class="reasoning">
                  <summary>Thinking...</summary>
                  <pre>{msg.reasoning_content}</pre>
                </details>
              {/if}
              <div class="content">{msg.content}</div>
            </div>
          {/each}

          {#if response.status === 'streaming' || response.status === 'loading'}
            <div class="message assistant streaming">
              <div class="message-header">
                <span class="role">assistant</span>
                <span class="status">{response.status}...</span>
              </div>
              {#if response.reasoningContent}
                <details class="reasoning" open>
                  <summary>Thinking...</summary>
                  <pre>{response.reasoningContent}</pre>
                </details>
              {/if}
              <div class="content">
                {response.content || '...'}
                <span class="cursor">▌</span>
              </div>
            </div>
          {/if}
        </div>

        {#if features.prefixCompletion}
          <div class="prefix-input">
            <label for="prefix">Assistant Prefix</label>
            <input
              id="prefix"
              type="text"
              bind:value={prefixInput}
              placeholder="Force response to start with..."
            />
          </div>
        {/if}

        <div class="input-area">
          <textarea
            bind:value={userInput}
            placeholder="Type your message..."
            rows="3"
            onkeydown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                sendRequest();
              }
            }}
          ></textarea>
          <div class="input-actions">
            <button class="btn-secondary" onclick={clearHistory}>Clear</button>
            {#if response.status === 'streaming' || response.status === 'loading'}
              <button class="btn-danger" onclick={cancelRequest}>Cancel</button>
            {:else}
              <button
                class="btn-primary"
                onclick={sendRequest}
                disabled={!connection.apiKey || (connection.provider === 'custom' && !connection.baseUrl)}
              >
                Send (Ctrl+Enter)
              </button>
            {/if}
          </div>
        </div>
      {/if}

      {#if response.status === 'success' || response.status === 'error'}
        <div class="response-info">
          {#if response.error}
            <div class="error">{response.error}</div>
          {/if}
          {#if response.usage}
            <div class="usage">
              Tokens: {response.usage.prompt_tokens} prompt +
              {response.usage.completion_tokens} completion =
              {response.usage.total_tokens} total
              {#if response.usage.prompt_cache_hit_tokens}
                (cache hit: {response.usage.prompt_cache_hit_tokens})
              {/if}
            </div>
          {/if}
          {#if response.responseTime}
            <div class="time">Response time: {(response.responseTime / 1000).toFixed(2)}s</div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .api-test {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0f0f1a;
    color: #e0e0e0;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    border-bottom: 1px solid #2d2d44;
  }

  .header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
  }

  .header-actions {
    display: flex;
    gap: 12px;
  }

  .main-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    flex: 1;
    overflow: hidden;
  }

  .main-layout.collapsed {
    grid-template-columns: 1fr;
  }

  .settings-panel {
    padding: 16px;
    border-right: 1px solid #2d2d44;
    overflow-y: auto;
    background: #12121f;
  }

  .settings-section {
    margin-bottom: 24px;
  }

  .settings-section h3 {
    margin: 0 0 12px 0;
    font-size: 13px;
    font-weight: 600;
    color: #8b8b9e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .form-group {
    margin-bottom: 12px;
  }

  .form-group label {
    display: block;
    margin-bottom: 4px;
    font-size: 13px;
    color: #a0a0b0;
  }

  .form-group input[type="text"],
  .form-group input[type="password"],
  .form-group select {
    width: 100%;
    padding: 8px 12px;
    background: #1a1a2e;
    border: 1px solid #2d2d44;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 13px;
  }

  .form-group input.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .form-group input[type="range"] {
    width: 100%;
    accent-color: #6366f1;
  }

  .hint {
    font-size: 11px;
    color: #666;
    margin-top: 4px;
    display: block;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    cursor: pointer;
    font-size: 13px;
  }

  .toggle input {
    accent-color: #6366f1;
  }

  .toggle input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .stop-sequences {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: #2d2d44;
    border-radius: 4px;
    font-size: 12px;
  }

  .tag button {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    padding: 0;
    font-size: 14px;
  }

  .warnings {
    margin-top: 16px;
  }

  .warning {
    padding: 8px 12px;
    background: #3d2d1a;
    border-left: 3px solid #f59e0b;
    border-radius: 0 4px 4px 0;
    font-size: 12px;
    color: #fbbf24;
    margin-bottom: 8px;
  }

  .chat-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .system-prompt {
    padding: 16px;
    border-bottom: 1px solid #2d2d44;
  }

  .system-prompt label {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    color: #8b8b9e;
  }

  .system-prompt textarea,
  .input-area textarea {
    width: 100%;
    padding: 12px;
    background: #1a1a2e;
    border: 1px solid #2d2d44;
    border-radius: 8px;
    color: #e0e0e0;
    font-size: 14px;
    resize: vertical;
    font-family: inherit;
  }

  .fim-panel {
    padding: 16px;
    border-bottom: 1px solid #2d2d44;
  }

  .fim-panel textarea {
    width: 100%;
    padding: 12px;
    background: #1a1a2e;
    border: 1px solid #2d2d44;
    border-radius: 8px;
    color: #e0e0e0;
    font-size: 13px;
    font-family: monospace;
    resize: vertical;
  }

  .fim-cursor {
    padding: 8px 12px;
    background: #2d2d44;
    color: #6366f1;
    font-size: 12px;
    text-align: center;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .message {
    margin-bottom: 16px;
    padding: 12px 16px;
    border-radius: 8px;
  }

  .message.user {
    background: #1a2a3a;
    margin-left: 32px;
  }

  .message.assistant {
    background: #1a1a2e;
    margin-right: 32px;
  }

  .message.system {
    background: #2a1a2a;
    font-style: italic;
  }

  .message.streaming {
    border: 1px solid #6366f1;
  }

  .message-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .role {
    font-size: 12px;
    font-weight: 600;
    color: #6366f1;
    text-transform: uppercase;
  }

  .status {
    font-size: 12px;
    color: #8b8b9e;
  }

  .btn-delete {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    font-size: 16px;
    padding: 0;
  }

  .btn-delete:hover {
    color: #ef4444;
  }

  .reasoning {
    margin-bottom: 8px;
    padding: 8px;
    background: #12121f;
    border-radius: 4px;
    font-size: 13px;
  }

  .reasoning summary {
    cursor: pointer;
    color: #8b8b9e;
    font-size: 12px;
  }

  .reasoning pre {
    margin: 8px 0 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: #a0a0b0;
    font-size: 12px;
  }

  .content {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
  }

  .cursor {
    animation: blink 1s infinite;
    color: #6366f1;
  }

  @keyframes blink {
    50% { opacity: 0; }
  }

  .prefix-input {
    padding: 12px 16px;
    border-bottom: 1px solid #2d2d44;
  }

  .prefix-input label {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: #8b8b9e;
  }

  .prefix-input input {
    width: 100%;
    padding: 8px 12px;
    background: #1a1a2e;
    border: 1px solid #2d2d44;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 13px;
  }

  .input-area {
    padding: 16px;
    border-top: 1px solid #2d2d44;
  }

  .input-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }

  .response-info {
    padding: 12px 16px;
    background: #12121f;
    border-top: 1px solid #2d2d44;
    font-size: 12px;
  }

  .response-info .error {
    color: #ef4444;
    margin-bottom: 4px;
  }

  .response-info .usage {
    color: #8b8b9e;
  }

  .response-info .time {
    color: #8b8b9e;
    margin-top: 4px;
  }

  button {
    font-family: inherit;
  }

  .btn-primary {
    padding: 8px 16px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    padding: 8px 16px;
    background: #2d2d44;
    border: none;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-secondary:hover {
    background: #3d3d5c;
  }

  .btn-danger {
    padding: 8px 16px;
    background: #dc2626;
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-icon {
    padding: 6px 12px;
    background: transparent;
    border: 1px solid #2d2d44;
    border-radius: 6px;
    color: #a0a0b0;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-icon:hover {
    background: #2d2d44;
  }

  .btn-small {
    padding: 2px 8px;
    background: #2d2d44;
    border: none;
    border-radius: 4px;
    color: #a0a0b0;
    font-size: 12px;
    cursor: pointer;
  }
</style>
