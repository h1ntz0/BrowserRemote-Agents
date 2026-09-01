export class RedactionEngine {
  private static readonly PATTERNS = [
    // Authorization Headers first before single JWT matching
    { pattern: /(?:Bearer|Basic|Token)\s+[A-Za-z0-9\-._~+/]+=*/gi, label: 'Authorization: [REDACTED_AUTH_HEADER]' },
    // JWT Tokens
    { pattern: /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, label: '[REDACTED_JWT]' },
    // API Keys (e.g. OpenAI sk-..., Anthropic sk-ant-..., Google AIza...)
    { pattern: /sk-[a-zA-Z0-9_-]{20,}/g, label: '[REDACTED_API_KEY]' },
    { pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g, label: '[REDACTED_API_KEY]' },
    { pattern: /AIza[0-9A-Za-z-_]{35}/g, label: '[REDACTED_API_KEY]' },
    // Credit Cards (Visa, MasterCard, Amex, Discover)
    { pattern: /\b(?:\d{4}[ -]?){3}\d{4}\b/g, label: '[REDACTED_CREDIT_CARD]' },
    // Passwords in query strings or JSON
    { pattern: /(["']?password["']?\s*[:=]\s*["'])([^"']+)(["'])/gi, label: '$1[REDACTED_PASSWORD]$3' },
    // Session / Cookie tokens
    { pattern: /(["']?(?:session_id|sessionToken|sid|auth_token|PHPSESSID|JSESSIONID)["']?\s*[:=]\s*["'])([^"']+)(["'])/gi, label: '$1[REDACTED_SESSION_TOKEN]$3' }
  ];

  public static redact(content: string): string {
    if (!content || typeof content !== 'string') return content;
    let sanitized = content;
    for (const { pattern, label } of this.PATTERNS) {
      sanitized = sanitized.replace(pattern, label);
    }
    return sanitized;
  }

  public static redactObject<T>(obj: T): T {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      return this.redact(obj) as unknown as T;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.redactObject(item)) as unknown as T;
    }
    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (/password|secret|token|auth|cookie|key/i.test(key) && typeof value === 'string') {
          result[key] = '[REDACTED_SENSITIVE_FIELD]';
        } else {
          result[key] = this.redactObject(value);
        }
      }
      return result as unknown as T;
    }
    return obj;
  }
}
