import JSZip from 'jszip';
import { ValidationReport } from '@/scraper/scraping-engine';

export class ExportEngine {
  public static toJson(records: Record<string, any>[]): string {
    return JSON.stringify(records, null, 2);
  }

  public static toJsonl(records: Record<string, any>[]): string {
    return records.map(r => JSON.stringify(r)).join('\n');
  }

  public static toCsv(records: Record<string, any>[]): string {
    if (!records || records.length === 0) return '';
    const headers = Array.from(new Set(records.flatMap(r => Object.keys(r))));
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerRow = headers.map(escapeCsv).join(',');
    const rows = records.map(row => headers.map(h => escapeCsv(row[h])).join(','));
    return [headerRow, ...rows].join('\n');
  }

  public static async createZipPackage(options: {
    dataset: Record<string, any>[];
    metadata: Record<string, any>;
    report: ValidationReport;
    screenshots?: Array<{ filename: string; dataUrl: string }>;
  }): Promise<Blob> {
    const zip = new JSZip();

    // 1. Data files
    zip.file('data.json', this.toJson(options.dataset));
    zip.file('data.csv', this.toCsv(options.dataset));
    zip.file('data.jsonl', this.toJsonl(options.dataset));

    // 2. Metadata & Report
    zip.file('metadata.json', JSON.stringify(options.metadata, null, 2));
    zip.file('extraction-report.json', JSON.stringify(options.report, null, 2));

    // 3. Optional screenshots
    if (options.screenshots && options.screenshots.length > 0) {
      const screenshotFolder = zip.folder('screenshots');
      if (screenshotFolder) {
        for (const item of options.screenshots) {
          // Remove data:image/png;base64, header prefix if present
          const base64Data = item.dataUrl.replace(/^data:image\/\w+;base64,/, '');
          screenshotFolder.file(item.filename, base64Data, { base64: true });
        }
      }
    }

    return zip.generateAsync({ type: 'blob' });
  }

  public static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
