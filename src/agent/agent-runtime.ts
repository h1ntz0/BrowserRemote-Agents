import { AgentState, PlanStep, ActionLog, RiskLevel } from '@/protocol/types';
import { AIProviderConfig, AIMessage } from '@/providers/types';
import { ProviderManager } from '@/providers/provider-manager';
import { ToolRegistry, ToolExecutionContext } from '@/tools/registry';
import { PolicyEngine } from '@/policy/policy-engine';
import { PromptInjectionGuard } from '@/security/prompt-injection';
import { RedactionEngine } from '@/security/redaction';

export interface AgentTaskOptions {
  taskId: string;
  userPrompt: string;
  tabId: number;
  url: string;
  domain: string;
  maxSteps?: number;
  onStateChange: (state: AgentState) => void;
  onPlanCreated?: (plan: PlanStep[]) => void;
  onStepProgress?: (step: PlanStep) => void;
  onThought?: (thought: string) => void;
  onActionLog: (log: ActionLog) => void;
  onRequestHumanTakeover: (reason: string, details?: string) => Promise<boolean>;
  onRequestConfirmation: (tool: string, risk: RiskLevel, params: any) => Promise<boolean>;
  sendMessageToTab: (action: string, payload?: any) => Promise<any>;
  takeScreenshot?: () => Promise<string>;
}

export class AgentRuntime {
  private providerManager: ProviderManager;
  private toolRegistry: ToolRegistry;
  private policyEngine: PolicyEngine;
  private isPaused: boolean = false;
  private isCancelled: boolean = false;
  private resumeResolver: (() => void) | null = null;

  constructor(
    providerManager: ProviderManager,
    toolRegistry: ToolRegistry,
    policyEngine: PolicyEngine
  ) {
    this.providerManager = providerManager;
    this.toolRegistry = toolRegistry;
    this.policyEngine = policyEngine;
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
    if (this.resumeResolver) {
      this.resumeResolver();
      this.resumeResolver = null;
    }
  }

  public cancel(): void {
    this.isCancelled = true;
    this.resume();
  }

  private async checkPauseOrCancel(): Promise<void> {
    if (this.isCancelled) throw new Error('Task was cancelled by user.');
    if (this.isPaused) {
      await new Promise<void>(resolve => {
        this.resumeResolver = resolve;
      });
      if (this.isCancelled) throw new Error('Task was cancelled by user.');
    }
  }

