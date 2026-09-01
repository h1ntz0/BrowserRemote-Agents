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
  onPlanCreated: (plan: PlanStep[]) => void;
  onStepProgress: (step: PlanStep) => void;
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

    const maxSteps = options.maxSteps || 15;
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

    // 1. Initial page inspection and CAPTCHA detection
    let initialDom: any = {};
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
      initialDom = await options.sendMessageToTab('INSPECT_DOM', { maxDepth: 3 });
    } catch (e: any) {
      initialDom = { error: `Failed to inspect initial DOM: ${e.message}` };
    }

    // 2. Planning phase
    options.onStateChange('PLANNING');
    const sanitizedContext = JSON.stringify(RedactionEngine.redactObject(initialDom));
    const systemPrompt = `You are an autonomous browser execution agent designed for the Browser Agent Bridge.
Your goal is to fulfill the User's task accurately, step-by-step, using browser tools.
Always explain your thought process and pick the appropriate tool.
When the task is complete, provide a clear concise summary.`;

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: PromptInjectionGuard.constructSecurePrompt(systemPrompt, options.userPrompt, sanitizedContext)
      }
    ];

    let currentStep = 0;
    let completedSummary = 'Task completed successfully.';
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

      // Check if AI completed without more tool calls
      if (!response.toolCalls || response.toolCalls.length === 0) {
        completedSummary = response.text || 'Task finished without further actions.';
        break;
      }

      // Append Assistant message to conversation
      messages.push({
        role: 'assistant',
        content: response.text || '',
        toolCalls: response.toolCalls
      });

      // Execute each tool call through the Policy Engine
      for (const toolCall of response.toolCalls) {
        await this.checkPauseOrCancel();

        const toolName = toolCall.name;
        const toolParams = toolCall.arguments || {};
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

        // Policy & Permission evaluation
        const evalResult = this.policyEngine.evaluateAction(options.domain, toolName, toolParams);
        actionLog.riskLevel = evalResult.riskLevel;

        if (!evalResult.allowed) {
          actionLog.status = 'BLOCKED';
          actionLog.details = evalResult.reason;
          options.onActionLog({ ...actionLog });
          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: `ERROR: Action blocked by policy. ${evalResult.reason}`
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
              toolCallId: toolCall.id,
              content: 'ERROR: Action declined by user.'
            });
            continue;
          }
          actionLog.humanApproved = true;
          options.onStateChange('EXECUTING');
        }

        // Execute tool safely
        const toolDef = this.toolRegistry.get(toolName);
        if (!toolDef) {
          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: `ERROR: Tool ${toolName} not registered.`
          });
          continue;
        }

        try {
          const result = await toolDef.execute(toolParams, toolContext);
          actionLog.status = 'SUCCESS';
          actionLog.durationMs = Date.now() - startTime;
          options.onActionLog({ ...actionLog });

          if (toolName === 'browser.extract' || toolName === 'EXTRACT_DATA') {
            extractedData = result;
          }

          const redactedResult = RedactionEngine.redactObject(result);
          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: JSON.stringify(redactedResult)
          });
        } catch (err: any) {
          actionLog.status = 'FAILED';
          actionLog.details = err.message;
          actionLog.durationMs = Date.now() - startTime;
          options.onActionLog({ ...actionLog });

          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: `Execution error: ${err.message}`
          });
        }
      }
    }

    options.onStateChange('VALIDATING');
    options.onStateChange('COMPLETED');

    return {
      success: true,
      summary: completedSummary,
      data: extractedData
    };
  }
}
