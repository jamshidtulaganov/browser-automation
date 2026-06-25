'use strict';

// Generic, site-agnostic browser ops. Each uses withBrowser() (launch + cleanup
// handled for it) and returns plain JSON-serializable data. Binary outputs
// (screenshot/pdf) are returned as base64.

const { withBrowser } = require('../../core/withBrowser');
const { badRequest } = require('../../core/httpError');

function requireUrl(params) {
    const url = params && params.url ? String(params.url) : '';
    if (!/^https?:\/\//i.test(url)) throw badRequest('a valid http(s) url is required');
    return url;
}

const screenshot = {
    name: 'screenshot',
    description: 'Navigate to a URL and return a PNG screenshot (base64).',
    async run(params = {}) {
        const url = requireUrl(params);
        return withBrowser(async ({ page }) => {
            await page.goto(url, { waitUntil: params.waitUntil || 'networkidle' });
            if (params.waitForSelector) await page.waitForSelector(params.waitForSelector, { timeout: 30000 });
            const buf = await page.screenshot({ fullPage: params.fullPage !== false });
            return { url, format: 'png', base64: buf.toString('base64') };
        });
    },
};

const pdf = {
    name: 'pdf',
    description: 'Navigate to a URL and return a PDF (base64).',
    async run(params = {}) {
        const url = requireUrl(params);
        return withBrowser(async ({ page }) => {
            await page.goto(url, { waitUntil: params.waitUntil || 'networkidle' });
            const buf = await page.pdf({ format: params.pageFormat || 'A4', printBackground: true });
            return { url, format: 'pdf', base64: buf.toString('base64') };
        });
    },
};

const extract = {
    name: 'extract',
    description: 'Navigate to a URL and return text content (optionally scoped to a selector).',
    async run(params = {}) {
        const url = requireUrl(params);
        return withBrowser(async ({ page }) => {
            await page.goto(url, { waitUntil: params.waitUntil || 'networkidle' });
            if (params.selector) {
                const loc = page.locator(params.selector);
                await loc.first().waitFor({ state: 'attached', timeout: 30000 });
                const texts = await loc.allInnerTexts();
                return { url, selector: params.selector, count: texts.length, texts };
            }
            const text = await page.evaluate(() => document.body ? document.body.innerText : '');
            return { url, title: await page.title(), text };
        });
    },
};

module.exports = [screenshot, pdf, extract];
