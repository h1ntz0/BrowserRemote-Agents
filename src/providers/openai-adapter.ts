import { ProviderAdapter, AIProviderConfig, ValidationResult, AIModelInfo, AIMessage, AIResponse } from './types';

export class OpenAIAdapter implements ProviderAdapter {
  readonly providerType = 'openai';

  private getEndpoint(config: AIProviderConfig): string {
    return config.endpoint || 'https://api.openai.com/v1';
  }

  async validate(config: AIProviderConfig): Promise<ValidationResult> {
    if (!config.apiKey) {
      return { valid: false, state: 'INVALID_KEY', message: 'API key is required for OpenAI.' };
    }

    try {
      const endpoint = this.getEndpoint(config);
      const res = await fetch(`${endpoint}/models`, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`
        }
      });

      if (res.status === 401) {
        return { valid: false, state: 'INVALID_KEY', message: 'Invalid OpenAI API Key.' };
      }
      if (res.status === 429) {
        return { valid: false, state: 'RATE_LIMITED', message: 'OpenAI rate limit or quota exceeded.' };
      }
      if (!res.ok) {
        return { valid: false, state: 'NETWORK_ERROR', message: `OpenAI returned status ${res.status}` };
      }

      const data = await res.json();
      const models: AIModelInfo[] = (data.data || [])
        .filter((m: any) => m.id.includes('gpt'))
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          supportsToolCalling: true,
          supportsVision: m.id.includes('4o') || m.id.includes('vision')
        }));

      return {
        valid: true,
        state: 'VALID',
        message: 'Successfully connected to OpenAI.',
        availableModels: models
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
      { id: 'gpt-4o', name: 'GPT-4o', supportsVision: true, supportsToolCalling: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', supportsVision: true, supportsToolCalling: true }
    ];
  }

  async chat(
    config: AIProviderConfig,
    messages: AIMessage[],
    tools?: Array<{ name: string; description: string; parameters: Record<string, any> }>
  ): Promise<AIResponse> {
    const endpoint = this.getEndpoint(config);

    const formattedMessages = messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.toolCallId || 'call_0',
          content: m.content
        };
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments)
            }
          }))
        };
      }
      return {
        role: m.role,
        content: m.content
      };
    });

    const body: Record<string, any> = {
      model: config.model || 'gpt-4o-mini',
      messages: formattedMessages,
      temperature: config.temperature ?? 0.2
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));
    }

    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI Chat error (${res.status}): ${err}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message;

    const toolCalls = choice?.tool_calls?.map((tc: any) => {
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }
      return {
        id: tc.id,
        name: tc.function.name,
        arguments: args
      };
    });

    return {
      text: choice?.content || '',
      toolCalls,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0
      }
    };
  }
}
