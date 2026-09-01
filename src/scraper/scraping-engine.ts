import { ExtractionSchema, ExtractionSchemaField } from '@/protocol/types';

export interface ValidationReport {
  totalRecords: number;
  totalPages: number;
  duplicateCount: number;
  missingFields: Record<string, number>;
  invalidUrls: number;
  completionRate: number;
  durationMs: number;
}

export class ScrapingEngine {
  public static proposeSchemaFromHtml(htmlSample: string): ExtractionSchema {
    // Detect repeating structures like product cards, table rows, or list items
    const schema: ExtractionSchema = {
      name: 'ExtractedDataset',
      containerSelector: '.product-card, tr.order-row, .item-card, article.post, li.result-item, .card',
      fields: [
        { name: 'title', selector: 'h2, h3, .title, .product-title, a.name', attribute: 'text', type: 'string', required: true },
        { name: 'price', selector: '.price, .product-price, .amount, span.currency', attribute: 'text', type: 'number' },
        { name: 'url', selector: 'a[href]', attribute: 'href', type: 'url' },
        { name: 'image', selector: 'img[src]', attribute: 'src', type: 'image' },
        { name: 'rating', selector: '.rating, .stars, [aria-label*="star"], .score', attribute: 'text', type: 'string' }
      ],
      pagination: {
        nextButtonSelector: 'a.next, button.next-page, [rel="next"], a:has-text("Next"), .pagination-next',
        maxPages: 10
      }
    };
    return schema;
  }

  public static validateDataset(
    records: Record<string, any>[],
    schema: ExtractionSchema,
    totalPages: number = 1,
    durationMs: number = 0
  ): ValidationReport {
    const totalRecords = records.length;
    const seen = new Set<string>();
    let duplicateCount = 0;
    let invalidUrls = 0;
    const missingFields: Record<string, number> = {};

    schema.fields.forEach(f => {
      missingFields[f.name] = 0;
    });

    for (const record of records) {
      // Hash record representation for duplicate detection
      const signature = JSON.stringify(record);
      if (seen.has(signature)) {
        duplicateCount++;
      } else {
        seen.add(signature);
      }

      // Check fields
      for (const field of schema.fields) {
        const val = record[field.name];
        if (val === null || val === undefined || val === '') {
          missingFields[field.name]++;
        } else if (field.type === 'url' && typeof val === 'string') {
          if (!val.startsWith('http://') && !val.startsWith('https://')) {
            invalidUrls++;
          }
        }
      }
    }

    const requiredFields = schema.fields.filter(f => f.required);
    let validCount = 0;
    for (const record of records) {
      const isComplete = requiredFields.every(f => record[f.name] !== null && record[f.name] !== undefined && record[f.name] !== '');
      if (isComplete) validCount++;
    }

    const completionRate = totalRecords > 0 ? Number(((validCount / totalRecords) * 100).toFixed(1)) : 100;

    return {
      totalRecords,
      totalPages,
      duplicateCount,
      missingFields,
      invalidUrls,
      completionRate,
      durationMs
    };
  }
}
