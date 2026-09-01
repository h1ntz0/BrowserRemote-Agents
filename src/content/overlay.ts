// Overlay visual renderer with high contrast developer theme
export class VisualOverlayManager {
  private overlayContainer: HTMLDivElement | null = null;
  private highlightBox: HTMLDivElement | null = null;
  private badge: HTMLDivElement | null = null;

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
      z-index: 2147483647;
      display: block;
    `;

    this.highlightBox = document.createElement('div');
    this.highlightBox.style.cssText = `
      position: absolute;
      border: 2px solid #3B82F6;
      background: rgba(59, 130, 246, 0.15);
      border-radius: 4px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      display: none;
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
    `;

    this.badge = document.createElement('div');
    this.badge.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #0F172A;
      border: 1px solid #334155;
      color: #F8FAFC;
      padding: 8px 14px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace, sans-serif;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      transition: opacity 0.3s ease;
    `;
    this.badge.innerHTML = `
      <span style="width: 8px; height: 8px; border-radius: 50%; background: #22C55E; display: inline-block;"></span>
      <span>Browser Agent: Ready</span>
    `;

    this.overlayContainer.appendChild(this.highlightBox);
    this.overlayContainer.appendChild(this.badge);
    document.body.appendChild(this.overlayContainer);
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
        <span>Target: ${label}</span>
      `;
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
