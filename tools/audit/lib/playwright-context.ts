import { chromium, type Browser, type BrowserContext, type Page, devices } from 'playwright';
import { config } from '../config.ts';

export interface PwSession {
  browser: Browser;
  context: BrowserContext;
  close: () => Promise<void>;
}

export type EmulationMode = 'desktop' | 'mobile';

export async function openBrowser(mode: EmulationMode = 'desktop'): Promise<PwSession> {
  const browser = await chromium.launch({ headless: true });
  const contextOptions = mode === 'mobile'
    ? {
        ...devices['iPhone 14'],
        viewport: { width: 393, height: 852 },
      }
    : {
        viewport: { width: config.playwright.canonicalWidth, height: config.playwright.canonicalHeight },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 veil-audit/0.1',
      };
  const context = await browser.newContext({ ...contextOptions, ignoreHTTPSErrors: false });
  context.setDefaultNavigationTimeout(config.playwright.navigationTimeoutMs);
  return {
    browser,
    context,
    close: async () => {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}

export async function gotoStable(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page
    .waitForLoadState('networkidle', { timeout: config.playwright.networkIdleTimeoutMs })
    .catch(() => {});
}
