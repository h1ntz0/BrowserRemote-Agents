import { describe, it, expect } from 'vitest';
import { ProviderManager } from '@/providers/provider-manager';

describe('OpenCode Zen & Go Adapters', () => {
  const pm = new ProviderManager();

  it('registers opencode_zen adapter with default endpoint :20128', () => {
    const adapter = pm.getAdapter('opencode_zen');
    expect(adapter).toBeDefined();
    expect(adapter.providerType).toBe('opencode_zen');
  });

  it('registers opencode_go adapter with default endpoint :8080', () => {
    const adapter = pm.getAdapter('opencode_go');
    expect(adapter).toBeDefined();
    expect(adapter.providerType).toBe('opencode_go');
  });
});
