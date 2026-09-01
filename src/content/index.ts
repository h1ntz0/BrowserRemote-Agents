import { VisualOverlayManager } from './overlay';

export interface ElementNode {
  ref: string;
  tag: string;
  type?: string;
  name?: string;
  text: string;
  value?: string;
  placeholder?: string;
  href?: string;
  role?: string;
  selector: string;
  isVisible: boolean;
  isClickable: boolean;
  rect: { top: number; left: number; width: number; height: number };
}

export class ContentScriptExecutor {
  private overlay: VisualOverlayManager;
  private refMap: Map<string, HTMLElement> = new Map();
  private capturedConsoleErrors: string[] = [];
  private capturedNetworkRequests: Array<{ url: string; method: string; status: number; timestamp: number }> = [];
  private isMonkeyRunning: boolean = false;

  constructor() {
    this.overlay = new VisualOverlayManager();
    this.interceptConsoleErrors();
    this.interceptNetwork();
    this.listenToMessages();
  }

  private interceptConsoleErrors() {
    const origError = console.error;
    console.error = (...args: any[]) => {
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      this.capturedConsoleErrors.push(msg);
      if (this.capturedConsoleErrors.length > 60) this.capturedConsoleErrors.shift();
      origError.apply(console, args);
    };

    window.addEventListener('error', (e) => {
      this.capturedConsoleErrors.push(`[UNHANDLED] ${e.message} at ${e.filename}:${e.lineno}`);
    });
  }

