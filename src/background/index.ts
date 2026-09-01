import { ToolRegistry } from '@/tools/registry';
import { registerDefaultBrowserTools } from '@/tools/browser-tools';
import { PolicyEngine } from '@/policy/policy-engine';
import { ProviderManager } from '@/providers/provider-manager';
import { AgentRuntime } from '@/agent/agent-runtime';

// Setup background services
const toolRegistry = new ToolRegistry();
registerDefaultBrowserTools(toolRegistry);

const policyEngine = new PolicyEngine();
const providerManager = new ProviderManager();
const agentRuntime = new AgentRuntime(providerManager, toolRegistry, policyEngine);

// Open sidepanel when extension icon clicked
chrome.action.onClicked.addListener(tab => {
  if (tab.id) {
    (chrome.sidePanel as any).open({ tabId: tab.id });
  }
});

// Manage runtime communication between side panel and background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'VALIDATE_PROVIDER':
      providerManager.validateConfig(payload.config)
        .then(result => sendResponse({ status: 'SUCCESS', data: result }))
        .catch(err => sendResponse({ status: 'ERROR', error: err.message }));
      return true;

    case 'EVALUATE_POLICY':
      const evalRes = policyEngine.evaluateAction(payload.domain, payload.tool, payload.params);
      sendResponse({ status: 'SUCCESS', data: evalRes });
      return false;

    case 'SET_DOMAIN_POLICY':
      policyEngine.setDomainPolicy(payload.domain, payload.rules);
      sendResponse({ status: 'SUCCESS' });
      return false;

    default:
      sendResponse({ status: 'ERROR', error: `Unknown background message type: ${type}` });
      return false;
  }
});
