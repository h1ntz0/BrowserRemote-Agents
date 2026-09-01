import * as XLSX from 'xlsx';

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
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

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
  public static generateSITExcel(
    testCases: SITTestCase[],
    meta: Partial<SITReportMeta> = {}
  ): Blob {
    const wb = XLSX.utils.book_new();

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

    const wsHappy = XLSX.utils.aoa_to_sheet(happyRows);
    XLSX.utils.book_append_sheet(wb, wsHappy, 'Happy Test');

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

    const wsNegative = XLSX.utils.aoa_to_sheet(bugRows);
    XLSX.utils.book_append_sheet(wb, wsNegative, 'Negative & Bug Test');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
}
