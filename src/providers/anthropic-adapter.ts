import { ProviderAdapter, AIProviderConfig, ValidationResult, AIModelInfo, AIMessage, AIResponse } from './types';

export class AnthropicAdapter implements ProviderAdapter {
  readonly providerType = 'anthropic';

  async validate(config: AIProviderConfig): Promise<ValidationResult> {
    if (!config.apiKey) {
      return { valid: false, state: 'INVALID_KEY', message: 'Anthropic API Key is required.' };
    }

    try {
      // Send a minimal token message to validate Anthropic key
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'dangerously-allow-browser': 'true'
        },
        body: JSON.stringify({
          model: config.model || 'claude-3-5-sonnet-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        })
      });

      if (res.status === 401) {
        return { valid: false, state: 'INVALID_KEY', message: 'Invalid Anthropic API Key.' };
      }
      if (res.status === 429) {
        return { valid: false, state: 'RATE_LIMITED', message: 'Anthropic rate limit exceeded.' };
      }

      return {
        valid: true,
        state: 'VALID',
        message: 'Successfully connected to Anthropic API.',
        availableModels: [
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', supportsVision: true, supportsToolCalling: true },
          { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', supportsVision: true, supportsToolCalling: true },
          { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', supportsVision: true, supportsToolCalling: true }
        ]
      };
    } catch (err: any) {
      return { valid: false, state: 'NETWORK_ERROR', message: `Anthropic connection failed: ${err.message}` };
    }
  }

  async listModels(_config: AIProviderConfig): Promise<AIModelInfo[]> {
    return [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', supportsVision: true, supportsToolCalling: true },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', supportsVision: true, supportsToolCalling: true }
    ];
  }

  async chat(
    config: AIProviderConfig,
    messages: AIMessage[],
    tools?: Array<{ name: string; description: string; parameters: Record<string, any> }>
  ): Promise<AIResponse> {
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const conversation = messages.filter(m => m.role !== 'system');

    const formattedMessages = conversation.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.toolCallId || 'call_0',
              content: m.content
            }
          ]
        };
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: m.toolCalls.map(tc => ({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments
          }))
        };
      }
      return {
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      };
    });

    const body: Record<string, any> = {
      model: config.model || 'claude-3-5-sonnet-20241022',
      max_tokens: config.maxTokens || 4096,
      messages: formattedMessages
    };

    if (systemMsg) body.system = systemMsg;

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters
      }));
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'dangerously-allow-browser': 'true'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    let text = '';
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];

    for (const block of data.content || []) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input
        });
      }
    }

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0
      }
    };
  }
}
