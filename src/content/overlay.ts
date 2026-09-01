// Visual Overlay & Element Tag Marker
export class VisualOverlayManager {
  private overlayContainer: HTMLDivElement | null = null;
  private highlightBox: HTMLDivElement | null = null;
  private badge: HTMLDivElement | null = null;
  private tagContainer: HTMLDivElement | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (document.getElementById('bab-overlay-root')) return;

    this.overlayContainer = document.createElement('div');
    this.overlayContainer.id = 'bab-overlay-root';
    this.overlayContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 2147483640;
      display: block;
    `;

    this.tagContainer = document.createElement('div');
    this.tagContainer.id = 'bab-tags-layer';
    this.tagContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `;

    this.highlightBox = document.createElement('div');
    this.highlightBox.style.cssText = `
      position: absolute;
      border: 2px solid #3B82F6;
      background: rgba(59, 130, 246, 0.18);
      border-radius: 4px;
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      display: none;
      box-shadow: 0 0 12px rgba(59, 130, 246, 0.6);
      pointer-events: none;
      z-index: 2147483645;
    `;

    this.badge = document.createElement('div');
    this.badge.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #0F172A;
      border: 1px solid #334155;
      color: #F8FAFC;
      padding: 8px 14px;
      border-radius: 8px;
      font-family: 'JetBrains Mono', monospace, sans-serif;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      transition: all 0.2s ease;
      pointer-events: none;
      z-index: 2147483647;
    `;
    this.badge.innerHTML = `
      <span style="width: 8px; height: 8px; border-radius: 50%; background: #22C55E; display: inline-block;"></span>
      <span>Browser Agent: Ready</span>
    `;

    this.overlayContainer.appendChild(this.tagContainer);
    this.overlayContainer.appendChild(this.highlightBox);
    this.overlayContainer.appendChild(this.badge);
    document.documentElement.appendChild(this.overlayContainer);
  }

  public highlight(element: HTMLElement, label?: string) {
    if (!this.highlightBox) return;
    const rect = element.getBoundingClientRect();
    this.highlightBox.style.display = 'block';
    this.highlightBox.style.top = `${rect.top + window.scrollY}px`;
    this.highlightBox.style.left = `${rect.left + window.scrollX}px`;
    this.highlightBox.style.width = `${rect.width}px`;
    this.highlightBox.style.height = `${rect.height}px`;

    if (label && this.badge) {
      this.badge.innerHTML = `
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #3B82F6; display: inline-block;"></span>
        <span>Action: ${label}</span>
      `;
    }
  }

  public renderRefTags(elements: Array<{ ref: string; rect: DOMRect; label: string }>) {
    if (!this.tagContainer) return;
    this.tagContainer.innerHTML = '';
    
    for (const item of elements) {
      if (item.rect.width === 0 || item.rect.height === 0) continue;
      const tagEl = document.createElement('div');
      tagEl.style.cssText = `
        position: absolute;
        top: ${item.rect.top + window.scrollY}px;
        left: ${item.rect.left + window.scrollX}px;
        background: #3B82F6;
        color: #FFFFFF;
        font-family: 'JetBrains Mono', monospace, sans-serif;
        font-size: 9px;
        font-weight: bold;
        padding: 1px 4px;
        border-radius: 3px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        pointer-events: none;
        z-index: 2147483644;
      `;
      tagEl.innerText = item.ref;
      this.tagContainer.appendChild(tagEl);
    }
  }

  public clearRefTags() {
    if (this.tagContainer) {
      this.tagContainer.innerHTML = '';
    }
  }

  public setStatus(text: string, state: 'active' | 'waiting' | 'blocked' = 'active') {
    if (!this.badge) return;
    const color = state === 'active' ? '#3B82F6' : state === 'waiting' ? '#F59E0B' : '#EF4444';
    this.badge.innerHTML = `
      <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; display: inline-block;"></span>
      <span>${text}</span>
    `;
  }

  public clear() {
    if (this.highlightBox) {
      this.highlightBox.style.display = 'none';
    }
    if (this.badge) {
      this.badge.innerHTML = `
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #22C55E; display: inline-block;"></span>
        <span>Browser Agent: Idle</span>
      `;
    }
  }
}
