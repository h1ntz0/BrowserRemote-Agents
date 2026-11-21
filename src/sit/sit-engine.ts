import ExcelJS from 'exceljs';

export interface SITTestCase {
  no: string;
  functionName: string;
  findingType?: 'Critical' | 'Major' | 'Minor' | 'Trivia' | '';
  isRecurring?: 'Ya' | 'Tidak' | '';
  testScript: string;
  outputExpected: string;
  testDataCount?: number | string;
  testDataDetail?: string;
  screenshotName?: string;
  result?: 'V' | 'X' | 'PENDING';
  notes?: string;
  picResponse?: string;
  devName?: string;
  devStatus?: 'Open' | 'In Progress' | 'Fixed' | 'Closed';
}

export interface SITReportMeta {
  projectName: string;
  pic: string;
  tester: string;
  startDate: string;
  finishDate: string;
  version: string;
  note?: string;
}

export class SITEngine {
  /**
   * Parse user-uploaded document (.xlsx, .xls, .csv, .json, .txt) into structured SIT Test Cases
   */
  public static async parseTestFile(file: File): Promise<{ testCases: SITTestCase[]; meta?: Partial<SITReportMeta> }> {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'json') {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return { testCases: this.normalizeCases(parsed) };
      }
      return {
        testCases: this.normalizeCases(parsed.testCases || []),
        meta: parsed.meta
      };
    }

    if (ext === 'txt' || ext === 'md') {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const testCases: SITTestCase[] = [];
      let count = 1;

      for (const line of lines) {
        if (line.startsWith('#') || line.startsWith('//') || line.length < 5) continue;
        testCases.push({
          no: `1.${count++}`,
          functionName: line.slice(0, 40),
          testScript: line,
          outputExpected: 'Aksi berjalan sukses tanpa error',
          result: 'PENDING'
        });
      }
      return { testCases };
    }

    // Excel & CSV parsing
    let rawData: any[][];
    if (ext === 'csv') {
      rawData = SITEngine.parseCsvText(await file.text());
    } else {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      rawData = sheet ? SITEngine.worksheetToArray(sheet) : [];
    }

    const testCases: SITTestCase[] = [];
    let headerRowIndex = -1;

    // Detect header row containing "Function", "Test Script", "No", etc.
    for (let r = 0; r < Math.min(rawData.length, 15); r++) {
      const row = rawData[r];
      if (!row) continue;
      const rowStr = JSON.stringify(row).toLowerCase();
      if (rowStr.includes('function') || rowStr.includes('script') || rowStr.includes('expected') || rowStr.includes('skenario')) {
        headerRowIndex = r;
        break;
      }
    }

    const startIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;

    for (let i = startIndex; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;
      const script = String(row[4] || row[3] || row[1] || row[0] || '').trim();
      if (!script) continue;

      testCases.push({
        no: String(row[0] || `1.${testCases.length + 1}`),
        functionName: String(row[1] || 'SIT Step'),
        findingType: (row[2] || '') as any,
        isRecurring: (row[3] || '') as any,
        testScript: script,
        outputExpected: String(row[5] || row[2] || 'Berhasil sesuai ekspektasi'),
        testDataCount: row[6] || 1,
        testDataDetail: String(row[7] || ''),
        screenshotName: String(row[8] || ''),
        result: (row[9] || 'PENDING') as any,
        notes: String(row[10] || ''),
        picResponse: String(row[11] || ''),
        devName: String(row[12] || 'Frontend/Backend Dev'),
        devStatus: (row[15] || 'Open') as any
      });
    }

    return { testCases };
  }

  private static normalizeCases(rawList: any[]): SITTestCase[] {
    return rawList.map((item, idx) => ({
      no: item.no || `1.${idx + 1}`,
      functionName: item.functionName || item.function || item.name || 'Test Case',
      findingType: item.findingType || '',
      isRecurring: item.isRecurring || '',
      testScript: item.testScript || item.step || item.action || '',
      outputExpected: item.outputExpected || item.expected || 'Berhasil',
      testDataCount: item.testDataCount || 1,
      testDataDetail: item.testDataDetail || '',
      screenshotName: item.screenshotName || '',
      result: item.result || 'PENDING',
      notes: item.notes || item.error || '',
      picResponse: item.picResponse || '',
      devName: item.devName || '',
      devStatus: item.devStatus || 'Open'
    }));
  }

  /**
   * Export execution results to official Standard Corporate SIT Excel Workbook (.xlsx)
   */
  public static async generateSITExcel(
    testCases: SITTestCase[],
    meta: Partial<SITReportMeta> = {}
  ): Promise<Blob> {
    const wb = new ExcelJS.Workbook();

    const projectName = meta.projectName || 'Web Application System';
    const tester = meta.tester || 'QA Automation Specialist';
    const dateStr = new Date().toISOString().split('T')[0];

    // Sheet 1: Happy Test
    const happyCases = testCases.filter(tc => tc.result !== 'X');
    const happyRows: any[][] = [
      ['PROJECT INTEGRATION TEST (SIT) - HAPPY FLOW'],
      ['Project Name', projectName, '', 'Start/Finish Date', `${meta.startDate || dateStr} - ${meta.finishDate || dateStr}`],
      ['Tester', tester, '', 'Version Control', meta.version || '1.0.0'],
      ['Note', meta.note || 'Pengujian otomatis via Browser Agent Bridge'],
      [],
      ['No', 'Function', 'Tipe Temuan', 'Is Recurring', 'Script Test', 'Output Expected', 'Jumlah Data', 'Detail Data', 'Screenshot', 'Result', 'Keterangan', 'Respon PIC', 'Dev Name', 'Status Dev']
    ];

    happyCases.forEach(c => {
      happyRows.push([
        c.no, c.functionName, c.findingType || '', c.isRecurring || '', c.testScript,
        c.outputExpected, c.testDataCount || 1, c.testDataDetail || '', c.screenshotName || '',
        c.result || 'V', c.notes || '', c.picResponse || '', c.devName || '', c.devStatus || 'Closed'
      ]);
    });

    const wsHappy = wb.addWorksheet('Happy Test');
    wsHappy.addRows(happyRows);

    // Sheet 2: Negative / Bug Findings
    const bugCases = testCases.filter(tc => tc.result === 'X');
    const bugRows: any[][] = [
      ['PROJECT INTEGRATION TEST (SIT) - DEFECTS & FINDINGS'],
      ['Project Name', projectName, '', 'Audit Date', dateStr],
      ['Tester', tester, '', 'Defect Count', bugCases.length],
      [],
      ['No', 'Function', 'Tipe Temuan', 'Is Recurring', 'Script Test', 'Output Expected', 'Jumlah Data', 'Detail Data', 'Screenshot', 'Result', 'Keterangan (Root Cause)', 'Respon PIC', 'Dev Name', 'Status Dev']
    ];

    bugCases.forEach(c => {
      bugRows.push([
        c.no, c.functionName, c.findingType || 'Major', c.isRecurring || 'Tidak', c.testScript,
        c.outputExpected, c.testDataCount || 1, c.testDataDetail || '', c.screenshotName || '',
        'X', c.notes || 'Anomali / Error terdeteksi', c.picResponse || '', c.devName || 'Dev Team', 'Open'
      ]);
    });

    const wsNegative = wb.addWorksheet('Negative & Bug Test');
    wsNegative.addRows(bugRows);

    const wbout = await wb.xlsx.writeBuffer();
    return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /**
   * Convert an ExcelJS worksheet into an array-of-arrays — the same shape the
   * previous SheetJS `sheet_to_json(sheet, { header: 1 })` call produced.
   */
  private static worksheetToArray(sheet: ExcelJS.Worksheet): any[][] {
    const rows: any[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as any[]).slice(1).map(v => SITEngine.normalizeCellValue(v));
      rows.push(values);
    });
    return rows;
  }

  private static normalizeCellValue(value: any): any {
    if (value === null || value === undefined) return undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'object') {
      if (Array.isArray(value.richText)) {
        return value.richText.map((part: any) => part.text ?? '').join('');
      }
      if (typeof value.text === 'string') return value.text; // hyperlink cell
      if ('result' in value) return SITEngine.normalizeCellValue(value.result); // formula cell
      if ('error' in value) return undefined;
    }
    return value;
  }

  /**
   * Minimal CSV parser (comma or semicolon delimited, quoted fields supported)
   * covering the CSV support SheetJS previously provided.
   */
  private static parseCsvText(text: string): any[][] {
    const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const firstLine = src.split('\n')[0] || '';
    const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
    const rows: any[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += ch;
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length > 0);
  }
}
