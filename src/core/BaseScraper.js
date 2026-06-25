'use strict';

// Base class for stateful, multi-step scrapers that own a browser for their
// whole run (login → navigate → act). Generic one-shot ops should use
// withBrowser() instead. Browser strategy lives in core/browser.js.

const { launchBrowser, newPage } = require('./browser');

class BaseScraper {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
    }

    async init() {
        this.browser = await launchBrowser();
        const { context, page } = await newPage(this.browser);
        this.context = context;
        this.page = page;
    }

    async cleanup() {
        try {
            if (this.browser) {
                await this.browser.close();
                console.log('[BaseScraper] Browser closed.');
            }
        } catch (e) {
            console.error('[BaseScraper] cleanup error:', e.message);
        }
    }
}

module.exports = { BaseScraper };
