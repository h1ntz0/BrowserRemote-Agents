export interface WorkflowStep {
  order: number;
  action: 'CLICK' | 'TYPE' | 'NAVIGATE' | 'SELECT' | 'WAIT' | 'SNAPSHOT';
  target: string; // ref (e.g. e1, m2) or selector or URL
  value?: string;
  expectedResult?: string;
  status: 'PENDING' | 'PASS' | 'FAIL' | 'RUNNING';
  error?: string;
  durationMs?: number;
}

export interface DiscoveredFlow {
  id: string;
  name: string;
  sourceUrl: string;
  steps: WorkflowStep[];
  discoveredAt: string;
}

export class FlowStudioEngine {
  /**
   * Convert monkey test trace actions & menu clicks into a structured, replayable workflow
   */
  public static traceToWorkflow(name: string, sourceUrl: string, actions: any[]): DiscoveredFlow {
    const steps: WorkflowStep[] = actions.map((act, idx) => {
      let actionType: WorkflowStep['action'] = 'CLICK';
      if (act.action === 'TYPE') actionType = 'TYPE';
      else if (act.action === 'SELECT') actionType = 'SELECT';
      else if (act.action === 'NAVIGATE') actionType = 'NAVIGATE';

      return {
        order: idx + 1,
        action: actionType,
        target: act.target || 'e1',
        value: act.value || (act.target?.includes('->') ? act.target.split('->')[1]?.trim() : ''),
        expectedResult: 'Halaman memproses input tanpa error 500/Unhandled JS Error',
        status: 'PENDING'
      };
    });

    return {
      id: `flow_${Date.now()}`,
      name,
      sourceUrl,
      steps,
      discoveredAt: new Date().toISOString()
    };
  }

  /**
   * Convert menu list into an end-to-end multi-page navigation tour flow
   */
  public static menusToTourFlow(menus: Array<{ ref: string; label: string; isSubmenu: boolean }>): DiscoveredFlow {
    const steps: WorkflowStep[] = menus.map((m, idx) => ({
      order: idx + 1,
      action: 'CLICK',
      target: m.ref,
      value: m.label,
      expectedResult: `Halaman menu "${m.label}" terbuka dan merender konten tanpa error`,
      status: 'PENDING'
    }));

    return {
      id: `tour_${Date.now()}`,
      name: 'Full Application Menu Navigation Tour',
      sourceUrl: (typeof window !== 'undefined' && window?.location?.href) ? window.location.href : 'current_app',
      steps,
      discoveredAt: new Date().toISOString()
    };
  }
}
