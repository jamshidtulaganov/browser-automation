'use strict';

// WEX "App Created — Today" report scraper. Logs into the WEX Community report,
// applies the Today filter, and 2D-scrolls the Lightning virtual grid to extract
// every row/column. Returns an array of record objects.

const { BaseScraper } = require('../../core/BaseScraper');

const REPORT_URL = 'https://wexinc.my.site.com/communities/s/report/00OVP000001m2AD2AY/report-for-ayshe?queryScope=mru';

class WexReportScraper extends BaseScraper {
    constructor() {
        super();
        this.REPORT_URL = REPORT_URL;
        // Report account creds. Prefer dedicated env vars; fall back to the
        // scraper login if not separately configured.
        this.USERNAME = process.env.WEX_REPORT_USERNAME || process.env.WEX_USERNAME_SCRAPER;
        this.PASSWORD = process.env.WEX_REPORT_PASSWORD || process.env.WEX_PASSWORD_SCRAPER;
    }

    async run() {
        await this.init();
        try {
            console.log(`🚀 WexReportScraper: Navigating to ${this.REPORT_URL}`);
            await this.page.goto(this.REPORT_URL, { waitUntil: 'domcontentloaded' });

            console.log('WexReportScraper: Entering credentials...');
            await this.page.locator('#username').fill(this.USERNAME);
            await this.page.locator('#password').fill(this.PASSWORD);
            await this.page.locator('#Login').click();

            console.log('WexReportScraper: Waiting for Salesforce dashboard...');
            await this.page.waitForTimeout(10000);

            const reportFrame = this.page.frameLocator('iframe[title="Report Viewer"]');

            console.log('WexReportScraper: Waiting for Filters button...');
            const filtersBtn = reportFrame.locator('button.report-action-toggleFilter').first();
            await filtersBtn.waitFor({ state: 'visible', timeout: 30000 });
            if (await filtersBtn.getAttribute('aria-pressed') !== 'true') {
                await filtersBtn.click();
                await this.page.waitForTimeout(2000);
            }

            console.log("WexReportScraper: Clicking 'App Created' filter...");
            await reportFrame.locator('button').filter({ hasText: 'App Created' }).first().click();

            console.log('WexReportScraper: Opening Range picklist...');
            await reportFrame.locator('.slds-form-element', { hasText: 'Range' }).locator('button.slds-picklist__label').click();
            await this.page.waitForTimeout(1000);

            console.log('WexReportScraper: Selecting "Today"');
            await reportFrame.locator('li.slds-dropdown__item a').filter({ hasText: 'Today' }).first().click();

            console.log('WexReportScraper: Clicking Apply button...');
            await reportFrame.locator('button.filter-apply').first().click();
            await this.page.waitForTimeout(4000);

            const iframeHandle = await this.page.waitForSelector('iframe[title="Report Viewer"]', { timeout: 15000 });
            const frameObj = await iframeHandle.contentFrame();
            if (!frameObj) throw new Error('iframe[title="Report Viewer"] found but contentFrame() returned null');
            console.log(`Report frame: ${frameObj.url().substring(0, 120)}`);

            const ROW_SEL = 'tr.data-grid-table-row:not(.data-grid-header-row)';
            const HEADER_SEL = 'tr.data-grid-header-row th';
            await frameObj.waitForSelector(ROW_SEL, { timeout: 30000 });

            const masterMap = {};
            const masterHeaders = {};

            const dims = await frameObj.evaluate(() => {
                const el = document.querySelector('tr.data-grid-table-row')?.closest('.widgets');
                if (!el) return { maxX: 0, maxY: 0 };
                return {
                    maxX: Math.max(0, el.scrollWidth - el.clientWidth),
                    maxY: Math.max(0, el.scrollHeight - el.clientHeight),
                };
            });
            console.log(`Scroll container: div.widgets  maxScrollX=${dims.maxX}  maxScrollY=${dims.maxY}`);

            const STEP = 500;
            const xPos = [0]; for (let x = STEP; x < dims.maxX; x += STEP) xPos.push(x); if (dims.maxX > 0) xPos.push(dims.maxX);
            const yPos = [0]; for (let y = STEP; y < dims.maxY; y += STEP) yPos.push(y); if (dims.maxY > 0) yPos.push(dims.maxY);
            console.log(`🚀 Grid Scrape: ${yPos.length} Y-pass(es) × ${xPos.length} X-step(s)`);

            for (const cy of yPos) {
                for (const cx of xPos) {
                    const actualX = await frameObj.evaluate(({ x, y }) => {
                        const el = document.querySelector('tr.data-grid-table-row')?.closest('.widgets');
                        if (!el) return -1;
                        el.scrollLeft = x;
                        el.scrollTop = y;
                        el.dispatchEvent(new Event('scroll', { bubbles: true }));
                        return el.scrollLeft;
                    }, { x: cx, y: cy });
                    await this.page.waitForTimeout(1200);

                    const hdrs = await frameObj.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map(th => {
                        const ci = th.getAttribute('data-column-index');
                        const sp = th.querySelector('.slds-truncate');
                        const nm = sp ? (sp.getAttribute('title') || sp.innerText) : th.innerText;
                        return ci ? { ci, nm: nm.split('\n')[0].trim() } : null;
                    }).filter(h => h && h.nm !== ''), HEADER_SEL);
                    hdrs.forEach(h => { masterHeaders[h.ci] = h.nm; });

                    const dataRows = await frameObj.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map(row => {
                        const firstCell = row.querySelector('[data-row-index]');
                        const rid = firstCell ? firstCell.getAttribute('data-row-index') : null;
                        if (rid === null) return null;
                        const snap = { rowId: rid };
                        row.querySelectorAll('td,th').forEach(cell => {
                            const ci = cell.getAttribute('data-column-index');
                            if (ci === null) return;
                            const aria = cell.getAttribute('aria-label');
                            let val = cell.innerText.trim();
                            if (aria && aria.includes(': ')) val = aria.split(': ')[1].trim();
                            snap[`col_${ci}`] = val;
                        });
                        return snap;
                    }).filter(Boolean), ROW_SEL);
                    dataRows.forEach(d => { masterMap[d.rowId] = { ...(masterMap[d.rowId] || {}), ...d }; });

                    console.log(`  Y=${cy} X=${cx} (actual=${actualX}) rows=${dataRows.length} unique=${Object.keys(masterMap).length}`);
                }
            }
            console.log('✅ Reached end of grid.');

            const finalData = Object.values(masterMap).map(row => {
                const obj = { row_index: row.rowId };
                for (const [idx, name] of Object.entries(masterHeaders)) obj[name] = row[`col_${idx}`] || '';
                return obj;
            }).filter(row => (row['Online Application: Application Id'] || '').startsWith('Application-'))
              .sort((a, b) => parseInt(a.row_index) - parseInt(b.row_index));

            console.log(`✅ Extracted ${finalData.length} records.`);
            return finalData;
        } catch (error) {
            console.error('❌ WexReportScraper error:', error.message);
            if (this.page && !this.page.isClosed()) {
                try { await this.page.screenshot({ path: `error_debug_${Date.now()}.png` }); } catch (_) { /* noop */ }
            }
            throw error;
        } finally {
            await this.cleanup();
        }
    }
}

module.exports = WexReportScraper;
