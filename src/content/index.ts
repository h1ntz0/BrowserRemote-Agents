import { VisualOverlayManager } from './overlay';

export class ContentScriptExecutor {
  private overlay: VisualOverlayManager;

  constructor() {
    this.overlay = new VisualOverlayManager();
    this.listenToMessages();
  }

  private listenToMessages() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      this.handleAction(message)
        .then(result => sendResponse({ status: 'SUCCESS', data: result }))
        .catch(err => sendResponse({ status: 'ERROR', error: err.message }));
      return true; // Keep asynchronous channel open
    });
  }

  public async handleAction(msg: { action: string; payload?: any }): Promise<any> {
    const { action, payload = {} } = msg;

    switch (action) {
      case 'INSPECT_DOM':
        return this.inspectDom(payload.selector || 'body', payload.maxDepth || 4);

      case 'FIND_ELEMENT':
        return this.findElement(payload.selector, payload.textMatch);

      case 'CLICK':
        return this.clickElement(payload.selector);

      case 'TYPE':
        return this.typeIntoElement(payload.selector, payload.text, payload.pressEnter);

      case 'SCROLL':
        return this.scrollPage(payload.direction, payload.amount);

      case 'NAVIGATE':
        window.location.href = payload.url;
        return { navigating: true, target: payload.url };

      case 'WAIT':
        return this.waitMsOrSelector(payload.ms, payload.waitForSelector);

      case 'DETECT_CAPTCHA':
        return this.detectCaptcha();

      case 'EXTRACT_DATA':
        return this.extractDataBySchema(payload.schema);

      case 'HIGHLIGHT_ELEMENT':
        if (payload.selector) {
          const el = document.querySelector(payload.selector) as HTMLElement;
          if (el) this.overlay.highlight(el, payload.label);
        }
        return { highlighted: true };

      case 'CLEAR_HIGHLIGHTS':
        this.overlay.clear();
        return { cleared: true };

      default:
        throw new Error(`Unsupported content script action: ${action}`);
    }
  }

  private inspectDom(selector: string, maxDepth: number): any {
    const root = document.querySelector(selector) || document.body;

    const serializeNode = (el: Element, depth: number): any => {
      if (depth > maxDepth) return null;

      const tag = el.tagName.toLowerCase();
      // Skip scripts, styles, svg paths
      if (['script', 'style', 'noscript', 'meta', 'link'].includes(tag)) return null;

      const isInteractive = ['a', 'button', 'input', 'select', 'textarea'].includes(tag) || el.getAttribute('role') === 'button';
      const id = el.id ? `#${el.id}` : '';
      const className = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').slice(0, 2).join('.')}` : '';
      
      const nodeSummary: any = {
        tag,
        selector: `${tag}${id}${className}`,
        interactive: isInteractive
      };

      if (isInteractive) {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          nodeSummary.placeholder = el.placeholder;
          nodeSummary.name = el.name;
          nodeSummary.type = el.type;
        } else if (el instanceof HTMLAnchorElement) {
          nodeSummary.href = el.href;
          nodeSummary.text = el.innerText?.slice(0, 60);
        } else {
          nodeSummary.text = (el as HTMLElement).innerText?.slice(0, 60);
        }
      }

      // Collect concise children
      const children: any[] = [];
      for (const child of Array.from(el.children)) {
        const serialized = serializeNode(child, depth + 1);
        if (serialized) children.push(serialized);
      }
      if (children.length > 0) nodeSummary.children = children.slice(0, 15);

      return nodeSummary;
    };

    return {
      title: document.title,
      url: window.location.href,
      structure: serializeNode(root, 1)
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

  private async clickElement(selector: string): Promise<any> {
    const el = document.querySelector(selector) as HTMLElement;
    if (!el) throw new Error(`Element not found: ${selector}`);

    this.overlay.highlight(el, `Click ${selector}`);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    await new Promise(r => setTimeout(r, 200));

    // Simulate realistic user click events
    el.focus();
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.click();

    setTimeout(() => this.overlay.clear(), 1000);
    return { clicked: true, selector };
  }

  private async typeIntoElement(selector: string, text: string, pressEnter: boolean = false): Promise<any> {
    const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    if (!el) throw new Error(`Element not found: ${selector}`);

    this.overlay.highlight(el, `Typing into ${selector}`);
    el.focus();
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    if (pressEnter) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    }

    setTimeout(() => this.overlay.clear(), 1000);
    return { typed: true, length: text.length };
  }

  private scrollPage(direction: 'up' | 'down' | 'top' | 'bottom', amount: number = 500): any {
    if (direction === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (direction === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    else if (direction === 'down') window.scrollBy({ top: amount, behavior: 'smooth' });
    else if (direction === 'up') window.scrollBy({ top: -amount, behavior: 'smooth' });
    return { scrolled: true, scrollY: window.scrollY };
  }

  private async waitMsOrSelector(ms?: number, waitForSelector?: string): Promise<any> {
    if (waitForSelector) {
      const startTime = Date.now();
      while (Date.now() - startTime < (ms || 10000)) {
        if (document.querySelector(waitForSelector)) return { found: true, selector: waitForSelector };
        await new Promise(r => setTimeout(r, 250));
      }
      throw new Error(`Timeout waiting for selector: ${waitForSelector}`);
    }
    await new Promise(r => setTimeout(r, ms || 1000));
    return { waitedMs: ms || 1000 };
  }

  private detectCaptcha(): { hasChallenge: boolean; type?: string; details?: string } {
    // Check for common CAPTCHA / bot protection signatures
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

// Instantiate on content script load
if (typeof window !== 'undefined') {
  new ContentScriptExecutor();
}
