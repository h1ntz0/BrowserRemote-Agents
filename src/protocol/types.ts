import { z } from 'zod';

export const RiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const PermissionCapabilitySchema = z.enum([
  'READ_PAGE',
  'INTERACT_PAGE',
  'NAVIGATE',
  'DOWNLOAD',
  'UPLOAD',
  'SUBMIT_FORM',
  'MULTI_TAB',
  'DATA_EXPORT'
]);
export type PermissionCapability = z.infer<typeof PermissionCapabilitySchema>;

export const DomainPolicyRuleSchema = z.enum(['ALLOW', 'ASK', 'DENY']);
export type DomainPolicyRule = z.infer<typeof DomainPolicyRuleSchema>;

export const AgentStateSchema = z.enum([
  'IDLE',
  'ANALYZING',
  'PLANNING',
  'WAITING_PERMISSION',
  'EXECUTING',
  'WAITING_HUMAN',
  'VALIDATING',
  'COMPLETED',
  'PAUSED',
  'FAILED',
  'CANCELLED',
  'BLOCKED'
]);
export type AgentState = z.infer<typeof AgentStateSchema>;

export const BrowserActionTypeSchema = z.enum([
  'GET_CURRENT_TAB',
  'INSPECT_DOM',
  'FIND_ELEMENT',
  'CLICK',
  'TYPE',
  'SCROLL',
  'NAVIGATE',
  'WAIT',
  'SCREENSHOT',
  'EXTRACT',
  'GET_LINKS',
  'GET_PAGE_METADATA',
  'HIGHLIGHT_ELEMENT',
  'CLEAR_HIGHLIGHTS',
  'DETECT_CAPTCHA'
]);
export type BrowserActionType = z.infer<typeof BrowserActionTypeSchema>;

export const RequestMessageSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.number(),
  schemaVersion: z.literal('1.0.0'),
  source: z.enum(['SIDEPANEL', 'BACKGROUND', 'CONTENT', 'AGENT']),
  action: BrowserActionTypeSchema,
  payload: z.record(z.any()).default({})
});
export type RequestMessage = z.infer<typeof RequestMessageSchema>;

export const ResponseMessageSchema = z.object({
  requestId: z.string().uuid(),
  timestamp: z.number(),
  status: z.enum(['SUCCESS', 'ERROR', 'BLOCKED', 'REQUIRES_CONFIRMATION', 'REQUIRES_HUMAN']),
  data: z.any().optional(),
  error: z.string().optional()
});
export type ResponseMessage = z.infer<typeof ResponseMessageSchema>;

export interface PlanStep {
  id: string;
  order: number;
  description: string;
  tool: string;
  params?: Record<string, any>;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  result?: any;
  error?: string;
}

export interface ActionLog {
  id: string;
  taskId: string;
  timestamp: number;
  tool: string;
  target?: string;
  riskLevel: RiskLevel;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'WAITING_HUMAN';
  durationMs?: number;
  details?: string;
  humanApproved?: boolean;
}

export interface ExtractionSchemaField {
  name: string;
  selector: string;
  attribute?: 'text' | 'src' | 'href' | 'value' | string;
  type: 'string' | 'number' | 'boolean' | 'url' | 'image';
  required?: boolean;
}

export interface ExtractionSchema {
  name: string;
  containerSelector: string;
  fields: ExtractionSchemaField[];
  pagination?: {
    nextButtonSelector?: string;
    maxPages?: number;
    urlPattern?: string;
  };
}
