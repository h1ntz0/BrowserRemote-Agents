export type AIProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama' | 'custom';

export interface AIModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  supportsVision?: boolean;
  supportsToolCalling?: boolean;
}

export interface AIProviderConfig {
  provider: AIProviderType;
  endpoint?: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ValidationResult {
  valid: boolean;
  state: 'VALID' | 'INVALID_KEY' | 'INVALID_ENDPOINT' | 'MODEL_UNAVAILABLE' | 'RATE_LIMITED' | 'NETWORK_ERROR';
  message: string;
  availableModels?: AIModelInfo[];
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  toolCallId?: string;
}

export interface AIResponse {
  text?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface ProviderAdapter {
  readonly providerType: AIProviderType;
  validate(config: AIProviderConfig): Promise<ValidationResult>;
  listModels(config: AIProviderConfig): Promise<AIModelInfo[]>;
  chat(
    config: AIProviderConfig,
    messages: AIMessage[],
    tools?: Array<{ name: string; description: string; parameters: Record<string, any> }>
  ): Promise<AIResponse>;
}
