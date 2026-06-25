'use strict';

// Site-agnostic browser engine. Single place that decides local Chromium vs
// Browserless and builds a context/page. Every automation goes through here.

const DEFAULT_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Launch (local) or connect (Browserless) a Chromium browser.
 * Default = local Chromium (the Docker image bundles it; free, no session cap).
 * Browserless is opt-in: USE_BROWSERLESS=true + BROWSERLESS_API_KEY. Its free
 * plan caps sessions at 60s, so it's off by default.
 */
async function launchBrowser() {
    const { chromium } = require('playwright');
    const apiKey = process.env.BROWSERLESS_API_KEY;
    const useBrowserless = !!apiKey && process.env.USE_BROWSERLESS === 'true';
    if (useBrowserless) {
        const sessionTimeout = parseInt(process.env.BROWSERLESS_TIMEOUT_MS, 10) || 180000;
        console.log(`[core/browser] Connecting to Browserless (session timeout ${sessionTimeout}ms)...`);
        const wsEndpoint = `wss://production-sfo.browserless.io/playwright/chromium?token=${apiKey}&timeout=${sessionTimeout}`;
        return chromium.connect(wsEndpoint);
    }
    console.log('[core/browser] Launching local Chromium (free, no session cap)...');
    return chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
}

/**
 * Build a fresh context + page on an existing browser.
 * @returns {Promise<{context, page}>}
 */
async function newPage(browser, opts = {}) {
    const context = await browser.newContext({ userAgent: opts.userAgent || DEFAULT_UA });
    const page = await context.newPage();
    page.setDefaultTimeout(opts.timeout || 60000);
    return { context, page };
}

module.exports = { launchBrowser, newPage, DEFAULT_UA };
