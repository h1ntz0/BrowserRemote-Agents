import { z } from 'zod';
import { RiskLevel, PermissionCapability } from '@/protocol/types';

export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  riskLevel: RiskLevel;
  requiredPermission: PermissionCapability;
  requiresConfirmation: boolean;
  timeoutMs: number;
  execute: (input: TInput, context: ToolExecutionContext) => Promise<TOutput>;
}

export interface ToolExecutionContext {
  tabId?: number;
  url?: string;
  domain?: string;
  sendMessageToTab: (action: string, payload?: any) => Promise<any>;
  takeScreenshot?: () => Promise<string>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  public register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public getAIToolDeclarations(): Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }> {
    return this.list().map(tool => ({
      name: tool.name,
      description: `[Risk: ${tool.riskLevel}] ${tool.description}`,
      parameters: {
        type: 'object',
        // Represent zod shape representation
        description: `Input schema for ${tool.name}`
      }
    }));
  }
}
