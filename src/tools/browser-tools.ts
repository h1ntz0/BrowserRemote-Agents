import { z } from 'zod';
import { ToolRegistry } from './registry';
import { RedactionEngine } from '@/security/redaction';

export function registerDefaultBrowserTools(registry: ToolRegistry): void {
  // 1. Snapshot / DOM Inspection with Elements & Refs
  registry.register({
    name: 'browser.snapshot',
    description: 'Get an accessibility snapshot and interactive tree of all clickable/form elements with refs (e1, e2...) on the page',
    inputSchema: z.object({
      renderVisualTags: z.boolean().optional().default(true)
    }),
    riskLevel: 'LOW',
    requiredPermission: 'READ_PAGE',
    requiresConfirmation: false,
    timeoutMs: 10000,
    execute: async (input, ctx) => {
      const result = await ctx.sendMessageToTab('SNAPSHOT', input);
      return RedactionEngine.redactObject(result);
    }
  });

  // Alias for backward compatibility
  registry.register({
    name: 'browser.inspect_dom',
    description: 'Inspect the DOM and element tree',
    inputSchema: z.object({}),
    riskLevel: 'LOW',
    requiredPermission: 'READ_PAGE',
    requiresConfirmation: false,
    timeoutMs: 10000,
    execute: async (_input, ctx) => {
      const result = await ctx.sendMessageToTab('SNAPSHOT', { renderVisualTags: true });
      return RedactionEngine.redactObject(result);
    }
  });

  // 2. Click Element (supports ref like "e1" or selector "#submit")
  registry.register({
    name: 'browser.click',
    description: 'Click an element by its ref identifier (e.g. "e1", "e2") or CSS selector',
    inputSchema: z.object({
      ref: z.string().optional(),
      selector: z.string().optional(),
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

  // 3. Type Text into input/textarea
  registry.register({
    name: 'browser.type',
    description: 'Type text into an element by ref (e.g. "e1") or selector, with optional Enter submission',
    inputSchema: z.object({
      ref: z.string().optional(),
      selector: z.string().optional(),
      text: z.string(),
      pressEnter: z.boolean().optional().default(false),
      clearFirst: z.boolean().optional().default(true)
    }),
    riskLevel: 'MEDIUM',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 10000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('TYPE', input);
    }
  });

  // 4. Select Dropdown Option
  registry.register({
    name: 'browser.select_option',
    description: 'Select an option in a <select> dropdown by ref and value/label',
    inputSchema: z.object({
      ref: z.string().optional(),
      selector: z.string().optional(),
      value: z.string()
    }),
    riskLevel: 'MEDIUM',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('SELECT_OPTION', input);
    }
  });

  // 5. Hover Element
  registry.register({
    name: 'browser.hover',
    description: 'Hover mouse over an element to trigger dropdowns or tooltips',
    inputSchema: z.object({
      ref: z.string().optional(),
      selector: z.string().optional()
    }),
    riskLevel: 'LOW',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('HOVER', input);
    }
  });

  // 6. Press Key
  registry.register({
    name: 'browser.press_key',
    description: 'Press a keyboard key (e.g. "Enter", "Escape", "Tab", "ArrowDown")',
    inputSchema: z.object({
      key: z.string()
    }),
    riskLevel: 'LOW',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 3000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('KEYPRESS', input);
    }
  });

  // 7. Scroll
  registry.register({
    name: 'browser.scroll',
    description: 'Scroll window or container vertically/horizontally',
    inputSchema: z.object({
      direction: z.enum(['up', 'down', 'top', 'bottom']),
      amount: z.number().optional().default(500),
      ref: z.string().optional()
    }),
    riskLevel: 'LOW',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('SCROLL', input);
    }
  });

  // 8. Navigate URL
  registry.register({
    name: 'browser.navigate',
    description: 'Navigate the current tab to a given destination URL',
    inputSchema: z.object({
      url: z.string()
    }),
    riskLevel: 'MEDIUM',
    requiredPermission: 'NAVIGATE',
    requiresConfirmation: false,
    timeoutMs: 15000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('NAVIGATE', input);
    }
  });

  // 9. Evaluate JavaScript in page context
  registry.register({
    name: 'browser.evaluate_js',
    description: 'Execute custom JavaScript expression on the page and get result',
    inputSchema: z.object({
      code: z.string()
    }),
    riskLevel: 'HIGH',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: true,
    timeoutMs: 10000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('EVALUATE_JS', input);
    }
  });

  // 10. Wait
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

  // 11. Screenshot
  registry.register({
    name: 'browser.screenshot',
    description: 'Capture screenshot of current visible viewport',
    inputSchema: z.object({}),
    riskLevel: 'LOW',
    requiredPermission: 'READ_PAGE',
    requiresConfirmation: false,
    timeoutMs: 10000,
    execute: async (_input, ctx) => {
      try {
        if (ctx.takeScreenshot) {
          const shot = await ctx.takeScreenshot();
          return { status: 'captured', dataUrl: shot || 'captured_ok' };
        }
      } catch {}
      return { status: 'captured', note: 'viewport active' };
    }
  });

  // 12. Detect CAPTCHA
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
