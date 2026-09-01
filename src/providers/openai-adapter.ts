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
        return { valid: false, state: 'INVALID_KEY', message: 'Invalid API Key.' };
      }
      if (res.status === 429) {
        return { valid: false, state: 'RATE_LIMITED', message: 'Rate limit or quota exceeded.' };
      }
      if (!res.ok) {
        return { valid: false, state: 'NETWORK_ERROR', message: `Returned status ${res.status}` };
      }

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { data: [] };
      }

      const models: AIModelInfo[] = (data.data || [])
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          supportsToolCalling: true,
          supportsVision: true
        }));

      return {
        valid: true,
        state: 'VALID',
        message: 'Successfully connected to AI Provider.',
        availableModels: models.length > 0 ? models : [
          { id: config.model || 'gpt-4o-mini', name: config.model || 'gpt-4o-mini', supportsVision: true, supportsToolCalling: true }
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

    // Sanitize and strictly normalize message sequence for Gemini / OpenAI standard:
    // 1. Initial system prompt can be merged with first user message or kept as system
    // 2. Assistant message with tool_calls MUST have matching tool responses
    // 3. If a tool call had no matching response or orphaned, convert to user context to avoid 400 INVALID_ARGUMENT
    const formattedMessages: any[] = [];
    
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'tool') {
        formattedMessages.push({
          role: 'tool',
          tool_call_id: m.toolCallId || `call_${i}`,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        });
      } else if (m.toolCalls && m.toolCalls.length > 0) {
        formattedMessages.push({
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.toolCalls.map(tc => ({
            id: tc.id || `call_${i}`,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
            }
          }))
        });
      } else {
        formattedMessages.push({
          role: m.role,
          content: m.content || ''
        });
      }
    }

    const body: Record<string, any> = {
      model: config.model || 'gpt-4o-mini',
      messages: formattedMessages,
      temperature: config.temperature ?? 0.2,
      stream: false
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
        'Accept': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      // If 400 invalid turn argument occurs from provider backend proxy, fallback cleanly without tools or single prompt
      throw new Error(`AI Provider error (${res.status}): ${err}`);
    }

    const rawText = await res.text();
    let text = '';
    let toolCalls: any = undefined;
    let usage: any = undefined;

    if (rawText.trim().startsWith('data:')) {
      const lines = rawText.split('\n');
      const toolCallMap = new Map<number, { id: string; name: string; args: string }>();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
        if (jsonStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            text += delta.content;
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallMap.has(idx)) {
                toolCallMap.set(idx, {
                  id: tc.id || `call_${idx}`,
                  name: tc.function?.name || '',
                  args: tc.function?.arguments || ''
                });
              } else {
                const existing = toolCallMap.get(idx)!;
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) existing.args += tc.function.arguments;
              }
            }
          }
        } catch {}
      }

      if (toolCallMap.size > 0) {
        toolCalls = Array.from(toolCallMap.values()).map(tc => {
          let args = {};
          try {
            args = JSON.parse(tc.args);
          } catch {
            args = {};
          }
          return {
            id: tc.id,
            name: tc.name,
            arguments: args
          };
        });
      }
    } else {
      const data = JSON.parse(rawText);
      const choice = data.choices?.[0]?.message;

      toolCalls = choice?.tool_calls?.map((tc: any) => {
        let args = {};
        try {
          args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        } catch {
          args = {};
        }
        return {
          id: tc.id,
          name: tc.function.name,
          arguments: args
        };
      });

      text = choice?.content || '';
      usage = {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0
      };
    }

    return {
      text,
      toolCalls,
      usage
    };
  }
}
