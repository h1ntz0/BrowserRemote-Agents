import { ProviderAdapter, AIProviderConfig, ValidationResult, AIModelInfo, AIMessage, AIResponse } from './types';
import { OpenAIAdapter } from './openai-adapter';

export class NineRouterAdapter implements ProviderAdapter {
  readonly providerType = 'nine_router';
  private openai = new OpenAIAdapter();

  private getEndpoint(config: AIProviderConfig): string {
    return config.endpoint || 'https://api.9router.com/v1';
  }

  async validate(config: AIProviderConfig): Promise<ValidationResult> {
    if (!config.apiKey) {
      return { valid: false, state: 'INVALID_KEY', message: '9router API Key is required.' };
    }

    try {
      const endpoint = this.getEndpoint(config);
      const res = await fetch(`${endpoint}/models`, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`
        }
      });

      if (res.status === 401) {
        return { valid: false, state: 'INVALID_KEY', message: 'Invalid 9router API Key.' };
      }
      if (res.status === 429) {
        return { valid: false, state: 'RATE_LIMITED', message: '9router rate limit or quota exceeded.' };
      }
      if (!res.ok) {
        return { valid: false, state: 'NETWORK_ERROR', message: `9router returned status ${res.status}` };
      }

      const data = await res.json();
      const models: AIModelInfo[] = (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.id,
        supportsVision: true,
        supportsToolCalling: true
      }));

      return {
        valid: true,
        state: 'VALID',
        message: 'Successfully connected to 9router API.',
        availableModels: models.length > 0 ? models : [
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', supportsVision: true, supportsToolCalling: true },
          { id: 'gpt-4o', name: 'GPT-4o', supportsVision: true, supportsToolCalling: true },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', supportsVision: true, supportsToolCalling: true },
          { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', supportsVision: true, supportsToolCalling: true }
        ]
      };
    } catch (err: any) {
      return {
        valid: false,
        state: 'NETWORK_ERROR',
        message: `Connection failed: ${err.message}`
      };
    }
  }

  async listModels(config: AIProviderConfig): Promise<AIModelInfo[]> {
    const val = await this.validate(config);
    return val.availableModels || [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', supportsVision: true, supportsToolCalling: true },
      { id: 'gpt-4o', name: 'GPT-4o', supportsVision: true, supportsToolCalling: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', supportsVision: true, supportsToolCalling: true },
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', supportsVision: true, supportsToolCalling: true }
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
