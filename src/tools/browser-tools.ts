import { z } from 'zod';
import { ToolRegistry } from './registry';
import { RedactionEngine } from '@/security/redaction';

export function registerDefaultBrowserTools(registry: ToolRegistry): void {
  // 1. Get Current Tab Info
  registry.register({
    name: 'browser.get_current_tab',
    description: 'Get details of the currently active tab (URL, title, tab ID)',
    inputSchema: z.object({}),
    riskLevel: 'LOW',
    requiredPermission: 'READ_PAGE',
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async (_input, ctx) => {
      return {
        tabId: ctx.tabId,
        url: ctx.url,
        domain: ctx.domain
      };
    }
  });

  // 2. Inspect DOM Structure
  registry.register({
    name: 'browser.inspect_dom',
    description: 'Inspect the readable DOM, headings, buttons, links, and structure of the active page',
    inputSchema: z.object({
      maxDepth: z.number().optional().default(5),
      selector: z.string().optional().default('body')
    }),
    riskLevel: 'LOW',
    requiredPermission: 'READ_PAGE',
    requiresConfirmation: false,
    timeoutMs: 10000,
    execute: async (input, ctx) => {
      const result = await ctx.sendMessageToTab('INSPECT_DOM', input);
      return RedactionEngine.redactObject(result);
    }
  });

  // 3. Find Element
  registry.register({
    name: 'browser.find_element',
    description: 'Locate interactive or text elements matching a CSS selector or text query',
    inputSchema: z.object({
      selector: z.string().optional(),
      textMatch: z.string().optional()
    }),
    riskLevel: 'LOW',
    requiredPermission: 'READ_PAGE',
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('FIND_ELEMENT', input);
    }
  });

  // 4. Click Element
  registry.register({
    name: 'browser.click',
    description: 'Click an element identified by CSS selector or coordinates with visual highlight',
    inputSchema: z.object({
      selector: z.string(),
      description: z.string().optional()
    }),
    riskLevel: 'MEDIUM',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 10000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('CLICK', input);
    }
  });

  // 5. Type Text
  registry.register({
    name: 'browser.type',
    description: 'Type text into an input field or textarea with simulated user keystrokes',
    inputSchema: z.object({
      selector: z.string(),
      text: z.string(),
      pressEnter: z.boolean().optional().default(false)
    }),
    riskLevel: 'MEDIUM',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 10000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('TYPE', input);
    }
  });

  // 6. Scroll Page
  registry.register({
    name: 'browser.scroll',
    description: 'Scroll window or container vertically/horizontally',
    inputSchema: z.object({
      direction: z.enum(['up', 'down', 'top', 'bottom']),
      amount: z.number().optional().default(500)
    }),
    riskLevel: 'LOW',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('SCROLL', input);
    }
  });

  // 7. Navigate URL
  registry.register({
    name: 'browser.navigate',
    description: 'Navigate the current tab to a given destination URL',
    inputSchema: z.object({
      url: z.string().url()
    }),
    riskLevel: 'MEDIUM',
    requiredPermission: 'NAVIGATE',
    requiresConfirmation: false,
    timeoutMs: 15000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('NAVIGATE', input);
    }
  });

  // 8. Wait
  registry.register({
    name: 'browser.wait',
    description: 'Pause execution for specified milliseconds or until an element appears',
    inputSchema: z.object({
      ms: z.number().min(100).max(30000).optional(),
      waitForSelector: z.string().optional()
    }),
    riskLevel: 'LOW',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 35000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('WAIT', input);
    }
  });

  // 9. Screenshot
  registry.register({
    name: 'browser.screenshot',
    description: 'Capture screenshot of current visible viewport',
    inputSchema: z.object({}),
    riskLevel: 'LOW',
    requiredPermission: 'READ_PAGE',
    requiresConfirmation: false,
    timeoutMs: 10000,
    execute: async (_input, ctx) => {
      if (ctx.takeScreenshot) {
        return { dataUrl: await ctx.takeScreenshot() };
      }
      return { dataUrl: '' };
    }
  });

  // 10. Detect CAPTCHA / 2FA Challenge
  registry.register({
    name: 'browser.detect_captcha',
    description: 'Check if current page presents an authentication barrier, CAPTCHA, Cloudflare, or 2FA challenge',
    inputSchema: z.object({}),
    riskLevel: 'LOW',
    requiredPermission: 'READ_PAGE',
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async (_input, ctx) => {
      return ctx.sendMessageToTab('DETECT_CAPTCHA', {});
    }
  });
}
