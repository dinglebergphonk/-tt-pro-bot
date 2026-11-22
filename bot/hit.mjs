
import { chromium } from 'playwright';
import fs from 'node:fs';

const LINKS   = (process.env.REFERRAL_LINKS ?? '').split(/[\s,]+/).filter(Boolean);
const HITS    = Math.max(1, Number(process.env.HITS_PER_LINK ?? 1));
const UAS = [
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!LINKS.length) { console.error('REFERRAL_LINKS empty'); process.exit(1); }
fs.mkdirSync('shots', { recursive: true });
const report = [];

for (const [li, link] of LINKS.entries()) {
  for (let i = 0; i < HITS; i++) {
    const tag = `${li + 1}-${i + 1}`;
    const ua = UAS[Math.floor(Math.random() * UAS.length)];
    let browser;
    try {
      browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
      const ctx = await browser.newContext({
        userAgent: ua,
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2.6,
        isMobile: true,
        hasTouch: true,
        locale: 'en-US',
        timezoneId: 'America/New_York',
      });
      await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });
      await ctx.route('**/*', (r) =>
        ['font', 'media'].includes(r.request().resourceType()) ? r.abort() : r.continue());

      const page = await ctx.newPage();
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await sleep(5000);

      for (const cta of [
        page.getByText(/continue in browser/i).first(),
        page.getByText(/open in app/i).first(),
        page.locator('a[href*="apps.apple.com"]').first(),
        page.locator('a[href*="play.google.com"]').first(),
      ]) {
        if (await cta.count() && await cta.isVisible().catch(() => false)) {
          await cta.click({ timeout: 4000 }).catch(() => {});
          await sleep(2500);
          break;
        }
      }

      await page.mouse.wheel(0, 500); await sleep(1500);
      await page.mouse.wheel(0, 500); await sleep(1500);

      const finalUrl = page.url();
      const shot = `shots/${tag}-${Date.now()}.png`;
      await page.screenshot({ path: shot, fullPage: true });
      const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 400);
      const entry = { tag, ok: true, finalUrl, shot, text };
      report.push(entry);
      console.log(JSON.stringify(entry));
    } catch (err) {
      const entry = { tag, ok: false, error: String(err).slice(0, 300) };
      report.push(entry);
      console.log(JSON.stringify(entry));
    } finally {
      await browser?.close().catch(() => {});
    }
    await sleep(2000 + Math.random() * 3000);
  }
}
fs.writeFileSync('shots/report.json', JSON.stringify(report, null, 2));
console.log(`done: ${report.filter((r) => r.ok).length}/${report.length}`);
