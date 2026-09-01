import { describe, it, expect } from 'vitest';
import { SITEngine, SITTestCase } from '@/sit/sit-engine';
import { FlowStudioEngine } from '@/sit/flow-studio';

describe('SIT Engine & Flow Studio', () => {
  const sampleCases: SITTestCase[] = [
    {
      no: '1.1',
      functionName: 'Login Form',
      testScript: 'Input username dan password lalu klik submit',
      outputExpected: 'Masuk ke dashboard',
      result: 'V'
    },
    {
      no: '1.2',
      functionName: 'Comsec Menu',
      testScript: 'Buka menu comsec',
      outputExpected: 'Halaman comsec terbuka',
      result: 'X',
      findingType: 'Major',
      notes: 'HTTP 500 internal server error'
    }
  ];

  it('generates a valid multi-sheet SIT Excel Workbook blob', () => {
    const blob = SITEngine.generateSITExcel(sampleCases, {
      projectName: 'Advantage SCM Core',
      tester: 'QA Automation Bot'
    });

    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(100);
    expect(blob.type).toContain('spreadsheetml');
  });

  it('converts discovered menus into a repeatable Tour Flow', () => {
    const menus = [
      { ref: 'm1', label: 'Dashboard', isSubmenu: false },
      { ref: 'm2', label: 'Comsec', isSubmenu: false },
      { ref: 'm3', label: 'User Management', isSubmenu: true }
    ];

    const flow = FlowStudioEngine.menusToTourFlow(menus);
    expect(flow.steps.length).toBe(3);
    expect(flow.steps[1].target).toBe('m2');
    expect(flow.steps[1].value).toBe('Comsec');
  });
});
