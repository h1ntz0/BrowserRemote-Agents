import { describe, it, expect } from 'vitest';
import { ProviderManager } from '@/providers/provider-manager';

describe('ProviderManager with 9router', () => {
  const pm = new ProviderManager();

  it('registers and retrieves 9router adapter', () => {
    const adapter = pm.getAdapter('nine_router');
    expect(adapter).toBeDefined();
    expect(adapter.providerType).toBe('nine_router');
  });

  it('rejects empty API key with actionable message', async () => {
    const res = await pm.validateConfig({
      provider: 'nine_router',
      apiKey: '',
      model: 'claude-3-5-sonnet-20241022'
    });
    expect(res.valid).toBe(false);
    expect(res.state).toBe('INVALID_KEY');
    expect(res.message).toContain('9router API Key is required');
  });
});