  private interceptNetwork() {
    // Intercept fetch
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
      const method = (args[1]?.method || 'GET').toUpperCase();
      try {
        const response = await origFetch.apply(window, args);
        this.capturedNetworkRequests.push({
          url,
          method,
          status: response.status,
          timestamp: Date.now()
        });
        if (this.capturedNetworkRequests.length > 50) this.capturedNetworkRequests.shift();
        return response;
      } catch (err) {
        this.capturedNetworkRequests.push({
          url,
          method,
          status: 0,
          timestamp: Date.now()
        });
        throw err;
      }
    };
  }

  private listenToMessages() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      this.handleAction(message)
        .then(result => sendResponse({ status: 'SUCCESS', data: result }))
        .catch(err => sendResponse({ status: 'ERROR', error: err.message }));
      return true;
    });
  }

  public async handleAction(msg: { action: string; payload?: any }): Promise<any> {
    const { action, payload = {} } = msg;

    switch (action) {
      case 'INSPECT_DOM':
      case 'SNAPSHOT':
        return this.getInteractiveSnapshot(payload.renderVisualTags ?? true);

      case 'EXPLORE_MENUS':
        return this.discoverNavigationMenus();

      case 'RUN_MONKEY_TEST':
        return this.executeMonkeyTest(payload.iterations || 15, payload.delayMs || 250);

      case 'STOP_MONKEY_TEST':
        this.isMonkeyRunning = false;
        return { stopped: true };

      case 'GET_CONSOLE_LOGS':
        return { errors: [...this.capturedConsoleErrors] };

      case 'CLEAR_CONSOLE_LOGS':
        this.capturedConsoleErrors = [];
        return { cleared: true };

      case 'GET_NETWORK_LOGS':
        return { requests: [...this.capturedNetworkRequests] };

      case 'FIND_ELEMENT':
        return this.findElement(payload.selector, payload.textMatch);

      case 'CLICK':
        return this.clickElement(payload.ref || payload.selector, payload.doubleClick);

      case 'TYPE':
        return this.typeIntoElement(payload.ref || payload.selector, payload.text, payload.pressEnter, payload.clearFirst);

      case 'SELECT_OPTION':
        return this.selectOption(payload.ref || payload.selector, payload.value);

      case 'SET_CHECKBOX':
        return this.setCheckbox(payload.ref || payload.selector, payload.checked);

      case 'HOVER':
        return this.hoverElement(payload.ref || payload.selector);

      case 'DRAG_AND_DROP':
        return this.dragAndDrop(payload.sourceRef || payload.sourceSelector, payload.targetRef || payload.targetSelector);

      case 'KEYPRESS':
        return this.pressKey(payload.key, payload.modifiers);

      case 'SCROLL':
        return this.scrollPage(payload.direction, payload.amount, payload.ref || payload.selector);

      case 'NAVIGATE':
        window.location.href = payload.url;
        return { navigating: true, target: payload.url };

      case 'EVALUATE_JS':
        return this.evaluateScript(payload.code);

      case 'EXTRACT_TABLE':
        return this.extractTable(payload.ref || payload.selector);

      case 'WAIT':
        return this.waitMsOrSelector(payload.ms, payload.waitForSelector);

      case 'DETECT_CAPTCHA':
        return this.detectCaptcha();

      case 'EXTRACT_DATA':
        return this.extractDataBySchema(payload.schema);

      case 'HIGHLIGHT_ELEMENT':
        const el = this.resolveElement(payload.ref || payload.selector);
        if (el) this.overlay.highlight(el, payload.label);
        return { highlighted: true };

      case 'CLEAR_HIGHLIGHTS':
        this.overlay.clear();
        this.overlay.clearRefTags();
        return { cleared: true };

      default:
        throw new Error(`Unsupported content script action: ${action}`);
    }
  }

  private resolveElement(refOrSelector: string): HTMLElement | null {
    if (!refOrSelector) return null;
    const targetStr = String(refOrSelector).trim();

    // 1. Check refMap direct
    if (this.refMap.has(targetStr)) {
      const el = this.refMap.get(targetStr);
      if (el && document.contains(el)) return el;
    }

    // 2. Direct selector query
    try {
      const el = document.querySelector(targetStr) as HTMLElement;
      if (el) return el;
    } catch {}

    // 3. Match by ID directly
    try {
      const byId = document.getElementById(targetStr.replace(/^#/, ''));
      if (byId) return byId;
    } catch {}

    // 4. Fuzzy Match by aria-label, placeholder, title, or innerText
    const lower = targetStr.toLowerCase();
    const allInteractive = Array.from(document.querySelectorAll(
      'a, button, input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="tab"], h1, h2, h3, h4, span, div, p, label'
    )) as HTMLElement[];

    for (const item of allInteractive) {
      if (item.closest('#bab-overlay-root')) continue;
      const aria = item.getAttribute('aria-label')?.toLowerCase() || '';
      const ph = item.getAttribute('placeholder')?.toLowerCase() || '';
      const title = item.getAttribute('title')?.toLowerCase() || '';
      const txt = item.innerText?.trim().toLowerCase() || '';

      if (aria === lower || ph === lower || title === lower || txt === lower) {
        return item;
      }
    }

    // Substring match
    for (const item of allInteractive) {
      if (item.closest('#bab-overlay-root')) continue;
      const txt = item.innerText?.trim().toLowerCase() || '';
      if (txt && txt.length < 50 && (txt.includes(lower) || lower.includes(txt))) {
        return item;
      }
    }

    return null;
  }

  private isElementVisible(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
  }

  public getInteractiveSnapshot(renderVisualTags = true): {
    title: string;
    url: string;
    elements: ElementNode[];
    formattedTree: string;
  } {
    this.refMap.clear();

    const query = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'textarea',
      'select',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="combobox"]',
      '[contenteditable="true"]',
      'summary',
      'h1', 'h2', 'h3', 'h4',
      'label',
      '[data-clickable="true"]'
    ].join(',');

    const rawElements = Array.from(document.querySelectorAll(query)) as HTMLElement[];
    const elements: ElementNode[] = [];
    const treeLines: string[] = [];
    const visualTags: Array<{ ref: string; rect: DOMRect; label: string }> = [];

    let count = 1;
    for (const el of rawElements) {
      if (el.closest('#bab-overlay-root')) continue;
      
      const isVisible = this.isElementVisible(el);
      const tag = el.tagName.toLowerCase();
      const ref = `e${count++}`;
      this.refMap.set(ref, el);

      const isHeading = ['h1', 'h2', 'h3', 'h4'].includes(tag);
      const isClickable = !isHeading && (['a', 'button', 'select'].includes(tag) || el.getAttribute('role') === 'button' || el.onclick !== null);

      const rect = el.getBoundingClientRect();
      const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').filter(Boolean).slice(0, 2).join('.')}` : '';
      const selector = `${tag}${id}${cls}`;

      const elInfo: ElementNode = {
        ref,
        tag,
        text,
        selector,
        role: el.getAttribute('role') || undefined,
        isVisible,
        isClickable,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
      };

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        elInfo.type = el.type;
        elInfo.placeholder = el.placeholder;
        elInfo.value = el.value;
      } else if (el instanceof HTMLAnchorElement) {
        elInfo.href = el.href;
      }

      elements.push(elInfo);

      if (isVisible) {
        visualTags.push({ ref, rect, label: text || tag });
      }

      // Compact representation line for LLM
      if (!isHeading) {
        let desc = `[${ref}] <${tag}>`;
        if (text) desc += ` "${text}"`;
        if (elInfo.placeholder) desc += ` [placeholder="${elInfo.placeholder}"]`;
        if (elInfo.value) desc += ` [value="${elInfo.value}"]`;
        if (elInfo.type) desc += ` [type="${elInfo.type}"]`;
        if (elInfo.href) desc += ` [href="${elInfo.href}"]`;
        if (!isVisible) desc += ` (hidden)`;
        treeLines.push(desc);
      } else if (text) {
        treeLines.push(`### ${text}`);
      }
    }

    if (renderVisualTags) {
      this.overlay.renderRefTags(visualTags.slice(0, 90));
    }

    return {
      title: document.title,
      url: window.location.href,
      elements,
      formattedTree: treeLines.slice(0, 150).join('\n')
    };
  }

  public discoverNavigationMenus(): Array<{
    ref: string;
    label: string;
    tag: string;
    href?: string;
    selector: string;
    isSubmenu: boolean;
  }> {
    this.refMap.clear();
    const query = [
      'aside a', 'aside button', 'aside [role="menuitem"]',
      'nav a', 'nav button', 'nav [role="menuitem"]',
      '.sidebar a', '.sidebar button', '.menu a', '.menu button',
      '[role="navigation"] a', '[role="navigation"] button',
      'header nav a', 'header nav button',
      'ul.nav a', 'ul.navbar-nav a',
      '.v-navigation-drawer a', '.ant-menu-item', '.el-menu-item'
    ].join(',');

    let navElements = Array.from(document.querySelectorAll(query)) as HTMLElement[];
    if (navElements.length === 0) {
      navElements = Array.from(document.querySelectorAll('a[href], button')).filter(el => {
        const text = (el as HTMLElement).innerText?.trim();
        return text && text.length > 1 && text.length < 35;
      }) as HTMLElement[];
    }

    const uniqueMap = new Map<string, any>();
    let count = 1;

    for (const el of navElements) {
      if (el.closest('#bab-overlay-root')) continue;
      const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
      if (!text || text.length > 40) continue;

      const ref = `m${count++}`;
      this.refMap.set(ref, el);

      const tag = el.tagName.toLowerCase();
      const href = el instanceof HTMLAnchorElement ? el.href : undefined;
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').filter(Boolean).slice(0, 2).join('.')}` : '';
      const isSubmenu = el.closest('ul ul, div div, [role="group"]') !== null;

      if (!uniqueMap.has(text.toLowerCase())) {
        uniqueMap.set(text.toLowerCase(), {
          ref,
          label: text,
          tag,
          href,
          selector: `${tag}${id}${cls}`,
          isSubmenu
        });
      }
    }

    return Array.from(uniqueMap.values());
  }

  public async executeMonkeyTest(iterations: number = 15, delayMs: number = 250): Promise<{
    executedSteps: number;
    actions: Array<{ step: number; action: string; target: string; time: number }>;
    capturedErrors: string[];
  }> {
    this.isMonkeyRunning = true;
    const actions: any[] = [];
    this.overlay.setStatus('Monkey Chaos Test Running...', 'waiting');

    const dummyInputs = [
      'test_user', 'sample@example.com', '123456', '<script>alert(1)</script>',
      'Admin', '100.50', 'Test Notes', 'Jakarta', '2026-09-01'
    ];

    for (let i = 1; i <= iterations; i++) {
      if (!this.isMonkeyRunning) break;

      const interactives = Array.from(document.querySelectorAll(
        'button:not([disabled]), a[href], input:not([type="hidden"]), select, [role="button"]'
      )).filter(el => !el.closest('#bab-overlay-root') && this.isElementVisible(el as HTMLElement)) as HTMLElement[];

      if (interactives.length === 0) {
        window.scrollBy({ top: (Math.random() > 0.5 ? 300 : -300), behavior: 'smooth' });
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }

      const randomEl = interactives[Math.floor(Math.random() * interactives.length)];
      const tag = randomEl.tagName.toLowerCase();
      const label = (randomEl.innerText || randomEl.getAttribute('aria-label') || tag).slice(0, 30);

      this.overlay.highlight(randomEl, `Monkey #${i}: ${label}`);

      try {
        if (randomEl instanceof HTMLInputElement || randomEl instanceof HTMLTextAreaElement) {
          const sampleText = dummyInputs[Math.floor(Math.random() * dummyInputs.length)];
          randomEl.focus();
          randomEl.value = sampleText;
          randomEl.dispatchEvent(new Event('input', { bubbles: true }));
          randomEl.dispatchEvent(new Event('change', { bubbles: true }));
          actions.push({ step: i, action: 'TYPE', target: `${tag} -> ${sampleText}`, time: Date.now() });
        } else if (randomEl instanceof HTMLSelectElement && randomEl.options.length > 0) {
          randomEl.selectedIndex = Math.floor(Math.random() * randomEl.options.length);
          randomEl.dispatchEvent(new Event('change', { bubbles: true }));
          actions.push({ step: i, action: 'SELECT', target: `${tag} -> option ${randomEl.selectedIndex}`, time: Date.now() });
        } else {
          randomEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          randomEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          randomEl.click();
          actions.push({ step: i, action: 'CLICK', target: `${tag} "${label}"`, time: Date.now() });
        }
      } catch (e: any) {
        actions.push({ step: i, action: 'ERROR', target: e.message, time: Date.now() });
      }

      await new Promise(r => setTimeout(r, delayMs));
    }

    this.isMonkeyRunning = false;
    this.overlay.clear();
    this.overlay.setStatus('Monkey Test Completed', 'active');

    return {
      executedSteps: actions.length,
      actions,
      capturedErrors: [...this.capturedConsoleErrors]
    };
  }

  private findElement(selector?: string, textMatch?: string): any {
    if (selector) {
      const elements = Array.from(document.querySelectorAll(selector)).slice(0, 10);
      return elements.map(el => ({
        tagName: el.tagName.toLowerCase(),
        text: (el as HTMLElement).innerText?.slice(0, 100),
        rect: el.getBoundingClientRect()
      }));
    }
    if (textMatch) {
      const matchLower = textMatch.toLowerCase();
      const allInteractive = Array.from(document.querySelectorAll('button, a, input, [role="button"], span, div'));
      const matches = allInteractive.filter(el => (el as HTMLElement).innerText?.toLowerCase().includes(matchLower)).slice(0, 5);
      return matches.map(el => ({
        tagName: el.tagName.toLowerCase(),
        text: (el as HTMLElement).innerText?.slice(0, 100),
        rect: el.getBoundingClientRect()
      }));
    }
    return [];
  }

  private async clickElement(refOrSelector: string, doubleClick = false): Promise<any> {
    const el = this.resolveElement(refOrSelector);
    if (!el) throw new Error(`Element not found: "${refOrSelector}"`);

    this.overlay.highlight(el, `${doubleClick ? 'Double Click' : 'Click'} ${refOrSelector}`);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    await new Promise(r => setTimeout(r, 150));

    el.focus();
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.click();

    if (doubleClick) {
      await new Promise(r => setTimeout(r, 80));
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    }

    setTimeout(() => this.overlay.clear(), 800);
    return { clicked: true, target: refOrSelector, text: el.innerText?.slice(0, 50) };
  }

  private async typeIntoElement(refOrSelector: string, text: string, pressEnter = false, clearFirst = true): Promise<any> {
    const el = this.resolveElement(refOrSelector) as HTMLInputElement | HTMLTextAreaElement;
    if (!el) throw new Error(`Input element not found: "${refOrSelector}"`);

    this.overlay.highlight(el, `Typing into ${refOrSelector}`);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();

    if (clearFirst) {
      el.value = '';
    }

    el.value = (el.value || '') + text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    if (pressEnter) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      
      if (el.form) {
        el.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    }

    setTimeout(() => this.overlay.clear(), 800);
    return { typed: true, target: refOrSelector, textLength: text.length };
  }

  private async selectOption(refOrSelector: string, value: string): Promise<any> {
    const el = this.resolveElement(refOrSelector) as HTMLSelectElement;
    if (!el || !(el instanceof HTMLSelectElement)) throw new Error(`Select element not found: "${refOrSelector}"`);

    this.overlay.highlight(el, `Select ${value}`);
    el.focus();
    
    let matched = false;
    for (let i = 0; i < el.options.length; i++) {
      if (el.options[i].value === value || el.options[i].text.toLowerCase().includes(value.toLowerCase())) {
        el.selectedIndex = i;
        matched = true;
        break;
      }
    }

    if (!matched) el.value = value;

    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { selected: true, target: refOrSelector, value };
  }

  private async setCheckbox(refOrSelector: string, checked: boolean): Promise<any> {
    const el = this.resolveElement(refOrSelector) as HTMLInputElement;
    if (!el) throw new Error(`Checkbox element not found: "${refOrSelector}"`);

    this.overlay.highlight(el, `Set checked=${checked}`);
    el.focus();
    el.checked = checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { checked: el.checked, target: refOrSelector };
  }

  private async hoverElement(refOrSelector: string): Promise<any> {
    const el = this.resolveElement(refOrSelector);
    if (!el) throw new Error(`Element not found: "${refOrSelector}"`);

    this.overlay.highlight(el, `Hover ${refOrSelector}`);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    return { hovered: true, target: refOrSelector };
  }

  private async dragAndDrop(sourceRef: string, targetRef: string): Promise<any> {
    const sourceEl = this.resolveElement(sourceRef);
    const targetEl = this.resolveElement(targetRef);
    if (!sourceEl) throw new Error(`Source drag element not found: ${sourceRef}`);
    if (!targetEl) throw new Error(`Target drop element not found: ${targetRef}`);

    this.overlay.highlight(sourceEl, `Drag -> ${targetRef}`);
    const dt = new DataTransfer();

    sourceEl.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    targetEl.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
    targetEl.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    sourceEl.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true }));

    return { dragged: true, from: sourceRef, to: targetRef };
  }

  private async pressKey(key: string, modifiers?: string[]): Promise<any> {
    const activeEl = document.activeElement || document.body;
    const keyEventInit: KeyboardEventInit = {
      key,
      code: key,
      bubbles: true,
      ctrlKey: modifiers?.includes('Control') || modifiers?.includes('Ctrl'),
      shiftKey: modifiers?.includes('Shift'),
      altKey: modifiers?.includes('Alt'),
      metaKey: modifiers?.includes('Meta') || modifiers?.includes('Command')
    };

    activeEl.dispatchEvent(new KeyboardEvent('keydown', keyEventInit));
    activeEl.dispatchEvent(new KeyboardEvent('keyup', keyEventInit));
    return { pressedKey: key, modifiers };
  }

  private scrollPage(direction: 'up' | 'down' | 'top' | 'bottom', amount: number = 500, refOrSelector?: string): any {
    if (refOrSelector) {
      const container = this.resolveElement(refOrSelector);
      if (container) {
        if (direction === 'down') container.scrollTop += amount;
        else if (direction === 'up') container.scrollTop -= amount;
        else if (direction === 'bottom') container.scrollTop = container.scrollHeight;
        else if (direction === 'top') container.scrollTop = 0;
        return { scrolledContainer: refOrSelector, scrollY: container.scrollTop };
      }
    }

    if (direction === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (direction === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    else if (direction === 'down') window.scrollBy({ top: amount, behavior: 'smooth' });
    else if (direction === 'up') window.scrollBy({ top: -amount, behavior: 'smooth' });
    return { scrolled: true, scrollY: window.scrollY };
  }

  private extractTable(refOrSelector?: string): any {
    const table = (refOrSelector ? this.resolveElement(refOrSelector) : document.querySelector('table')) as HTMLTableElement;
    if (!table || table.tagName.toLowerCase() !== 'table') {
      throw new Error(`Table not found for selector: ${refOrSelector || 'table'}`);
    }

    const headers: string[] = [];
    table.querySelectorAll('thead th, tr:first-child th, tr:first-child td').forEach(th => {
      headers.push((th as HTMLElement).innerText.trim() || `col_${headers.length + 1}`);
    });

    const rows: Record<string, string>[] = [];
    const trs = Array.from(table.querySelectorAll('tbody tr, tr')).slice(headers.length > 0 ? 1 : 0);

    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll('td, th'));
      if (cells.length === 0) continue;
      const rowData: Record<string, string> = {};
      cells.forEach((cell, idx) => {
        const headerKey = headers[idx] || `col_${idx + 1}`;
        rowData[headerKey] = (cell as HTMLElement).innerText.trim();
      });
      rows.push(rowData);
    }

    return { totalRows: rows.length, headers, rows };
  }

  private evaluateScript(code: string): any {
    try {
      const result = new Function(`"use strict"; return (${code});`)();
      return { evaluated: true, result };
    } catch (err: any) {
      throw new Error(`JavaScript evaluation error: ${err.message}`);
    }
  }

  private async waitMsOrSelector(ms?: number, waitForSelector?: string): Promise<any> {
    if (waitForSelector) {
      const startTime = Date.now();
      while (Date.now() - startTime < (ms || 10000)) {
        if (this.resolveElement(waitForSelector)) return { found: true, selector: waitForSelector };
        await new Promise(r => setTimeout(r, 250));
      }
      throw new Error(`Timeout waiting for selector: ${waitForSelector}`);
    }
    await new Promise(r => setTimeout(r, ms || 1000));
    return { waitedMs: ms || 1000 };
  }

  private detectCaptcha(): { hasChallenge: boolean; type?: string; details?: string } {
    const pageText = document.body.innerText.toLowerCase();
    const cloudflareDetected = document.querySelector('iframe[src*="challenges.cloudflare.com"]') || pageText.includes('verifying you are human') || pageText.includes('checking your browser');
    const recaptchaDetected = document.querySelector('.g-recaptcha, iframe[src*="google.com/recaptcha"]');
    const hcaptchaDetected = document.querySelector('.h-captcha, iframe[src*="hcaptcha.com"]');
    const twoFactorDetected = pageText.includes('two-factor authentication') || pageText.includes('enter the 6-digit code') || document.querySelector('input[autocomplete="one-time-code"]');

    if (cloudflareDetected) {
      this.overlay.setStatus('Cloudflare Challenge Detected - Human Required', 'blocked');
      return { hasChallenge: true, type: 'CLOUDFLARE', details: 'Cloudflare turnstile challenge detected' };
    }
    if (recaptchaDetected) {
      this.overlay.setStatus('reCAPTCHA Detected - Human Required', 'blocked');
      return { hasChallenge: true, type: 'RECAPTCHA', details: 'Google reCAPTCHA challenge detected' };
    }
    if (hcaptchaDetected) {
      this.overlay.setStatus('hCaptcha Detected - Human Required', 'blocked');
      return { hasChallenge: true, type: 'HCAPTCHA', details: 'hCaptcha challenge detected' };
    }
    if (twoFactorDetected) {
      this.overlay.setStatus('2FA Authentication Challenge - Human Required', 'blocked');
      return { hasChallenge: true, type: '2FA_CHALLENGE', details: 'Two-factor or OTP authentication screen detected' };
    }

    return { hasChallenge: false };
  }

  private extractDataBySchema(schema: any): any[] {
    if (!schema || !schema.containerSelector) return [];
    const containers = Array.from(document.querySelectorAll(schema.containerSelector));
    return containers.map(container => {
      const record: Record<string, any> = {};
      for (const field of schema.fields || []) {
        const el = container.querySelector(field.selector);
        if (!el) {
          record[field.name] = null;
          continue;
        }
        if (field.attribute === 'href' && el instanceof HTMLAnchorElement) {
          record[field.name] = el.href;
        } else if (field.attribute === 'src' && el instanceof HTMLImageElement) {
          record[field.name] = el.src;
        } else if (field.attribute === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) {
          record[field.name] = el.value;
        } else {
          const rawText = (el as HTMLElement).innerText?.trim() || '';
          if (field.type === 'number') {
            const numMatch = rawText.replace(/[^0-9.-]/g, '');
            record[field.name] = numMatch ? parseFloat(numMatch) : null;
          } else {
            record[field.name] = rawText;
          }
        }
      }
      return record;
    });
  }
}

if (typeof window !== 'undefined') {
  (window as any).__BAB_EXECUTOR__ = new ContentScriptExecutor();
}
