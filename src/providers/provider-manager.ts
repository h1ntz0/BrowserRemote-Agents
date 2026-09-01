import { AIProviderType, ProviderAdapter, AIProviderConfig, ValidationResult } from './types';
import { OpenAIAdapter } from './openai-adapter';
import { AnthropicAdapter } from './anthropic-adapter';
import { GoogleGeminiAdapter } from './google-adapter';
import { OpenRouterAdapter, OllamaLocalAdapter } from './local-adapters';
import { NineRouterAdapter } from './nine-router-adapter';
import { OpenCodeZenAdapter, OpenCodeGoAdapter } from './opencode-adapters';

export class ProviderManager {
  private adapters: Map<AIProviderType, ProviderAdapter> = new Map();

  constructor() {
    this.register(new OpenCodeZenAdapter());
    this.register(new OpenCodeGoAdapter());
    this.register(new NineRouterAdapter());
    this.register(new OpenAIAdapter());
    this.register(new AnthropicAdapter());
    this.register(new GoogleGeminiAdapter());
    this.register(new OpenRouterAdapter());
    this.register(new OllamaLocalAdapter());
  }

  public register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.providerType, adapter);
  }

  public getAdapter(providerType: AIProviderType): ProviderAdapter {
    const adapter = this.adapters.get(providerType);
    if (!adapter) {
      // Fallback to openai compatible
      return this.adapters.get('openai')!;
    }
    return adapter;
  }

  public async validateConfig(config: AIProviderConfig): Promise<ValidationResult> {
    const adapter = this.getAdapter(config.provider);
    return adapter.validate(config);
  }
}
