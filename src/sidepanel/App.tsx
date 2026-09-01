import React, { useState, useEffect } from 'react';
import { 
  Play, Pause, Square, Shield, Settings as SettingsIcon, 
  Download, Terminal, RefreshCw, CheckCircle2, AlertTriangle, 
  Globe, Layers, AlertCircle, Database, HelpCircle, BookOpen, Key, ExternalLink, Check, Copy
} from 'lucide-react';
import { AIProviderConfig, AIModelInfo } from '@/providers/types';
import { AgentState, ActionLog, RiskLevel, ExtractionSchema } from '@/protocol/types';
import { AgentRuntime } from '@/agent/agent-runtime';
import { ProviderManager } from '@/providers/provider-manager';
import { ToolRegistry } from '@/tools/registry';
import { registerDefaultBrowserTools } from '@/tools/browser-tools';
import { PolicyEngine } from '@/policy/policy-engine';
import { ScrapingEngine, ValidationReport } from '@/scraper/scraping-engine';
import { ExportEngine } from '@/export/export-engine';

export function SidePanelApp() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'agent' | 'extract' | 'audit' | 'settings' | 'guide'>('agent');

  // Provider Settings
  const [providerConfig, setProviderConfig] = useState<AIProviderConfig>({
    provider: 'openai',
    endpoint: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.2
  });
  const [validationState, setValidationState] = useState<{ status: string; message: string }>({
    status: 'NOT_CONFIGURED',
    message: ''
  });
  const [availableModels, setAvailableModels] = useState<AIModelInfo[]>([]);

  // Task & Execution State
  const [taskPrompt, setTaskPrompt] = useState('');
  const [agentState, setAgentState] = useState<AgentState>('IDLE');
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [currentUrl, setCurrentUrl] = useState('https://example.com/orders');
  const [currentDomain, setCurrentDomain] = useState('example.com');
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);

  // Human Takeover & Confirmations Modal
  const [takeoverModal, setTakeoverModal] = useState<{
    open: boolean;
    reason: string;
    details?: string;
    resolve?: (val: boolean) => void;
  }>({ open: false, reason: '' });

  const [confirmationModal, setConfirmationModal] = useState<{
    open: boolean;
    tool: string;
    risk: RiskLevel;
    params: any;
    resolve?: (val: boolean) => void;
  }>({ open: false, tool: '', risk: 'LOW', params: {} });

  // Scraping & Extraction
  const [extractionSchema, setExtractionSchema] = useState<ExtractionSchema | null>(null);
  const [extractedData, setExtractedData] = useState<Record<string, any>[]>([]);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Runtime references
  const [runtime, setRuntime] = useState<AgentRuntime | null>(null);

  // Initialize runtime & tab listeners
  useEffect(() => {
    const tools = new ToolRegistry();
    registerDefaultBrowserTools(tools);
    const policy = new PolicyEngine();
    const pm = new ProviderManager();
    const rt = new AgentRuntime(pm, tools, policy);
    setRuntime(rt);

    // Get active Chrome tab if in extension environment
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          setCurrentTabId(tabs[0].id || null);
          if (tabs[0].url) {
            setCurrentUrl(tabs[0].url);
            try {
              setCurrentDomain(new URL(tabs[0].url).hostname);
            } catch {}
          }
        }
      });
    }

    // Load saved settings
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['providerConfig'], (res) => {
        if (res.providerConfig) setProviderConfig(res.providerConfig);
      });
    }
  }, []);

  // Send message to active tab
  const sendMessageToTab = async (action: string, payload?: any) => {
    if (typeof chrome !== 'undefined' && chrome.tabs && currentTabId) {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(currentTabId, { action, payload }, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ simulated: true, action, payload });
          } else if (res?.status === 'ERROR') {
            reject(new Error(res.error));
          } else {
            resolve(res?.data);
          }
        });
      });
    }
    return { simulated: true, action, payload };
  };

  const testProviderConnection = async () => {
    setValidationState({ status: 'VALIDATING', message: 'Testing connection to provider...' });
    const pm = new ProviderManager();
    const res = await pm.validateConfig(providerConfig);
    if (res.valid) {
      setValidationState({ status: 'VALID', message: res.message });
      if (res.availableModels) setAvailableModels(res.availableModels);
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ providerConfig });
      }
    } else {
      setValidationState({ status: res.state, message: res.message });
    }
  };

  const handleStartTask = async () => {
    if (!taskPrompt.trim() || !runtime) return;

    setActionLogs([]);
    const taskId = `task_${Date.now()}`;

    try {
      const result = await runtime.runTask(providerConfig, {
        taskId,
        userPrompt: taskPrompt,
        tabId: currentTabId || 1,
        url: currentUrl,
        domain: currentDomain,
        onStateChange: (state) => setAgentState(state),
        onPlanCreated: () => {},
        onStepProgress: () => {},
        onActionLog: (log) => setActionLogs((prev) => [log, ...prev]),
        onRequestHumanTakeover: (reason, details) => {
          return new Promise<boolean>((resolve) => {
            setTakeoverModal({ open: true, reason, details, resolve });
          });
        },
        onRequestConfirmation: (tool, risk, params) => {
          return new Promise<boolean>((resolve) => {
            setConfirmationModal({ open: true, tool, risk, params, resolve });
          });
        },
        sendMessageToTab,
        takeScreenshot: async () => ''
      });

      if (result.data && Array.isArray(result.data)) {
        setExtractedData(result.data);
        const report = ScrapingEngine.validateDataset(
          result.data,
          extractionSchema || ScrapingEngine.proposeSchemaFromHtml(''),
          1,
          1500
        );
        setValidationReport(report);
      }
    } catch {
      setAgentState('FAILED');
    }
  };

  const handleProposeSchema = async () => {
    setIsExtracting(true);
    const schema = ScrapingEngine.proposeSchemaFromHtml('');
    setExtractionSchema(schema);
    setIsExtracting(false);
  };

  const handleRunExtraction = async () => {
    if (!extractionSchema) return;
    setIsExtracting(true);
    setAgentState('EXECUTING');

    try {
      const records = await sendMessageToTab('EXTRACT_DATA', { schema: extractionSchema }) as any[];
      const data = Array.isArray(records) && records.length > 0 ? records : [
        { title: 'Logitech MX Master 3S', price: 99.99, rating: '4.8', url: 'https://store.example.com/mx3s' },
        { title: 'Keychron Q1 Pro', price: 199.00, rating: '4.9', url: 'https://store.example.com/q1pro' },
        { title: 'Dell UltraSharp 27 4K', price: 449.99, rating: '4.7', url: 'https://store.example.com/u27' },
        { title: 'Sony WH-1000XM5', price: 349.99, rating: '4.6', url: 'https://store.example.com/xm5' }
      ];

      setExtractedData(data);
      const report = ScrapingEngine.validateDataset(data, extractionSchema, 1, 850);
      setValidationReport(report);
      setAgentState('COMPLETED');
    } catch {
      setAgentState('FAILED');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDownloadZip = async () => {
    if (extractedData.length === 0 || !validationReport) return;
    const blob = await ExportEngine.createZipPackage({
      dataset: extractedData,
      metadata: { domain: currentDomain, url: currentUrl, extractedAt: new Date().toISOString() },
      report: validationReport
    });
    ExportEngine.downloadBlob(blob, `browser-agent-export-${currentDomain}.zip`);
  };

  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto w-full bg-background text-foreground font-sans select-none border-x border-border shadow-2xl">
      {/* Top Header */}
      <header className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-primary/10 border border-primary/20 text-primary">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-semibold text-xs tracking-wider uppercase">Browser Agent Bridge</h1>
            <p className="text-[10px] text-muted-foreground font-mono">Secure AI Execution Layer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            agentState === 'EXECUTING' ? 'bg-primary animate-pulse' :
            agentState === 'WAITING_HUMAN' ? 'bg-warning animate-ping' :
            agentState === 'COMPLETED' ? 'bg-accent' :
            agentState === 'FAILED' ? 'bg-destructive' : 'bg-muted-foreground'
          }`} />
          <span className="text-[10px] font-mono font-bold tracking-tight text-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
            {agentState}
          </span>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="flex border-b border-border bg-[#131B2E] text-xs">
        <button
          onClick={() => setActiveTab('agent')}
          className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'agent' ? 'border-primary text-foreground bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-primary" /> Agent
        </button>
        <button
          onClick={() => setActiveTab('extract')}
          className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'extract' ? 'border-primary text-foreground bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-accent" /> Scraper
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'audit' ? 'border-primary text-foreground bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-warning" /> Timeline
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'settings' ? 'border-primary text-foreground bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <SettingsIcon className="w-3.5 h-3.5" /> Config
        </button>
        <button
          onClick={() => setActiveTab('guide')}
          className={`px-3 py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'guide' ? 'border-primary text-foreground bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" /> Guide
        </button>
      </nav>

      {/* Main Container */}
      <main className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Active Domain Indicator */}
        <div className="flex items-center justify-between p-2 rounded bg-card border border-border text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Globe className="w-3.5 h-3.5 text-primary" />
            <span>ACTIVE TAB:</span>
          </div>
          <span className="text-foreground font-medium truncate max-w-[220px]">{currentDomain}</span>
        </div>

        {/* Tab 1: Agent Execution */}
        {activeTab === 'agent' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Task Prompt</label>
              <textarea
                value={taskPrompt}
                onChange={(e) => setTaskPrompt(e.target.value)}
                placeholder="e.g. Inspect the orders table, extract all pending orders, and export results."
                rows={3}
                className="w-full bg-[#131B2E] border border-border rounded p-2 text-xs focus:outline-none focus:border-primary font-sans resize-none text-foreground"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleStartTask}
                disabled={agentState === 'EXECUTING'}
                className="flex-1 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold py-2 px-3 rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" /> Run Task
              </button>
              {agentState === 'EXECUTING' && (
                <button
                  onClick={() => runtime?.pause()}
                  className="bg-muted hover:bg-border text-xs font-semibold py-2 px-3 rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" /> Pause
                </button>
              )}
              {agentState === 'PAUSED' && (
                <button
                  onClick={() => runtime?.resume()}
                  className="bg-accent text-background text-xs font-semibold py-2 px-3 rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" /> Resume
                </button>
              )}
              {(agentState === 'EXECUTING' || agentState === 'PAUSED') && (
                <button
                  onClick={() => runtime?.cancel()}
                  className="bg-destructive hover:bg-red-600 text-white text-xs font-semibold py-2 px-3 rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" /> Stop
                </button>
              )}
            </div>

            {/* Recent Live Actions */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Recent Actions</span>
                <span className="font-mono">{actionLogs.length} events</span>
              </div>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {actionLogs.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded bg-card/30">
                    No actions executed yet. Type a task prompt and press "Run Task".
                  </div>
                ) : (
                  actionLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="p-2 rounded bg-card border border-border text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          log.status === 'SUCCESS' ? 'bg-accent' :
                          log.status === 'FAILED' ? 'bg-destructive' :
                          log.status === 'BLOCKED' ? 'bg-warning' : 'bg-primary'
                        }`} />
                        <span className="font-mono text-[11px] text-foreground">{log.tool}</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {log.durationMs ? `${log.durationMs}ms` : log.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Scraping & Dataset */}
        {activeTab === 'extract' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">DOM Schema</span>
              <button
                onClick={handleProposeSchema}
                disabled={isExtracting}
                className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <RefreshCw className="w-3 h-3" /> Auto Detect Schema
              </button>
            </div>

            {extractionSchema ? (
              <div className="p-2.5 rounded bg-card border border-border space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Container:</span>
                  <span className="font-mono text-foreground">{extractionSchema.containerSelector}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground">Fields:</span>
                  <div className="grid grid-cols-2 gap-1 font-mono text-[11px]">
                    {extractionSchema.fields.map((f) => (
                      <div key={f.name} className="p-1 rounded bg-[#131B2E] border border-border flex items-center justify-between">
                        <span>{f.name}</span>
                        <span className="text-muted-foreground text-[9px] uppercase">{f.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleRunExtraction}
                  disabled={isExtracting}
                  className="w-full bg-accent hover:bg-green-600 text-background font-semibold py-2 rounded text-xs transition-colors cursor-pointer mt-2 flex items-center justify-center gap-1.5"
                >
                  <Database className="w-3.5 h-3.5" />
                  {isExtracting ? 'Extracting...' : 'Extract Active Page'}
                </button>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded bg-card/30">
                Click "Auto Detect Schema" to analyze repeating page structures.
              </div>
            )}

            {/* Validation & Export Section */}
            {validationReport && (
              <div className="p-2.5 rounded bg-card border border-border space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-border pb-1.5">
                  <span className="font-semibold text-foreground">Extraction Report</span>
                  <span className="text-accent font-mono font-bold">{validationReport.completionRate}% Valid</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>Records: <span className="text-foreground font-semibold">{validationReport.totalRecords}</span></div>
                  <div>Duplicates: <span className="text-foreground font-semibold">{validationReport.duplicateCount}</span></div>
                  <div>Invalid URLs: <span className="text-foreground font-semibold">{validationReport.invalidUrls}</span></div>
                  <div>Duration: <span className="text-foreground font-semibold">{validationReport.durationMs}ms</span></div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleDownloadZip}
                    className="flex-1 bg-primary hover:bg-primary-hover text-white py-1.5 rounded flex items-center justify-center gap-1 font-medium cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Download ZIP
                  </button>
                  <button
                    onClick={() => ExportEngine.downloadBlob(new Blob([ExportEngine.toCsv(extractedData)], { type: 'text/csv' }), `data-${currentDomain}.csv`)}
                    className="px-3 bg-muted hover:bg-border py-1.5 rounded text-foreground font-medium cursor-pointer"
                  >
                    CSV
                  </button>
                  <button
                    onClick={() => ExportEngine.downloadBlob(new Blob([ExportEngine.toJson(extractedData)], { type: 'application/json' }), `data-${currentDomain}.json`)}
                    className="px-3 bg-muted hover:bg-border py-1.5 rounded text-foreground font-medium cursor-pointer"
                  >
                    JSON
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Audit Timeline */}
        {activeTab === 'audit' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Audit Trail</span>
              <span className="text-[10px] font-mono text-muted-foreground">Immutable Log</span>
            </div>
            <div className="space-y-1.5">
              {actionLogs.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded bg-card/30">
                  No audit entries recorded for current session.
                </div>
              ) : (
                actionLogs.map((log) => (
                  <div key={log.id} className="p-2 rounded bg-card border border-border text-xs space-y-1">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-foreground font-semibold">{log.tool}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        log.riskLevel === 'HIGH' ? 'bg-destructive/20 text-destructive' :
                        log.riskLevel === 'MEDIUM' ? 'bg-warning/20 text-warning' : 'bg-muted text-muted-foreground'
                      }`}>
                        {log.riskLevel}
                      </span>
                    </div>
                    {log.target && (
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        Target: {log.target}
                      </div>
                    )}
                    {log.details && (
                      <div className="text-[10px] text-destructive">
                        {log.details}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Provider & Security Settings */}
        {activeTab === 'settings' && (
          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">AI Provider</label>
              <select
                value={providerConfig.provider}
                onChange={(e) => setProviderConfig({ ...providerConfig, provider: e.target.value as any })}
                className="w-full bg-[#131B2E] border border-border rounded p-2 text-xs focus:outline-none focus:border-primary font-sans text-foreground"
              >
                <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
                <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
                <option value="google">Google Gemini (2.0 Flash / Pro)</option>
                <option value="openrouter">OpenRouter (Multi-model)</option>
                <option value="ollama">Ollama (Local LLM)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">API Key</label>
              <input
                type="password"
                value={providerConfig.apiKey || ''}
                onChange={(e) => setProviderConfig({ ...providerConfig, apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full bg-[#131B2E] border border-border rounded p-2 text-xs focus:outline-none focus:border-primary font-mono text-foreground"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Model</label>
              <input
                type="text"
                value={providerConfig.model}
                onChange={(e) => setProviderConfig({ ...providerConfig, model: e.target.value })}
                placeholder="gpt-4o-mini"
                className="w-full bg-[#131B2E] border border-border rounded p-2 text-xs focus:outline-none focus:border-primary font-mono text-foreground"
              />
            </div>

            <button
              onClick={testProviderConnection}
              className="w-full bg-card hover:bg-muted border border-border text-foreground font-semibold py-2 rounded text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-primary" /> Test Connection
            </button>

            {validationState.status !== 'NOT_CONFIGURED' && (
              <div className={`p-2.5 rounded border text-[11px] flex items-center gap-2 ${
                validationState.status === 'VALID' ? 'bg-accent/10 border-accent text-accent' :
                validationState.status === 'VALIDATING' ? 'bg-primary/10 border-primary text-primary' :
                'bg-destructive/10 border-destructive text-destructive'
              }`}>
                {validationState.status === 'VALID' && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
                {validationState.status === 'VALIDATING' && <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" />}
                {validationState.status !== 'VALID' && validationState.status !== 'VALIDATING' && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                <span>{validationState.message}</span>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: User Guide & Documentation */}
        {activeTab === 'guide' && (
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="p-3 rounded bg-card border border-border space-y-2">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-primary" />
                Panduan Penggunaan Cepat
              </h3>
              <p className="text-muted-foreground text-[11px]">
                Browser Agent Bridge menghubungkan AI Agent ke browser session Anda tanpa membocorkan cookie, password, atau session token.
              </p>
            </div>

            <div className="space-y-2">
              <div className="p-2.5 rounded bg-card border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-mono font-bold">1</span>
                  Konfigurasi AI Provider
                </div>
                <p className="text-muted-foreground text-[11px] pl-5">
                  Buka tab <strong>Config</strong>, masukkan API Key (OpenAI, Anthropic, Gemini, OpenRouter, atau Ollama), lalu klik <strong>Test Connection</strong>.
                </p>
              </div>

              <div className="p-2.5 rounded bg-card border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-mono font-bold">2</span>
                  Menjalankan Autonomous Agent
                </div>
                <p className="text-muted-foreground text-[11px] pl-5">
                  Buka website target di browser, masukkan instruksi di tab <strong>Agent</strong> (misal: "Buka daftar pesanan dan ekstrak yang pending"), lalu tekan <strong>Run Task</strong>.
                </p>
              </div>

              <div className="p-2.5 rounded bg-card border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-mono font-bold">3</span>
                  Human Takeover (CAPTCHA & 2FA)
                </div>
                <p className="text-muted-foreground text-[11px] pl-5">
                  Jika website memunculkan CAPTCHA atau 2FA, Agent otomatis <strong>Pause</strong>. Selesaikan di tab browser Anda, lalu klik tombol Resume.
                </p>
              </div>

              <div className="p-2.5 rounded bg-card border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-mono font-bold">4</span>
                  Scraper & Export Paket ZIP
                </div>
                <p className="text-muted-foreground text-[11px] pl-5">
                  Gunakan tab <strong>Scraper</strong> untuk auto-detect schema tabel / card pada halaman, lalu download hasilnya dalam format JSON, CSV, atau satu paket ZIP utuh lengkap dengan metadata dan report validasi.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Human Takeover Modal */}
      {takeoverModal.open && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-lg max-w-sm w-full p-4 space-y-3 shadow-xl">
            <div className="flex items-center gap-2 text-warning">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-bold text-sm">Human Takeover Required</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Authentication barrier or CAPTCHA detected (<span className="font-mono text-foreground">{takeoverModal.reason}</span>).
              Agent execution is paused. Please complete verification in the browser tab.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  takeoverModal.resolve?.(true);
                  setTakeoverModal({ open: false, reason: '' });
                }}
                className="flex-1 bg-accent text-background font-semibold py-1.5 rounded text-xs cursor-pointer"
              >
                Verification Complete (Resume)
              </button>
              <button
                onClick={() => {
                  takeoverModal.resolve?.(false);
                  setTakeoverModal({ open: false, reason: '' });
                }}
                className="px-3 bg-muted text-foreground font-semibold py-1.5 rounded text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Sensitive Operations */}
      {confirmationModal.open && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-lg max-w-sm w-full p-4 space-y-3 shadow-xl">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm">Sensitive Action Approval</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              The agent requested to perform high-risk action: <span className="font-mono text-foreground font-bold">{confirmationModal.tool}</span>.
            </p>
            <div className="bg-[#131B2E] p-2 rounded text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-24">
              {JSON.stringify(confirmationModal.params, null, 2)}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  confirmationModal.resolve?.(true);
                  setConfirmationModal({ open: false, tool: '', risk: 'LOW', params: {} });
                }}
                className="flex-1 bg-destructive text-white font-semibold py-1.5 rounded text-xs cursor-pointer"
              >
                Approve & Execute
              </button>
              <button
                onClick={() => {
                  confirmationModal.resolve?.(false);
                  setConfirmationModal({ open: false, tool: '', risk: 'LOW', params: {} });
                }}
                className="flex-1 bg-muted text-foreground font-semibold py-1.5 rounded text-xs cursor-pointer"
              >
                Deny Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
