import { ProviderAdapter, AIProviderConfig, ValidationResult, AIModelInfo, AIMessage, AIResponse } from './types';
import { OpenAIAdapter } from './openai-adapter';

export class OpenCodeZenAdapter implements ProviderAdapter {
  readonly providerType = 'opencode_zen';
  private openai = new OpenAIAdapter();

  private getEndpoint(config: AIProviderConfig): string {
    return config.endpoint || 'http://localhost:20128/v1';
  }

  async validate(config: AIProviderConfig): Promise<ValidationResult> {
    try {
      const endpoint = this.getEndpoint(config);
      const headers: Record<string, string> = {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

      const res = await fetch(`${endpoint}/models`, { headers });
      if (!res.ok && res.status !== 401) {
        return { valid: false, state: 'NETWORK_ERROR', message: `OpenCode Zen returned status ${res.status}` };
      }

      const text = await res.text();
      let models: AIModelInfo[] = [];
      try {
        const data = JSON.parse(text);
        models = (data.data || []).map((m: any) => ({
          id: m.id,
          name: m.id,
          supportsVision: true,
          supportsToolCalling: true
        }));
      } catch {}

      return {
        valid: true,
        state: 'VALID',
        message: 'Successfully connected to OpenCode Zen proxy / endpoint.',
        availableModels: models.length > 0 ? models : [
          { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet (Zen)', supportsVision: true, supportsToolCalling: true },
          { id: 'gpt-4o', name: 'GPT-4o (Zen)', supportsVision: true, supportsToolCalling: true },
          { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Zen)', supportsVision: true, supportsToolCalling: true }
        ]
      };
    } catch (err: any) {
      return {
        valid: false,
        state: 'NETWORK_ERROR',
        message: `Failed to connect to OpenCode Zen: ${err.message}`
      };
    }
  }

  async listModels(config: AIProviderConfig): Promise<AIModelInfo[]> {
    const val = await this.validate(config);
    return val.availableModels || [
      { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', supportsVision: true, supportsToolCalling: true },
      { id: 'gpt-4o', name: 'GPT-4o', supportsVision: true, supportsToolCalling: true }
    ];
  }

  async chat(
    config: AIProviderConfig,
    messages: AIMessage[],
    tools?: Array<{ name: string; description: string; parameters: Record<string, any> }>
  ): Promise<AIResponse> {
    const customConfig: AIProviderConfig = {
      ...config,
      endpoint: this.getEndpoint(config)
    };
    return this.openai.chat(customConfig, messages, tools);
  }
}

export class OpenCodeGoAdapter implements ProviderAdapter {
  readonly providerType = 'opencode_go';
  private openai = new OpenAIAdapter();

  private getEndpoint(config: AIProviderConfig): string {
    return config.endpoint || 'http://localhost:8080/v1';
  }

  async validate(config: AIProviderConfig): Promise<ValidationResult> {
    try {
      const endpoint = this.getEndpoint(config);
      const headers: Record<string, string> = {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

      const res = await fetch(`${endpoint}/models`, { headers });
      if (!res.ok && res.status !== 401) {
        return { valid: false, state: 'NETWORK_ERROR', message: `OpenCode Go returned status ${res.status}` };
      }

      return {
        valid: true,
        state: 'VALID',
        message: 'Successfully connected to OpenCode Go backend.',
        availableModels: [
          { id: 'default', name: 'Default Model (Go)', supportsVision: true, supportsToolCalling: true },
          { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet (Go)', supportsVision: true, supportsToolCalling: true },
          { id: 'gpt-4o', name: 'GPT-4o (Go)', supportsVision: true, supportsToolCalling: true }
        ]
      };
    } catch (err: any) {
      return {
        valid: false,
        state: 'NETWORK_ERROR',
        message: `Failed to connect to OpenCode Go: ${err.message}`
      };
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
      endpoint: this.getEndpoint(config)
    };
    return this.openai.chat(customConfig, messages, tools);
  }
}
