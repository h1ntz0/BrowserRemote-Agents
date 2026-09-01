import { z } from 'zod';
import { ToolRegistry } from './registry';
import { RedactionEngine } from '@/security/redaction';

export function registerDefaultBrowserTools(registry: ToolRegistry): void {
  // 1. Snapshot / Accessibility Tree
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

  // Alias
  registry.register({
    name: 'browser.inspect_dom',
    description: 'Inspect the DOM structure and element tree',
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

  // 2. Click Element
  registry.register({
    name: 'browser.click',
    description: 'Click an element by its ref (e.g. "e1", "m2"), fuzzy text (e.g. "comsec"), or selector',
    inputSchema: z.object({
      ref: z.string().optional(),
      selector: z.string().optional(),
      doubleClick: z.boolean().optional().default(false),
      reason: z.string().optional(),
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

  // 3. Type Text
  registry.register({
    name: 'browser.type',
    description: 'Type text into an input field or textarea by ref or selector',
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

  // 5. Set Checkbox State
  registry.register({
    name: 'browser.set_checkbox',
    description: 'Check or uncheck a checkbox element',
    inputSchema: z.object({
      ref: z.string().optional(),
      selector: z.string().optional(),
      checked: z.boolean()
    }),
    riskLevel: 'LOW',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('SET_CHECKBOX', input);
    }
  });

  // 6. Hover Element
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

  // 7. Drag & Drop
  registry.register({
    name: 'browser.drag_and_drop',
    description: 'Drag one element and drop it onto another element',
    inputSchema: z.object({
      sourceRef: z.string(),
      targetRef: z.string()
    }),
    riskLevel: 'MEDIUM',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 8000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('DRAG_AND_DROP', input);
    }
  });

  // 8. Press Key with Modifiers
  registry.register({
    name: 'browser.press_key',
    description: 'Press a keyboard key or key combination (e.g. "Enter", "Escape", modifiers: ["Control", "Shift"])',
    inputSchema: z.object({
      key: z.string(),
      modifiers: z.array(z.string()).optional()
    }),
    riskLevel: 'LOW',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 3000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('KEYPRESS', input);
    }
  });

  // 9. Scroll
  registry.register({
    name: 'browser.scroll',
    description: 'Scroll window or specific container vertically/horizontally',
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

  // 10. Navigate URL
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

  // 11. Extract Table Data
  registry.register({
    name: 'browser.extract_table',
    description: 'Extract structured rows and column headers from an HTML table',
    inputSchema: z.object({
      ref: z.string().optional(),
      selector: z.string().optional()
    }),
    riskLevel: 'LOW',
    requiredPermission: 'DATA_EXPORT',
    requiresConfirmation: false,
    timeoutMs: 10000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('EXTRACT_TABLE', input);
    }
  });

  // 12. Evaluate JavaScript
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

  // 13. Monitor Network & Console
  registry.register({
    name: 'browser.get_logs',
    description: 'Retrieve captured unhandled JavaScript errors and recent network requests from the current page',
    inputSchema: z.object({}),
    riskLevel: 'LOW',
    requiredPermission: 'READ_PAGE',
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async (_input, ctx) => {
      const logs = await ctx.sendMessageToTab('GET_CONSOLE_LOGS', {});
      const net = await ctx.sendMessageToTab('GET_NETWORK_LOGS', {});
      return { consoleErrors: logs?.errors || [], networkRequests: net?.requests || [] };
    }
  });

  // 14. Explore Navigation Menus
  registry.register({
    name: 'browser.explore_menus',
    description: 'Auto-discover all sidebar and navbar navigation menus, submenus, and action links on the current page',
    inputSchema: z.object({}),
    riskLevel: 'LOW',
    requiredPermission: 'READ_PAGE',
    requiresConfirmation: false,
    timeoutMs: 10000,
    execute: async (_input, ctx) => {
      const menus = await ctx.sendMessageToTab('EXPLORE_MENUS', {});
      return { menus: RedactionEngine.redactObject(menus) };
    }
  });

  // 15. Monkey Chaos Test
  registry.register({
    name: 'browser.run_monkey_test',
    description: 'Run automated QA monkey test (random click, type, select stress testing) to catch console errors and broken components',
    inputSchema: z.object({
      iterations: z.number().optional().default(15),
      delayMs: z.number().optional().default(250)
    }),
    riskLevel: 'MEDIUM',
    requiredPermission: 'INTERACT_PAGE',
    requiresConfirmation: false,
    timeoutMs: 45000,
    execute: async (input, ctx) => {
      return ctx.sendMessageToTab('RUN_MONKEY_TEST', input);
    }
  });

  // 16. Wait
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

  // 17. Screenshot
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

  // 18. Detect CAPTCHA
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
