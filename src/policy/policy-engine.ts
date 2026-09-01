import { RiskLevel, PermissionCapability, DomainPolicyRule } from '@/protocol/types';

export interface ToolSecurityPolicy {
  name: string;
  riskLevel: RiskLevel;
  requiredPermission: PermissionCapability;
  requiresConfirmation: boolean;
  sensitiveKeywords?: RegExp[];
}

export interface DomainPolicyConfig {
  domain: string;
  rules: Record<PermissionCapability, DomainPolicyRule>;
}

export class PolicyEngine {
  private domainPolicies: Map<string, DomainPolicyConfig> = new Map();

  // Registry of tool safety attributes
  private toolPolicies: Map<string, ToolSecurityPolicy> = new Map([
    ['browser.snapshot', { name: 'browser.snapshot', riskLevel: 'LOW', requiredPermission: 'READ_PAGE', requiresConfirmation: false }],
    ['browser.inspect_dom', { name: 'browser.inspect_dom', riskLevel: 'LOW', requiredPermission: 'READ_PAGE', requiresConfirmation: false }],
    ['browser.explore_menus', { name: 'browser.explore_menus', riskLevel: 'LOW', requiredPermission: 'READ_PAGE', requiresConfirmation: false }],
    ['browser.get_current_tab', { name: 'browser.get_current_tab', riskLevel: 'LOW', requiredPermission: 'READ_PAGE', requiresConfirmation: false }],
    ['browser.find_element', { name: 'browser.find_element', riskLevel: 'LOW', requiredPermission: 'READ_PAGE', requiresConfirmation: false }],
    ['browser.get_page_metadata', { name: 'browser.get_page_metadata', riskLevel: 'LOW', requiredPermission: 'READ_PAGE', requiresConfirmation: false }],
    ['browser.get_links', { name: 'browser.get_links', riskLevel: 'LOW', requiredPermission: 'READ_PAGE', requiresConfirmation: false }],
    ['browser.get_logs', { name: 'browser.get_logs', riskLevel: 'LOW', requiredPermission: 'READ_PAGE', requiresConfirmation: false }],
    ['browser.screenshot', { name: 'browser.screenshot', riskLevel: 'LOW', requiredPermission: 'READ_PAGE', requiresConfirmation: false }],
    ['browser.scroll', { name: 'browser.scroll', riskLevel: 'LOW', requiredPermission: 'INTERACT_PAGE', requiresConfirmation: false }],
    ['browser.hover', { name: 'browser.hover', riskLevel: 'LOW', requiredPermission: 'INTERACT_PAGE', requiresConfirmation: false }],
    ['browser.press_key', { name: 'browser.press_key', riskLevel: 'LOW', requiredPermission: 'INTERACT_PAGE', requiresConfirmation: false }],
    ['browser.set_checkbox', { name: 'browser.set_checkbox', riskLevel: 'LOW', requiredPermission: 'INTERACT_PAGE', requiresConfirmation: false }],
    ['browser.wait', { name: 'browser.wait', riskLevel: 'LOW', requiredPermission: 'INTERACT_PAGE', requiresConfirmation: false }],
    ['browser.detect_captcha', { name: 'browser.detect_captcha', riskLevel: 'LOW', requiredPermission: 'READ_PAGE', requiresConfirmation: false }],
    ['browser.click', { name: 'browser.click', riskLevel: 'MEDIUM', requiredPermission: 'INTERACT_PAGE', requiresConfirmation: false, sensitiveKeywords: [/delete/i, /remove/i, /pay/i, /checkout/i, /transfer/i, /buy/i] }],
    ['browser.type', { name: 'browser.type', riskLevel: 'MEDIUM', requiredPermission: 'INTERACT_PAGE', requiresConfirmation: false, sensitiveKeywords: [/password/i, /cvv/i, /credit.?card/i, /pin/i] }],
    ['browser.select_option', { name: 'browser.select_option', riskLevel: 'MEDIUM', requiredPermission: 'INTERACT_PAGE', requiresConfirmation: false }],
    ['browser.drag_and_drop', { name: 'browser.drag_and_drop', riskLevel: 'MEDIUM', requiredPermission: 'INTERACT_PAGE', requiresConfirmation: false }],
    ['browser.navigate', { name: 'browser.navigate', riskLevel: 'MEDIUM', requiredPermission: 'NAVIGATE', requiresConfirmation: false }],
    ['browser.extract', { name: 'browser.extract', riskLevel: 'LOW', requiredPermission: 'DATA_EXPORT', requiresConfirmation: false }],
    ['browser.extract_table', { name: 'browser.extract_table', riskLevel: 'LOW', requiredPermission: 'DATA_EXPORT', requiresConfirmation: false }],
    ['browser.run_monkey_test', { name: 'browser.run_monkey_test', riskLevel: 'MEDIUM', requiredPermission: 'INTERACT_PAGE', requiresConfirmation: false }],
    ['browser.evaluate_js', { name: 'browser.evaluate_js', riskLevel: 'LOW', requiredPermission: 'INTERACT_PAGE', requiresConfirmation: false }],
    ['browser.submit_form', { name: 'browser.submit_form', riskLevel: 'HIGH', requiredPermission: 'SUBMIT_FORM', requiresConfirmation: true }],
    ['browser.upload_file', { name: 'browser.upload_file', riskLevel: 'HIGH', requiredPermission: 'UPLOAD', requiresConfirmation: true }],
    ['browser.download_file', { name: 'browser.download_file', riskLevel: 'MEDIUM', requiredPermission: 'DOWNLOAD', requiresConfirmation: false }]
  ]);

