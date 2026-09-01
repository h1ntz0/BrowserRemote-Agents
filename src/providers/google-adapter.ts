import { ProviderAdapter, AIProviderConfig, ValidationResult, AIModelInfo, AIMessage, AIResponse } from './types';

export class GoogleGeminiAdapter implements ProviderAdapter {
  readonly providerType = 'google';

  async validate(config: AIProviderConfig): Promise<ValidationResult> {
    if (!config.apiKey) {
      return { valid: false, state: 'INVALID_KEY', message: 'Google Gemini API Key is required.' };
    }

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${config.apiKey}`);
      if (res.status === 400 || res.status === 403) {
        return { valid: false, state: 'INVALID_KEY', message: 'Invalid Google Gemini API Key.' };
      }
      if (!res.ok) {
        return { valid: false, state: 'NETWORK_ERROR', message: `Google Gemini API returned status ${res.status}` };
      }

      const data = await res.json();
      const models: AIModelInfo[] = (data.models || [])
        .filter((m: any) => m.name.includes('gemini'))
        .map((m: any) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name,
          supportsVision: true,
          supportsToolCalling: true
        }));

      return {
        valid: true,
        state: 'VALID',
        message: 'Successfully connected to Google Gemini.',
        availableModels: models
      };
    } catch (err: any) {
      return { valid: false, state: 'NETWORK_ERROR', message: `Connection failed: ${err.message}` };
    }
  }

  async listModels(config: AIProviderConfig): Promise<AIModelInfo[]> {
    const val = await this.validate(config);
    return val.availableModels || [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', supportsVision: true, supportsToolCalling: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', supportsVision: true, supportsToolCalling: true }
    ];
  }

  async chat(
    config: AIProviderConfig,
    messages: AIMessage[],
    tools?: Array<{ name: string; description: string; parameters: Record<string, any> }>
  ): Promise<AIResponse> {
    const model = config.model || 'gemini-2.0-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

    const contents = messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'function',
          parts: [{
            functionResponse: {
              name: m.toolCallId || 'tool',
              response: { result: m.content }
            }
          }]
        };
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'model',
          parts: m.toolCalls.map(tc => ({
            functionCall: {
              name: tc.name,
              args: tc.arguments
            }
          }))
        };
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      };
    });

    const body: Record<string, any> = { contents };

    if (tools && tools.length > 0) {
      body.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }))
      }];
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0]?.content;
    let text = '';
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];

    for (const part of candidate?.parts || []) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {}
        });
      }
    }

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }
}
