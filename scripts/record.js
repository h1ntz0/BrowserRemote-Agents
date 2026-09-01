import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const framesDir = path.join(__dirname, 'temp_frames');

if (!fs.existsSync(framesDir)) {
  fs.mkdirSync(framesDir, { recursive: true });
}

async function recordWalkthrough() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 440, height: 750 }
  });
  const page = await context.newPage();

  let frameCount = 0;
  async function snap(durationFrames = 10) {
    const framePath = path.join(framesDir, `frame_${String(frameCount).padStart(4, '0')}.png`);
    await page.screenshot({ path: framePath });
    frameCount++;
    for (let i = 1; i < durationFrames; i++) {
      const copyPath = path.join(framesDir, `frame_${String(frameCount).padStart(4, '0')}.png`);
      fs.copyFileSync(framePath, copyPath);
      frameCount++;
    }
  }

  console.log('Loading sidepanel...');
  await page.goto('http://localhost:4173/sidepanel.html');
  await snap(12);

  // 1. Guide Tab
  console.log('Step 1: Guide');
  await page.locator('button:has-text("Guide")').click();
  await snap(16);

  // 2. Config Tab
  console.log('Step 2: Config');
  await page.locator('button:has-text("Config")').click();
  await snap(10);
  await page.locator('input[type="password"]').fill('sk-proj-demo-api-key-sample');
  await snap(10);
  await page.locator('button:has-text("Test Connection")').click();
  await snap(16);

  // 3. Agent Tab & Typing Prompt
  console.log('Step 3: Agent Task');
  await page.locator('button:has-text("Agent")').click();
  await snap(8);
  const prompt = "Inspect the orders page, find pending transactions, and extract records.";
  for (let i = 0; i <= prompt.length; i += 5) {
    await page.locator('textarea').fill(prompt.slice(0, i));
    await snap(2);
  }
  await snap(10);

  // 4. Scraper Tab
  console.log('Step 4: Scraper Auto-Detect');
  await page.locator('button:has-text("Scraper")').click();
  await snap(10);
  await page.locator('button:has-text("Auto Detect Schema")').click();
  await snap(16);

  console.log('Step 5: Extraction & Report');
  await page.locator('button:has-text("Extract Active Page")').click();
  await snap(20);

  // 5. Timeline / Audit Tab
  console.log('Step 6: Timeline');
  await page.locator('button:has-text("Timeline")').click();
  await snap(16);

  await browser.close();
  console.log(`Captured ${frameCount} frames.`);
}

recordWalkthrough().catch(err => {
  console.error('Recording error:', err);
  process.exit(1);
});