  constructor(initialDomainPolicies?: DomainPolicyConfig[]) {
    if (initialDomainPolicies) {
      initialDomainPolicies.forEach(dp => this.domainPolicies.set(this.normalizeDomain(dp.domain), dp));
    }
  }

  public normalizeDomain(urlOrHost: string): string {
    try {
      if (urlOrHost.startsWith('http://') || urlOrHost.startsWith('https://')) {
        const url = new URL(urlOrHost);
        return url.hostname.toLowerCase();
      }
      return urlOrHost.toLowerCase().replace(/:\d+$/, '');
    } catch {
      return urlOrHost.toLowerCase();
    }
  }

  public setDomainPolicy(domain: string, rules: Record<PermissionCapability, DomainPolicyRule>): void {
    const normalized = this.normalizeDomain(domain);
    this.domainPolicies.set(normalized, { domain: normalized, rules });
  }

  public getDomainPolicy(domain: string): DomainPolicyConfig | undefined {
    return this.domainPolicies.get(this.normalizeDomain(domain));
  }

  public evaluateAction(
    domain: string,
    toolName: string,
    params: Record<string, any> = {}
  ): {
    allowed: boolean;
    requiresConfirmation: boolean;
    riskLevel: RiskLevel;
    reason?: string;
  } {
    const normalizedDomain = this.normalizeDomain(domain);
    let policy = this.toolPolicies.get(toolName);

    // Auto-allow browser.* tools dynamically if prefix matches
    if (!policy && toolName.startsWith('browser.')) {
      policy = {
        name: toolName,
        riskLevel: 'LOW',
        requiredPermission: 'INTERACT_PAGE',
        requiresConfirmation: false
      };
      this.toolPolicies.set(toolName, policy);
    }

    if (!policy) {
      return {
        allowed: false,
        requiresConfirmation: false,
        riskLevel: 'CRITICAL',
        reason: `Unknown tool: ${toolName}`
      };
    }

    let riskLevel = policy.riskLevel;
    let requiresConfirmation = policy.requiresConfirmation;

    // Check sensitive keyword triggers in parameters or target text
    if (policy.sensitiveKeywords && params) {
      const paramString = JSON.stringify(params);
      for (const pattern of policy.sensitiveKeywords) {
        if (pattern.test(paramString)) {
          riskLevel = 'HIGH';
          requiresConfirmation = true;
          break;
        }
      }
    }

    // Evaluate against domain policy
    const domainRuleConfig = this.domainPolicies.get(normalizedDomain);
    const capability = policy.requiredPermission;

    if (domainRuleConfig && domainRuleConfig.rules[capability]) {
      const rule = domainRuleConfig.rules[capability];
      if (rule === 'DENY') {
        return {
          allowed: false,
          requiresConfirmation: false,
          riskLevel,
          reason: `Action '${toolName}' denied by domain policy on '${normalizedDomain}' for capability '${capability}'`
        };
      }
      if (rule === 'ASK') {
        requiresConfirmation = true;
      }
    }

    return {
      allowed: true,
      requiresConfirmation,
      riskLevel
    };
  }
}
