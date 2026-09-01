import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Square, Shield, Settings as SettingsIcon, 
  Download, Terminal, RefreshCw, CheckCircle2, AlertTriangle, 
  Globe, Layers, AlertCircle, Database, BookOpen, Sparkles, 
  ArrowRight, Compass, Bug, Zap, FileSpreadsheet, Upload, Check, 
  FileText, Repeat, ListChecks, CheckSquare, XSquare, Plus
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
import { SITEngine, SITTestCase } from '@/sit/sit-engine';
import { FlowStudioEngine, DiscoveredFlow, WorkflowStep } from '@/sit/flow-studio';

export function SidePanelApp() {
  const [activeTab, setActiveTab] = useState<'agent' | 'sit' | 'explorer' | 'monkey' | 'extract' | 'audit' | 'settings' | 'guide'>('agent');

  // Provider Settings
  const [providerConfig, setProviderConfig] = useState<AIProviderConfig>({
    provider: 'opencode_zen',
    endpoint: 'http://localhost:20128/v1',
    apiKey: '',
    model: 'claude-3-5-sonnet',
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
  const [currentThoughts, setCurrentThoughts] = useState<string[]>([]);
  const [agentSummary, setAgentSummary] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState('https://example.com');
  const [currentDomain, setCurrentDomain] = useState('example.com');
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // SIT Runner State
  const [sitCases, setSitCases] = useState<SITTestCase[]>([]);
  const [isSitRunning, setIsSitRunning] = useState(false);
  const [currentSitIndex, setCurrentSitIndex] = useState<number>(-1);
  const [activeWorkflow, setActiveWorkflow] = useState<DiscoveredFlow | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Explorer State
  const [discoveredMenus, setDiscoveredMenus] = useState<Array<{ ref: string; label: string; tag: string; isSubmenu: boolean }>>([]);
  const [isExploring, setIsExploring] = useState(false);

  // Monkey Test State
  const [monkeyResult, setMonkeyResult] = useState<{ executedSteps: number; actions: any[]; capturedErrors: string[] } | null>(null);
  const [isMonkeyTesting, setIsMonkeyTesting] = useState(false);

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

  // Runtime reference
  const [runtime, setRuntime] = useState<AgentRuntime | null>(null);

  // Initialize runtime & tab listeners
  useEffect(() => {
    const tools = new ToolRegistry();
    registerDefaultBrowserTools(tools);
    const policy = new PolicyEngine();
    const pm = new ProviderManager();
    const rt = new AgentRuntime(pm, tools, policy);
    setRuntime(rt);

    const updateActiveTabInfo = () => {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]) {
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
    };

    updateActiveTabInfo();

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onActivated?.addListener(updateActiveTabInfo);
      chrome.tabs.onUpdated?.addListener(updateActiveTabInfo);
    }

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['providerConfig'], (res) => {
        if (res.providerConfig) setProviderConfig(res.providerConfig);
      });
    }
  }, []);

  const sendMessageToTab = async (action: string, payload?: any) => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      let targetTabId = currentTabId;
      if (!targetTabId) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          targetTabId = tabs[0].id;
          setCurrentTabId(targetTabId);
        }
      }

      if (targetTabId) {
        return new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(targetTabId!, { action, payload }, async (res) => {
            if (chrome.runtime.lastError) {
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: targetTabId! },
                  files: ['content.js']
                });
                chrome.tabs.sendMessage(targetTabId!, { action, payload }, (retryRes) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                  } else if (retryRes?.status === 'ERROR') {
                    reject(new Error(retryRes.error));
                  } else {
                    resolve(retryRes?.data);
                  }
                });
              } catch (injErr: any) {
                reject(new Error(`Content script error: ${injErr.message}`));
              }
            } else if (res?.status === 'ERROR') {
              reject(new Error(res.error));
            } else {
              resolve(res?.data);
            }
          });
        });
      }
    }
    return { simulated: true, action, payload };
  };

  const testProviderConnection = async () => {
    setValidationState({ status: 'VALIDATING', message: 'Testing connection...' });
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
    setCurrentThoughts([]);
    setAgentSummary(null);
    setLastError(null);
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
        onThought: (t) => setCurrentThoughts((prev) => [...prev, t]),
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

      if (!result.success) {
        setLastError(result.summary || 'Task failed');
      } else {
        setLastError(null);
        setAgentSummary(result.summary || 'Tugas selesai dieksekusi.');
      }

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
    } catch (err: any) {
      setAgentState('FAILED');
      setLastError(err.message || 'Unknown error');
    }
  };

  // SIT File Import Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await SITEngine.parseTestFile(file);
      if (parsed.testCases.length > 0) {
        setSitCases(parsed.testCases);
        setLastError(null);
      } else {
        setLastError('File tidak memiliki test cases yang dapat diparse.');
      }
    } catch (err: any) {
      setLastError(`Gagal memproses file SIT: ${err.message}`);
    }
  };

  // Run SIT Test Suite via Autonomous Agent
  const handleRunSITSuite = async () => {
    if (sitCases.length === 0 || !runtime) return;

    setIsSitRunning(true);
    setAgentState('EXECUTING');

    const updatedCases = [...sitCases];

    for (let i = 0; i < updatedCases.length; i++) {
      setCurrentSitIndex(i);
      const tc = updatedCases[i];
      tc.result = 'PENDING';

      try {
        const stepPrompt = `Jalankan skenario uji: ${tc.testScript}. Ekspektasi: ${tc.outputExpected}. Pastikan tidak ada error/anomali.`;
        const res = await runtime.runTask(providerConfig, {
          taskId: `sit_${tc.no}_${Date.now()}`,
          userPrompt: stepPrompt,
          tabId: currentTabId || 1,
          url: currentUrl,
          domain: currentDomain,
          maxSteps: 6,
          onStateChange: () => {},
          onPlanCreated: () => {},
          onStepProgress: () => {},
          onActionLog: (log) => setActionLogs((prev) => [log, ...prev]),
          onRequestHumanTakeover: () => Promise.resolve(true),
          onRequestConfirmation: () => Promise.resolve(true),
          sendMessageToTab
        });

        if (res.success) {
          tc.result = 'V';
          tc.notes = res.summary;
        } else {
          tc.result = 'X';
          tc.findingType = 'Major';
          tc.notes = res.summary || 'Aksi gagal dieksekusi';
        }
      } catch (err: any) {
        tc.result = 'X';
        tc.findingType = 'Major';
        tc.notes = err.message;
      }

      setSitCases([...updatedCases]);
      await new Promise(r => setTimeout(r, 600));
    }

    setIsSitRunning(false);
    setCurrentSitIndex(-1);
    setAgentState('COMPLETED');
  };

  const handleExportSITExcel = () => {
    if (sitCases.length === 0) return;
    const blob = SITEngine.generateSITExcel(sitCases, {
      projectName: currentDomain,
      tester: 'Browser Agent Bridge Automation'
    });
    ExportEngine.downloadBlob(blob, `SIT-Report-${currentDomain}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExploreMenus = async () => {
    setIsExploring(true);
    try {
      const res = await sendMessageToTab('EXPLORE_MENUS', {}) as any[];
      const menus = Array.isArray(res) ? res : [];
      setDiscoveredMenus(menus);
      if (menus.length > 0) {
        const flow = FlowStudioEngine.menusToTourFlow(menus);
        setActiveWorkflow(flow);
      }
    } catch (e: any) {
      setLastError(e.message);
    } finally {
      setIsExploring(false);
    }
  };

  const handleRunMonkey = async () => {
    setIsMonkeyTesting(true);
    setMonkeyResult(null);
    try {
      const res = await sendMessageToTab('RUN_MONKEY_TEST', { iterations: 20, delayMs: 200 }) as any;
      setMonkeyResult(res);
      if (res && res.actions) {
        const flow = FlowStudioEngine.traceToWorkflow(`Monkey Flow ${new Date().toLocaleTimeString()}`, currentUrl, res.actions);
        setActiveWorkflow(flow);
      }
    } catch (e: any) {
      setLastError(e.message);
    } finally {
      setIsMonkeyTesting(false);
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
      const data = Array.isArray(records) && records.length > 0 ? records : [];
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

  const shortcuts = [
    "Cari dan klik menu comsec di sidebar navigasi",
    "Buka menu dashboard lalu klik sub-menu laporan",
    "Isi form yang ada di halaman ini dengan data pengujian lalu submit",
    "Periksa seluruh link navigasi dan laporkan jika ada halaman error"
  ];

  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto w-full bg-background text-foreground font-sans select-none border-x border-border shadow-2xl">
      {/* Top Header */}
      <header className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-primary/10 border border-primary/20 text-primary">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-semibold text-xs tracking-wider uppercase">Browser Agent Bridge</h1>
            <p className="text-[10px] text-muted-foreground font-mono">OpenCode-Powered Autonomous Browser</p>
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
      <nav className="flex border-b border-border bg-[#131B2E] text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('agent')}
          className={`flex-1 min-w-[65px] py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'agent' ? 'border-primary text-foreground bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-primary" /> Agent
        </button>
        <button
          onClick={() => setActiveTab('sit')}
          className={`flex-1 min-w-[65px] py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'sit' ? 'border-primary text-foreground bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-green-400" /> SIT QA
        </button>
        <button
          onClick={() => setActiveTab('explorer')}
          className={`flex-1 min-w-[70px] py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'explorer' ? 'border-primary text-foreground bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Compass className="w-3.5 h-3.5 text-blue-400" /> Explore
        </button>
        <button
          onClick={() => setActiveTab('monkey')}
          className={`flex-1 min-w-[70px] py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'monkey' ? 'border-primary text-foreground bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bug className="w-3.5 h-3.5 text-amber-400" /> Monkey
        </button>
        <button
          onClick={() => setActiveTab('extract')}
          className={`flex-1 min-w-[70px] py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'extract' ? 'border-primary text-foreground bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-accent" /> Scraper
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex-1 min-w-[65px] py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'audit' ? 'border-primary text-foreground bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-warning" /> Timeline
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 min-w-[65px] py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'settings' ? 'border-primary text-foreground bg-card' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <SettingsIcon className="w-3.5 h-3.5" /> Config
        </button>
        <button
          onClick={() => setActiveTab('guide')}
          className={`px-2.5 py-2 text-center font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${
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
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Autonomous Task Prompt</label>
                <button
                  onClick={() => sendMessageToTab('SNAPSHOT', { renderVisualTags: true })}
                  className="text-[10px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" /> Refresh Visual Tags
                </button>
              </div>
              <textarea
                value={taskPrompt}
                onChange={(e) => setTaskPrompt(e.target.value)}
                placeholder="Ketik apa saja, misal: Masuk ke menu comsec lalu klik sub-menu reports."
                rows={3}
                className="w-full bg-[#131B2E] border border-border rounded p-2 text-xs focus:outline-none focus:border-primary font-sans resize-none text-foreground"
              />
            </div>

            {/* Quick Prompt Suggestions */}
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Automation Tasks</span>
              <div className="grid grid-cols-1 gap-1">
                {shortcuts.map((sc, i) => (
                  <button
                    key={i}
                    onClick={() => setTaskPrompt(sc)}
                    className="text-left text-[11px] p-1.5 rounded bg-card/60 hover:bg-card border border-border/80 text-muted-foreground hover:text-foreground flex items-center justify-between gap-1 transition-colors cursor-pointer"
                  >
                    <span className="truncate">{sc}</span>
                    <ArrowRight className="w-3 h-3 flex-shrink-0 text-primary opacity-60" />
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleStartTask}
                disabled={agentState === 'EXECUTING'}
                className="flex-1 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-semibold py-2 px-3 rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" /> Start Full Automation
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

            {/* Error Banner */}
            {lastError && (
              <div className="p-2.5 rounded bg-destructive/10 border border-destructive text-destructive text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <div className="font-semibold text-[11px]">Action Failed</div>
                  <div className="text-[10px] leading-tight break-words font-mono">{lastError}</div>
                </div>
              </div>
            )}

            {/* AI Reasoning / Live Thought Process */}
            {currentThoughts.length > 0 && (
              <div className="p-2.5 rounded bg-[#131B2E] border border-blue-500/30 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-blue-400">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    <span>AI Reasoning / Internal Thoughts</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">{currentThoughts.length} steps</span>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] text-foreground/90 font-mono bg-card/60 p-2 rounded border border-border/50">
                  {currentThoughts.map((thought, idx) => (
                    <div key={idx} className="border-b border-border/30 last:border-0 pb-1 last:pb-0">
                      <span className="text-primary font-bold mr-1">#{idx + 1}:</span>
                      <span>{thought}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Final AI Output / Workflow Analysis Report */}
            {agentSummary && (
              <div className="p-3 rounded bg-[#0D1929] border border-accent/40 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-accent font-semibold text-[12px]">
                    <CheckCircle2 className="w-4 h-4 text-accent" />
                    <span>Hasil Analisis & Ringkasan Alur Menu</span>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(agentSummary)}
                    className="text-[10px] px-2 py-0.5 bg-accent/20 hover:bg-accent/30 text-accent rounded transition-colors"
                  >
                    Copy Report
                  </button>
                </div>
                <div className="bg-card/80 p-2.5 rounded border border-border/80 text-[11px] leading-relaxed text-foreground whitespace-pre-wrap font-sans max-h-60 overflow-y-auto">
                  {agentSummary}
                </div>
              </div>
            )}

            {/* Realtime Live Actions */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Executed Actions</span>
                <span className="font-mono">{actionLogs.length} events</span>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {actionLogs.length === 0 ? (
                  <div className="text-center py-5 text-xs text-muted-foreground border border-dashed border-border rounded bg-card/30">
                    No actions executed yet. Type an automation prompt and press "Start Full Automation".
                  </div>
                ) : (
                  actionLogs.slice(0, 10).map((log) => (
                    <div key={log.id} className="p-2 rounded bg-card border border-border text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          log.status === 'SUCCESS' ? 'bg-accent' :
                          log.status === 'FAILED' ? 'bg-destructive' :
                          log.status === 'BLOCKED' ? 'bg-warning' : 'bg-primary'
                        }`} />
                        <span className="font-mono text-[11px] text-foreground font-semibold">{log.tool}</span>
                        {log.target && <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{log.target}</span>}
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

        {/* Tab 2: SIT QA Suite (File Upload, Auto Execution, Excel Export) */}
        {activeTab === 'sit' && (
          <div className="space-y-3">
            <div className="p-3 rounded bg-card border border-border space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-green-400 font-semibold">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>SIT Automated QA Runner</span>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-1 bg-primary/20 hover:bg-primary text-primary hover:text-white rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Upload className="w-3 h-3" /> Upload SIT (.xlsx/.json/.txt)
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.json,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              <p className="text-muted-foreground text-[11px]">
                Import dokumen SIT Excel / skenario uji Anda, Agent akan mengeksekusi step-by-step otomatis dan mengekspor kembali Workbook Excel standar QA (*V* pass / *X* bug).
              </p>

              {sitCases.length > 0 && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleRunSITSuite}
                    disabled={isSitRunning}
                    className="flex-1 bg-accent hover:bg-green-600 disabled:opacity-50 text-background font-bold py-1.5 rounded text-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {isSitRunning ? `Running Case ${currentSitIndex + 1}/${sitCases.length}...` : `Run All ${sitCases.length} SIT Cases`}
                  </button>
                  <button
                    onClick={handleExportSITExcel}
                    className="px-3 bg-primary hover:bg-primary-hover text-white font-medium py-1.5 rounded text-xs transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> Export SIT .xlsx
                  </button>
                </div>
              )}
            </div>

            {sitCases.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded bg-card/30 space-y-2">
                <Upload className="w-6 h-6 mx-auto opacity-40" />
                <p>Upload file SIT Excel / Test Cases untuk memulai pengujian otomatis berurutan.</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {sitCases.map((tc, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded bg-card border text-xs space-y-1 transition-colors ${
                      currentSitIndex === idx ? 'border-primary shadow-md bg-[#131B2E]' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted-foreground font-bold">{tc.no} - {tc.functionName}</span>
                      <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[9px] ${
                        tc.result === 'V' ? 'bg-accent/20 text-accent' :
                        tc.result === 'X' ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'
                      }`}>
                        {tc.result === 'V' ? '✓ PASS' : tc.result === 'X' ? '✗ BUG' : 'PENDING'}
                      </span>
                    </div>
                    <div className="text-[11px] text-foreground font-medium">{tc.testScript}</div>
                    <div className="text-[10px] text-muted-foreground">Ekspektasi: {tc.outputExpected}</div>
                    {tc.notes && <div className="text-[10px] text-primary/80 font-mono">Catatan: {tc.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Menu Explorer & Discovery */}
        {activeTab === 'explorer' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Discovered Menus</span>
              <button
                onClick={handleExploreMenus}
                disabled={isExploring}
                className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <RefreshCw className={`w-3 h-3 ${isExploring ? 'animate-spin' : ''}`} /> Scan Page Menus
              </button>
            </div>

            {discoveredMenus.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded bg-card/30">
                Click "Scan Page Menus" to auto-discover all sidebar, navbar, and sub-menus on current tab.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {discoveredMenus.map((menu, i) => (
                  <div
                    key={i}
                    className="p-2 rounded bg-card hover:bg-muted border border-border text-xs flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono text-[10px] bg-primary/20 text-primary px-1 rounded font-bold">{menu.ref}</span>
                      <span className={`truncate text-foreground ${menu.isSubmenu ? 'pl-2 text-muted-foreground' : 'font-medium'}`}>
                        {menu.isSubmenu ? '↳ ' : ''}{menu.label}
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        await sendMessageToTab('CLICK', { ref: menu.ref });
                      }}
                      className="px-2 py-1 bg-primary/20 hover:bg-primary text-primary hover:text-white rounded text-[10px] font-mono transition-colors cursor-pointer"
                    >
                      Click
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Monkey QA Stress Test */}
        {activeTab === 'monkey' && (
          <div className="space-y-3">
            <div className="p-3 rounded bg-card border border-border space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-400 font-semibold">
                <Bug className="w-4 h-4" />
                <span>Automated Monkey Chaos QA Testing</span>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Melakukan klik cepat acak, pengisian form dummy otomatis, dan deteksi unhandled JavaScript console errors pada website target.
              </p>
              <button
                onClick={handleRunMonkey}
                disabled={isMonkeyTesting}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-background font-bold py-2 rounded text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 mt-1"
              >
                <Zap className="w-3.5 h-3.5" />
                {isMonkeyTesting ? 'Running 20 Chaos Iterations...' : 'Start 20x Monkey Chaos Test'}
              </button>
            </div>

            {monkeyResult && (
              <div className="p-3 rounded bg-card border border-border space-y-2 text-xs">
                <div className="flex justify-between items-center border-b border-border pb-1.5 font-semibold">
                  <span>Monkey Test Summary</span>
                  <span className="text-accent font-mono">{monkeyResult.executedSteps} Actions Done</span>
                </div>
                <div className="text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Console Errors:</span>
                    <span className={`font-mono font-bold ${monkeyResult.capturedErrors.length > 0 ? 'text-destructive' : 'text-accent'}`}>
                      {monkeyResult.capturedErrors.length} detected
                    </span>
                  </div>
                </div>

                {monkeyResult.capturedErrors.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] font-semibold text-destructive uppercase">Captured Errors:</span>
                    <div className="p-2 rounded bg-[#131B2E] border border-destructive/30 max-h-28 overflow-y-auto space-y-1 text-[10px] font-mono text-destructive">
                      {monkeyResult.capturedErrors.map((err, i) => (
                        <div key={i} className="truncate">⚠️ {err}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Scraping & Dataset */}
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

        {/* Tab 6: Audit Timeline */}
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

        {/* Tab 7: Provider & Security Settings */}
        {activeTab === 'settings' && (
          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">AI Provider</label>
              <select
                value={providerConfig.provider}
                onChange={(e) => {
                  const p = e.target.value as any;
                  let defaultModel = 'gpt-4o-mini';
                  let defaultEndpoint = '';
                  if (p === 'opencode_zen') {
                    defaultModel = 'claude-3-5-sonnet';
                    defaultEndpoint = 'http://localhost:20128/v1';
                  } else if (p === 'opencode_go') {
                    defaultModel = 'claude-3-5-sonnet';
                    defaultEndpoint = 'http://localhost:8080/v1';
                  } else if (p === 'nine_router') {
                    defaultModel = 'claude-3-5-sonnet-20241022';
                    defaultEndpoint = 'https://api.9router.com/v1';
                  } else if (p === 'anthropic') {
                    defaultModel = 'claude-3-5-sonnet-20241022';
                  } else if (p === 'google') {
                    defaultModel = 'gemini-2.0-flash';
                  } else if (p === 'openrouter') {
                    defaultModel = 'anthropic/claude-3.5-sonnet';
                    defaultEndpoint = 'https://openrouter.ai/api/v1';
                  } else if (p === 'ollama') {
                    defaultModel = 'llama3.2';
                    defaultEndpoint = 'http://localhost:11434';
                  }
                  setProviderConfig({ ...providerConfig, provider: p, model: defaultModel, endpoint: defaultEndpoint });
                }}
                className="w-full bg-[#131B2E] border border-border rounded p-2 text-xs focus:outline-none focus:border-primary font-sans text-foreground"
              >
                <option value="opencode_zen">OpenCode Zen (Local Port :20128)</option>
                <option value="opencode_go">OpenCode Go (Local Port :8080)</option>
                <option value="nine_router">9router (Claude 3.5, GPT-4o, Gemini)</option>
                <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
                <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
                <option value="google">Google Gemini (2.0 Flash / Pro)</option>
                <option value="openrouter">OpenRouter (Multi-model)</option>
                <option value="ollama">Ollama (Local LLM)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">API Endpoint (Optional / Custom)</label>
              <input
                type="text"
                value={providerConfig.endpoint || ''}
                onChange={(e) => setProviderConfig({ ...providerConfig, endpoint: e.target.value })}
                placeholder="http://localhost:20128/v1"
                className="w-full bg-[#131B2E] border border-border rounded p-2 text-xs focus:outline-none focus:border-primary font-mono text-foreground"
              />
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
                placeholder="claude-3-5-sonnet"
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

        {/* Tab 8: User Guide & Documentation */}
        {activeTab === 'guide' && (
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="p-3 rounded bg-card border border-border space-y-2">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-primary" />
                Panduan Otomatisasi & SIT Testing
              </h3>
              <p className="text-muted-foreground text-[11px]">
                Browser Agent Bridge mendukung eksekusi otomatis penuh untuk pengujian System Integration Testing (SIT), Monkey Testing, dan Ekstraksi Data.
              </p>
            </div>

            <div className="space-y-2">
              <div className="p-2.5 rounded bg-card border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-mono font-bold">1</span>
                  SIT Test Runner Otomatis
                </div>
                <p className="text-muted-foreground text-[11px] pl-5">
                  Upload file Excel / JSON skenario pengujian di tab <strong>SIT QA</strong>. Klik "Run All Cases" untuk menjalankan test secara sekuensial dan download kembali laporannya dalam format Excel (*V* pass / *X* bug).
                </p>
              </div>

              <div className="p-2.5 rounded bg-card border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-mono font-bold">2</span>
                  Menu Auto-Discovery & Tour Flow
                </div>
                <p className="text-muted-foreground text-[11px] pl-5">
                  Buka tab <strong>Explore</strong> untuk memindai struktur menu sidebar dan navbar aplikasi web target dalam sekali klik.
                </p>
              </div>

              <div className="p-2.5 rounded bg-card border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-mono font-bold">3</span>
                  Monkey Chaos Test
                </div>
                <p className="text-muted-foreground text-[11px] pl-5">
                  Gunakan tab <strong>Monkey</strong> untuk menjalankan stress testing acak guna menemukan error unhandled JavaScript console atau page crashes.
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
