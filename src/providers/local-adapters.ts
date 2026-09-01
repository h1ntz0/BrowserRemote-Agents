import { ProviderAdapter, AIProviderConfig, ValidationResult, AIModelInfo, AIMessage, AIResponse } from './types';
import { OpenAIAdapter } from './openai-adapter';

export class OpenRouterAdapter implements ProviderAdapter {
  readonly providerType = 'openrouter';
  private openai = new OpenAIAdapter();

  async validate(config: AIProviderConfig): Promise<ValidationResult> {
    if (!config.apiKey) {
      return { valid: false, state: 'INVALID_KEY', message: 'OpenRouter API Key is required.' };
    }

    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${config.apiKey}` }
      });

      if (res.status === 401) {
        return { valid: false, state: 'INVALID_KEY', message: 'Invalid OpenRouter API Key.' };
      }
      if (!res.ok) {
        return { valid: false, state: 'NETWORK_ERROR', message: `OpenRouter returned status ${res.status}` };
      }

      return {
        valid: true,
        state: 'VALID',
        message: 'Successfully connected to OpenRouter.',
        availableModels: [
          { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', supportsVision: true, supportsToolCalling: true },
          { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', supportsVision: true, supportsToolCalling: true },
          { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', supportsVision: true, supportsToolCalling: true },
          { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', supportsToolCalling: true }
        ]
      };
    } catch (err: any) {
      return { valid: false, state: 'NETWORK_ERROR', message: `Connection failed: ${err.message}` };
    }
  }

  async listModels(config: AIProviderConfig): Promise<AIModelInfo[]> {
    const val = await this.validate(config);
    return val.availableModels || [];
  }

  async chat(
    config: AIProviderConfig,
    messages: AIMessage[],
    tools?: Array<{ name: string; description: string; parameters: Record<string, any> }>
  ): Promise<AIResponse> {
    const customConfig: AIProviderConfig = {
      ...config,
      endpoint: 'https://openrouter.ai/api/v1'
    };
    return this.openai.chat(customConfig, messages, tools);
  }
}

export class OllamaLocalAdapter implements ProviderAdapter {
  readonly providerType = 'ollama';
  private openai = new OpenAIAdapter();

  async validate(config: AIProviderConfig): Promise<ValidationResult> {
    const endpoint = config.endpoint || 'http://localhost:11434';
    try {
      const res = await fetch(`${endpoint}/api/tags`);
      if (!res.ok) {
        return { valid: false, state: 'INVALID_ENDPOINT', message: `Ollama endpoint returned status ${res.status}` };
      }

      const data = await res.json();
      const models: AIModelInfo[] = (data.models || []).map((m: any) => ({
        id: m.name,
        name: m.name,
        supportsToolCalling: true
      }));

      return {
        valid: true,
        state: 'VALID',
        message: 'Successfully connected to local Ollama instance.',
        availableModels: models
      };
    } catch (err: any) {
      return { valid: false, state: 'NETWORK_ERROR', message: `Cannot connect to Ollama at ${endpoint}. Is Ollama running? (${err.message})` };
    }
  }

  async listModels(config: AIProviderConfig): Promise<AIModelInfo[]> {
    const val = await this.validate(config);
    return val.availableModels || [{ id: 'llama3.2', name: 'llama3.2' }];
  }

  async chat(
    config: AIProviderConfig,
    messages: AIMessage[],
    tools?: Array<{ name: string; description: string; parameters: Record<string, any> }>
  ): Promise<AIResponse> {
    const endpoint = config.endpoint ? `${config.endpoint}/v1` : 'http://localhost:11434/v1';
    const customConfig: AIProviderConfig = {
      ...config,
      endpoint,
      apiKey: config.apiKey || 'ollama'
    };
    return this.openai.chat(customConfig, messages, tools);
  }
}
