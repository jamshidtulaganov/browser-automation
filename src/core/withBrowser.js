'use strict';

// Helper for one-shot, stateless browser ops (screenshot, pdf, extract...).
// Handles launch + context + guaranteed cleanup so automations stay tiny.

const { launchBrowser, newPage } = require('./browser');

/**
 * @param {(ctx:{browser,context,page}) => Promise<any>} fn
 * @param {object} [opts] forwarded to newPage (userAgent, timeout)
 */
async function withBrowser(fn, opts = {}) {
    const browser = await launchBrowser();
    try {
        const { context, page } = await newPage(browser, opts);
        return await fn({ browser, context, page });
    } finally {
        try { await browser.close(); } catch (_) { /* noop */ }
    }
}

module.exports = { withBrowser };
