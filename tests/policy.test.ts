import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '@/policy/policy-engine';

describe('PolicyEngine Evaluation', () => {
  const policyEngine = new PolicyEngine([
    {
      domain: 'github.com',
      rules: {
        READ_PAGE: 'ALLOW',
        INTERACT_PAGE: 'ALLOW',
        NAVIGATE: 'ALLOW',
        DOWNLOAD: 'ASK',
        UPLOAD: 'ASK',
        SUBMIT_FORM: 'ASK',
        MULTI_TAB: 'ALLOW',
        DATA_EXPORT: 'ALLOW'
      }
    },
    {
      domain: 'bank.example.com',
      rules: {
        READ_PAGE: 'ALLOW',
        INTERACT_PAGE: 'DENY',
        NAVIGATE: 'DENY',
        DOWNLOAD: 'DENY',
        UPLOAD: 'DENY',
        SUBMIT_FORM: 'DENY',
        MULTI_TAB: 'DENY',
        DATA_EXPORT: 'DENY'
      }
    }
  ]);

  it('allows safe DOM inspection on allowed domains', () => {
    const res = policyEngine.evaluateAction('https://github.com/trending', 'browser.inspect_dom');
    expect(res.allowed).toBe(true);
    expect(res.requiresConfirmation).toBe(false);
    expect(res.riskLevel).toBe('LOW');
  });

  it('elevates risk and requires confirmation on sensitive keyword actions', () => {
    const res = policyEngine.evaluateAction('https://github.com/repo', 'browser.click', { selector: 'button.delete-repo', text: 'Delete Repository' });
    expect(res.allowed).toBe(true);
    expect(res.requiresConfirmation).toBe(true);
    expect(res.riskLevel).toBe('HIGH');
  });

  it('blocks actions denied by domain policy', () => {
    const res = policyEngine.evaluateAction('https://bank.example.com/transfer', 'browser.click', { selector: '#transfer-btn' });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('denied by domain policy');
  });
});
