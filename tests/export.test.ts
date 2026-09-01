import { describe, it, expect } from 'vitest';
import { ExportEngine } from '@/export/export-engine';

describe('ExportEngine Formats & ZIP creation', () => {
  const records = [
    { id: 1, title: 'Item 1, with comma', price: 29.99 },
    { id: 2, title: 'Item "quoted"', price: 49.99 }
  ];

  it('correctly generates CSV with quoting and escaping', () => {
    const csv = ExportEngine.toCsv(records);
    expect(csv).toContain('"Item 1, with comma"');
    expect(csv).toContain('"Item ""quoted"""');
    expect(csv).toContain('29.99');
  });

  it('correctly generates JSON and JSONL', () => {
    const json = ExportEngine.toJson(records);
    const jsonl = ExportEngine.toJsonl(records);

    expect(JSON.parse(json).length).toBe(2);
    expect(jsonl.split('\n').length).toBe(2);
  });

  it('builds ZIP package with data and report files', async () => {
    const zipBlob = await ExportEngine.createZipPackage({
      dataset: records,
      metadata: { source: 'test.com' },
      report: {
        totalRecords: 2,
        totalPages: 1,
        duplicateCount: 0,
        missingFields: {},
        invalidUrls: 0,
        completionRate: 100,
        durationMs: 500
      }
    });

    expect(zipBlob.size).toBeGreaterThan(0);
    expect(zipBlob.type).toBe('application/zip');
  });
});
