import { describe, it, expect } from 'vitest';
import { ScrapingEngine } from '@/scraper/scraping-engine';
import { ExtractionSchema } from '@/protocol/types';

describe('ScrapingEngine & Dataset Validation', () => {
  const schema: ExtractionSchema = {
    name: 'Products',
    containerSelector: '.product-item',
    fields: [
      { name: 'name', selector: '.title', type: 'string', required: true },
      { name: 'price', selector: '.price', type: 'number', required: true },
      { name: 'url', selector: 'a', attribute: 'href', type: 'url' }
    ]
  };

  it('validates datasets, calculates completion rate, and detects duplicates', () => {
    const rawData = [
      { name: 'Mechanical Keyboard', price: 99.99, url: 'https://store.example.com/item1' },
      { name: 'Gaming Mouse', price: 49.99, url: 'https://store.example.com/item2' },
      { name: 'Gaming Mouse', price: 49.99, url: 'https://store.example.com/item2' }, // Duplicate
      { name: 'Desk Mat', price: null, url: 'invalid-url' } // Missing price & invalid URL
    ];

    const report = ScrapingEngine.validateDataset(rawData, schema, 1, 1200);

    expect(report.totalRecords).toBe(4);
    expect(report.duplicateCount).toBe(1);
    expect(report.missingFields['price']).toBe(1);
    expect(report.invalidUrls).toBe(1);
    expect(report.completionRate).toBe(75.0); // 3 of 4 records have required fields
  });
});