  public async runTask(config: AIProviderConfig, options: AgentTaskOptions): Promise<{ success: boolean; summary: string; data?: any }> {
    this.isPaused = false;
    this.isCancelled = false;

    const maxSteps = options.maxSteps || 25;
    const adapter = this.providerManager.getAdapter(config.provider);
    const availableTools = this.toolRegistry.getAIToolDeclarations();

    const toolContext: ToolExecutionContext = {
      tabId: options.tabId,
      url: options.url,
      domain: options.domain,
      sendMessageToTab: options.sendMessageToTab,
      takeScreenshot: options.takeScreenshot
    };

    options.onStateChange('ANALYZING');

    // 1. Initial Snapshot & CAPTCHA Detection
    let initialSnapshot: any = {};
    try {
      const captchaCheck = await options.sendMessageToTab('DETECT_CAPTCHA');
      if (captchaCheck?.hasChallenge) {
        options.onStateChange('WAITING_HUMAN');
        const approved = await options.onRequestHumanTakeover(captchaCheck.type || 'CAPTCHA', captchaCheck.details);
        if (!approved) {
          options.onStateChange('CANCELLED');
          return { success: false, summary: 'User cancelled during authentication challenge.' };
        }
      }
      initialSnapshot = await options.sendMessageToTab('SNAPSHOT', { renderVisualTags: true });
    } catch (e: any) {
      initialSnapshot = { formattedTree: 'Page ready.', title: document.title, url: options.url };
    }

    // 2. Planning phase with dual execution support (ReAct JSON + native function calling)
    options.onStateChange('PLANNING');
    
    const formattedTree = initialSnapshot?.formattedTree || 'No interactive tree available.';
    const systemPrompt = `You are an elite, highly capable autonomous browser execution agent.
You directly control and interact with the user's browser tab to accomplish their instructions.

[CORE WORKFLOW RULES]
1. Examine the current interactive viewport elements (refs: e1, e2, etc.).
2. You can click elements by ref (e1), text (e.g. "comsec"), or CSS selector.
3. If an action mutates the page, the DOM tree will automatically refresh in the next observation.
4. If you need to fill inputs, select options, or click buttons, call the appropriate tool.
5. If the user asks to explore menus or test things, execute actions step-by-step.
6. When done, output: {"thought": "...", "done": true, "summary": "..."}

[AVAILABLE BROWSER TOOLS]
- browser.click({ ref: "e1" }) -> Click element by ref (e1, e2...) or fuzzy text title
- browser.type({ ref: "e2", text: "query", pressEnter: true }) -> Type text into input
- browser.select_option({ ref: "e3", value: "optionVal" }) -> Select from dropdown
- browser.set_checkbox({ ref: "e4", checked: true }) -> Check/uncheck
- browser.hover({ ref: "e5" }) -> Hover over element
- browser.drag_and_drop({ sourceRef: "e1", targetRef: "e2" }) -> Drag and drop
- browser.scroll({ direction: "down"|"up"|"bottom"|"top", amount: 500 }) -> Scroll page
- browser.navigate({ url: "https://..." }) -> Go to destination URL
- browser.snapshot({}) -> Refresh element tree and visual refs
- browser.extract_table({ ref: "e1" }) -> Extract table dataset
- browser.wait({ ms: 2000 }) -> Wait for network/UI
- browser.evaluate_js({ code: "..." }) -> Execute JS in page

RESPONSE FORMAT:
You can call tools via native function calls OR by writing a JSON action block:
\`\`\`json
{
  "thought": "I need to open the comsec menu by clicking ref e2",
  "tool": "browser.click",
  "params": { "ref": "e2" }
}
\`\`\`
`;

    const userInitialPrompt = `[PAGE CONTEXT]
URL: ${options.url}
Title: ${initialSnapshot?.title || ''}

[INTERACTIVE ELEMENTS ON CURRENT VIEWPORT]
${formattedTree}

[USER INSTRUCTION]
${options.userPrompt}
`;

    const messages: AIMessage[] = [
      {
        role: 'user',
        content: PromptInjectionGuard.constructSecurePrompt(systemPrompt, userInitialPrompt, '')
      }
    ];

    let currentStep = 0;
    let completedSummary = 'Task completed.';
    let extractedData: any = null;

    options.onStateChange('EXECUTING');

    while (currentStep < maxSteps) {
      await this.checkPauseOrCancel();
      currentStep++;

      let response;
      try {
        response = await adapter.chat(config, messages, availableTools);
      } catch (err: any) {
        options.onStateChange('FAILED');
        return { success: false, summary: `AI Provider Error: ${err.message}` };
      }

      if (response.text && options.onThought) {
        options.onThought(response.text);
      }

      // 1. Extract tool calls (native or JSON ReAct block)
      let toolCallsToExecute: Array<{ id: string; name: string; params: any }> = [];

      if (response.toolCalls && response.toolCalls.length > 0) {
        toolCallsToExecute = response.toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          params: tc.arguments
        }));
      } else if (response.text) {
        const jsonMatch = response.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || response.text.match(/(\{\s*"tool"[\s\S]*?\})/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            if (parsed.done) {
              completedSummary = parsed.summary || response.text;
              break;
            }
            if (parsed.tool) {
              toolCallsToExecute.push({
                id: `call_${Date.now()}`,
                name: parsed.tool,
                params: parsed.params || {}
              });
            }
          } catch {}
        }
      }

      // If no tools requested, agent considers task done
      if (toolCallsToExecute.length === 0) {
        completedSummary = response.text || 'Task completed without further actions.';
        break;
      }

      // Append Assistant message
      if (toolCallsToExecute.length > 0) {
        messages.push({
          role: 'assistant',
          content: response.text || '',
          toolCalls: toolCallsToExecute.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.params
          }))
        });
      } else {
        messages.push({
          role: 'assistant',
          content: response.text || ''
        });
      }

      // Execute each tool through Policy & Security Engine
      for (const tc of toolCallsToExecute) {
        await this.checkPauseOrCancel();

        const toolName = tc.name;
        const toolParams = tc.params || {};
        const startTime = Date.now();

        const actionLog: ActionLog = {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          taskId: options.taskId,
          timestamp: startTime,
          tool: toolName,
          target: JSON.stringify(toolParams),
          riskLevel: 'LOW',
          status: 'RUNNING'
        };
        options.onActionLog(actionLog);

        const evalResult = this.policyEngine.evaluateAction(options.domain, toolName, toolParams);
        actionLog.riskLevel = evalResult.riskLevel;

        if (!evalResult.allowed) {
          actionLog.status = 'BLOCKED';
          actionLog.details = evalResult.reason;
          options.onActionLog({ ...actionLog });
          messages.push({
            role: 'tool',
            toolCallId: tc.id,
            content: `ERROR: Action blocked by policy: ${evalResult.reason}`
          });
          continue;
        }

        if (evalResult.requiresConfirmation) {
          options.onStateChange('WAITING_PERMISSION');
          const confirmed = await options.onRequestConfirmation(toolName, evalResult.riskLevel, toolParams);
          if (!confirmed) {
            actionLog.status = 'BLOCKED';
            actionLog.details = 'Action declined by user.';
            options.onActionLog({ ...actionLog });
            messages.push({
              role: 'tool',
              toolCallId: tc.id,
              content: 'ERROR: Action declined by user.'
            });
            continue;
          }
          actionLog.humanApproved = true;
          options.onStateChange('EXECUTING');
        }

        const toolDef = this.toolRegistry.get(toolName);
        if (!toolDef) {
          messages.push({
            role: 'tool',
            toolCallId: tc.id,
            content: `ERROR: Tool '${toolName}' not found.`
          });
          continue;
        }

        try {
          const result = await toolDef.execute(toolParams, toolContext);
          actionLog.status = 'SUCCESS';
          actionLog.durationMs = Date.now() - startTime;
          options.onActionLog({ ...actionLog });

          if (toolName === 'browser.extract' || toolName === 'EXTRACT_DATA' || toolName === 'browser.extract_table') {
            extractedData = result;
          }

          // Auto-refresh snapshot after DOM-mutating actions
          let contextualResult = result;
          if (['browser.click', 'browser.type', 'browser.select_option', 'browser.navigate', 'browser.scroll', 'browser.press_key', 'browser.set_checkbox'].includes(toolName)) {
            await new Promise(r => setTimeout(r, 400));
            const latestSnapshot = await options.sendMessageToTab('SNAPSHOT', { renderVisualTags: true });
            contextualResult = {
              actionResult: result,
              updatedPageTree: latestSnapshot?.formattedTree || ''
            };
          }

          const redactedResult = RedactionEngine.redactObject(contextualResult);
          messages.push({
            role: 'tool',
            toolCallId: tc.id,
            content: JSON.stringify(redactedResult)
          });
        } catch (err: any) {
          actionLog.status = 'FAILED';
          actionLog.details = err.message;
          actionLog.durationMs = Date.now() - startTime;
          options.onActionLog({ ...actionLog });

          messages.push({
            role: 'tool',
            toolCallId: tc.id,
            content: `Execution error: ${err.message}`
          });
        }
      }
    }

    // Clean overlay markers when task finishes
    await options.sendMessageToTab('CLEAR_HIGHLIGHTS');

    options.onStateChange('COMPLETED');
    return {
      success: true,
      summary: completedSummary,
      data: extractedData
    };
  }
}
