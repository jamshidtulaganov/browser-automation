'use strict';

// C-14: Close WEX Application.
// Logs into WEX Community, navigates directly to the app detail page by SF record ID,
// clicks "New Task", fills "Close Application" / "Please close the application.", and saves.
// Uses direct URL navigation (same pattern as C-27 BOCA) — more reliable than search flow.

const { BaseScraper } = require('../../core/BaseScraper');

const TASK_DEFAULTS = {
    subject:    'Close Application',
    comments:   'Please close the application.',
    taskStatus: 'Not Started',
    priority:   'Normal',
};

class WexCloseScraper extends BaseScraper {
    constructor() {
        super();
        this.BASE_URL  = 'https://wexinc.my.site.com';
        this.LOGIN_URL = 'https://wexinc.my.site.com/communities/login';
        this.USERNAME  = process.env.WEX_USERNAME_SCRAPER;
        this.PASSWORD  = process.env.WEX_PASSWORD_SCRAPER;
    }

    /**
     * Submit a "Close Application" task on the WEX app detail page.
     *
     * @param {string} appId      - Numeric WEX application ID (e.g. "889510")
     * @param {string} sfRecordId - Salesforce record ID (e.g. "a3PVP000003QH6j2AG")
     * @param {string} sfStatus   - Current SF Status__c (passed through to return value)
     * @param {{
     *   assignedTo?: string,  // Task owner; defaults to app owner resolved from SF
     *   status?:     string,  // Task Status field; default: "Not Started"
     *   priority?:   string,  // Task Priority; default: "Normal"
     *   dueDate?:    string,  // Due Date in MM/DD/YYYY or ISO YYYY-MM-DD
     * }} [task]
     * @returns {{ action:'sent', appId, status, comments, assignedTo, taskStatus, priority, dueDate }}
     */
    async sendClose(appId, sfRecordId, sfStatus, task = {}) {
        const assignedTo = task.assignedTo != null ? String(task.assignedTo) : null;
        const taskStatus = task.status     != null ? String(task.status)     : TASK_DEFAULTS.taskStatus;
        const priority   = task.priority   != null ? String(task.priority)   : TASK_DEFAULTS.priority;
        const subject    = TASK_DEFAULTS.subject;
        const dueDate    = task.dueDate    != null ? normalizeDueDate(task.dueDate) : '';
        const comments   = TASK_DEFAULTS.comments;

        const step = async (name, fn) => {
            try {
                await fn();
            } catch (err) {
                const msg = `[${name}] failed: ${err.message}`;
                console.error(`[WexCloseScraper] ${msg}`);
                if (this.page && !this.page.isClosed()) {
                    try { await this.page.screenshot({ path: `close_error_${appId}_${name.replace(/\s+/g,'_')}_${Date.now()}.png` }); } catch (_) {}
                }
                throw new Error(msg);
            }
        };

        const auraType = async (locator, value, label) => {
            await locator.waitFor({ state: 'attached', timeout: 10000 });
            for (let attempt = 1; attempt <= 2; attempt++) {
                await locator.evaluate(el => el.focus());
                await this.page.waitForTimeout(100);
                await locator.evaluate(el => { el.value = ''; });
                await locator.pressSequentially(value, { delay: 80 });
                await this.page.waitForTimeout(150);
                const typed = await locator.inputValue().catch(() => '');
                if (typed.trim().length > 0) break;
                if (attempt === 2) console.warn(`[WexCloseScraper] ${label}: inputValue empty after 2 attempts — proceeding`);
                await this.page.waitForTimeout(200);
            }
        };

        const _runStart = Date.now();
        await this.init();
        try {
            // ── 1. Login ──────────────────────────────────────────────────────
            await step('login', async () => {
                console.log(`[WexCloseScraper] Logging in for app ${appId}...`);
                await this.page.goto(this.LOGIN_URL, { waitUntil: 'domcontentloaded' });
                await this.page.locator('#username').fill(this.USERNAME);
                await this.page.locator('#password').fill(this.PASSWORD);
                await this.page.locator('#Login').click();
                await this.page.waitForURL('**/communities/s/**', { timeout: 45000 });
                await this.page.waitForSelector('.forceCommunityGlobalNavigation, .siteforceContentArea', { timeout: 30000 });
            });

            // ── 2. Navigate to app detail page ────────────────────────────────
            await step('navigate', async () => {
                const appUrl = `${this.BASE_URL}/communities/s/onlineapplication/${sfRecordId}/application${appId}`;
                console.log(`[WexCloseScraper] Navigating to ${appUrl}`);
                await this.page.goto(appUrl, { waitUntil: 'domcontentloaded' });
                await this.page.waitForSelector('button:has-text("New Task"), .slds-page-header', { timeout: 30000 });
            });

            // ── 3. Open New Task modal ─────────────────────────────────────────
            let modal, modalTitle;
            await step('open-modal', async () => {
                console.log('[WexCloseScraper] Clicking New Task...');
                const newTaskBtn = this.page.locator('button:has-text("New Task")').first();
                await newTaskBtn.waitFor({ state: 'visible', timeout: 20000 });
                await newTaskBtn.click();

                modalTitle = this.page.locator('h2:has-text("New Task"), h1:has-text("New Task")').first();
                await modalTitle.waitFor({ state: 'visible', timeout: 15000 });

                modal = this.page.locator('div[role="dialog"]').filter({
                    has: this.page.locator('h1:has-text("New Task"), h2:has-text("New Task")')
                });

                console.log('[WexCloseScraper] Waiting for form fields...');
                await modal.locator('label:has-text("Assigned To")').first().waitFor({ state: 'visible', timeout: 20000 });
                console.log('[WexCloseScraper] Modal ready.');
            });

            // ── 4. Assigned To ─────────────────────────────────────────────────
            if (assignedTo) {
                await step('assigned-to', async () => {
                    const ownerField = modal.locator('[data-target-selection-name="sfdc:RecordField.Task.OwnerId"]').first();

                    const currentPill = ownerField
                        .locator('.slds-pill, lightning-pill, a.pillText, span.pillText')
                        .filter({ hasText: assignedTo }).first();
                    if (await currentPill.count() > 0) {
                        console.log(`[WexCloseScraper] Assigned To already "${assignedTo}" — keeping pre-selected pill.`);
                        return;
                    }

                    const REMOVE_SELS = [
                        'a.deleteAction',
                        'button[title="Remove"]',
                        '.slds-pill__remove',
                        'button.slds-pill__remove',
                    ];
                    const ownerInputVisible = () => ownerField
                        .locator('input[placeholder="Search People..."]')
                        .first().isVisible().catch(() => false);
                    let inputReady = false;
                    for (let i = 0; i < 40; i++) {
                        if (await ownerInputVisible()) { inputReady = true; break; }
                        for (const sel of REMOVE_SELS) {
                            const rm = ownerField.locator(sel).first();
                            if (await rm.count() > 0) {
                                await rm.click({ force: true }).catch(() => {});
                                await rm.evaluate(el => el.click()).catch(() => {});
                                if (i === 0) console.log(`[WexCloseScraper] Removing pre-filled pill via ${sel}`);
                                break;
                            }
                        }
                        await this.page.waitForTimeout(500);
                    }
                    if (!inputReady) {
                        throw new Error('"Search People..." input never became visible — pill removal failed');
                    }

                    const lookupInput = ownerField.locator('input[placeholder="Search People..."]').first();
                    await lookupInput.click({ force: true }).catch(() => {});
                    const focused = await this.page.evaluate(() => {
                        const f   = document.querySelector('[data-target-selection-name="sfdc:RecordField.Task.OwnerId"]');
                        const inp = f?.querySelector('input[placeholder="Search People..."]');
                        return !!(inp && document.activeElement === inp);
                    }).catch(() => false);
                    if (!focused) {
                        await lookupInput.evaluate(el => el.focus()).catch(() => {});
                    }
                    await this.page.waitForTimeout(100);

                    await auraType(lookupInput, assignedTo, 'Assigned To');

                    const hasOptions = () => this.page
                        .evaluate(() => !!document.querySelector('a[role="option"] .primaryLabel'))
                        .catch(() => false);
                    let optsReady = false;
                    for (let i = 0; i < 40; i++) {
                        if (await hasOptions()) { optsReady = true; break; }
                        if (i === 14) {
                            console.warn('[WexCloseScraper] No options after ~7s — re-typing search term');
                            await lookupInput.evaluate(el => el.focus()).catch(() => {});
                            await auraType(lookupInput, assignedTo, 'Assigned To (retry)');
                        }
                        await this.page.waitForTimeout(500);
                    }
                    if (!optsReady) console.warn('[WexCloseScraper] Options still absent after 20s — attempting click anyway');

                    const optionClicked = await this.page.evaluate((name) => {
                        const labels = document.querySelectorAll('a[role="option"] .primaryLabel');
                        for (const lbl of labels) {
                            if ((lbl.getAttribute('title') || lbl.textContent?.trim()) === name) {
                                const anchor = lbl.closest('a[role="option"]');
                                if (anchor) { anchor.click(); return `exact:${name}`; }
                            }
                        }
                        const first = document.querySelector('a[role="option"]');
                        const label = first?.querySelector('.primaryLabel')?.getAttribute('title') || first?.textContent?.trim() || '?';
                        if (first) { first.click(); return `first:${label}`; }
                        return null;
                    }, assignedTo).catch(() => null);

                    if (!optionClicked) {
                        throw new Error(`Assigned To "${assignedTo}": no a[role="option"] in DOM after search`);
                    }
                    console.log(`[WexCloseScraper] Option selected: ${optionClicked}`);
                    await this.page.waitForSelector(
                        '[data-target-selection-name="sfdc:RecordField.Task.OwnerId"] .slds-pill',
                        { state: 'attached', timeout: 5000 }
                    ).catch(() => {});

                    const pill = ownerField.locator('.slds-pill, lightning-pill, a.pillText, span.pillText').first();
                    const pillText = (await pill.textContent().catch(() => '')).trim();
                    if (!pillText) {
                        throw new Error('pill not set after option click');
                    }
                    if (!pillText.includes(assignedTo) && !assignedTo.includes(pillText)) {
                        throw new Error(`pill mismatch: want "${assignedTo}" got "${pillText}"`);
                    }
                    console.log(`[WexCloseScraper] Assigned To verified: "${pillText}"`);
                });
            }

            // ── 5. Due Date ────────────────────────────────────────────────────
            if (dueDate) {
                await step('due-date', async () => {
                    const dueDateInput = modal.locator('label:has-text("Due Date") ~ div input').first();
                    await dueDateInput.waitFor({ state: 'visible', timeout: 5000 });
                    await dueDateInput.fill(dueDate);
                    await dueDateInput.press('Tab');
                }).catch(() => {});
            }

            // ── 6. Subject ─────────────────────────────────────────────────────
            await step('subject', async () => {
                const subjectLabelCount = await modal.locator('label:has-text("Subject")').count();
                if (subjectLabelCount === 0) return;
                const subjectInput = modal.locator('label:has-text("Subject") ~ div input').first();
                const isVisible = await subjectInput.isVisible().catch(() => false);
                if (isVisible) {
                    await subjectInput.click();
                    await subjectInput.fill(subject);
                } else {
                    await auraType(subjectInput, subject, 'Subject');
                }
            }).catch(() => {});

            // ── 7. Status ──────────────────────────────────────────────────────
            await step('status', async () => {
                const statusLabelCount = await modal.locator('label:has-text("Status")').count();
                if (statusLabelCount === 0) return;
                const taskStatusTrigger = modal.locator('label:has-text("Status") ~ div button').first();
                await taskStatusTrigger.click();
                await this.page.waitForSelector('div[role="listbox"]', { timeout: 3000 }).catch(() => {});
                await this.page.locator(`div[role="listbox"] span[title="${taskStatus}"], div[role="listbox"] span:has-text("${taskStatus}")`).first().click();
            }).catch(() => {});

            // ── 8. Priority ───────────────────────────────────────────────────
            await step('priority', async () => {
                const priorityLabelCount = await modal.locator('label:has-text("Priority")').count();
                if (priorityLabelCount === 0) return;
                const priorityTrigger = modal.locator('label:has-text("Priority") ~ div button').first();
                await priorityTrigger.click();
                await this.page.waitForSelector('div[role="listbox"]', { timeout: 3000 }).catch(() => {});
                await this.page.locator(`div[role="listbox"] span[title="${priority}"], div[role="listbox"] span:has-text("${priority}")`).first().click();
            }).catch(() => {});

            // ── 9. Comments ───────────────────────────────────────────────────
            await step('comments', async () => {
                const commentsLabelCount = await modal.locator('label:has-text("Comments")').count();
                const commentsArea = commentsLabelCount > 0
                    ? modal.locator('label:has-text("Comments") ~ div textarea').first()
                    : modal.locator('textarea').first();

                await commentsArea.waitFor({ state: 'visible', timeout: 8000 });
                const typeAndCommit = async (delay) => {
                    await commentsArea.click();
                    await commentsArea.evaluate(el => { el.value = ''; });
                    await commentsArea.pressSequentially(comments, { delay });
                    await this.page.waitForTimeout(120);
                    await commentsArea.evaluate(el => {
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.blur();
                    });
                    await this.page.waitForTimeout(120);
                    return (await commentsArea.inputValue().catch(() => ''))
                        || (await commentsArea.evaluate(el => el.value || '').catch(() => ''));
                };
                let filled = await typeAndCommit(30);
                if (!filled || !filled.includes('close')) {
                    console.warn('[WexCloseScraper] Comments read-back empty — retrying with slower type');
                    filled = await typeAndCommit(60);
                }
                if (!filled || !filled.includes('close')) {
                    throw new Error('[comments] empty after fill — value not committed to textarea');
                }
                console.log(`[WexCloseScraper] Comments set: "${filled}"`);
            });

            // ── 10. Save ──────────────────────────────────────────────────────
            await step('save', async () => {
                console.log('[WexCloseScraper] Saving task...');
                await modal.locator('button:has-text("Save")').first().evaluate(el => el.click());
                await modalTitle.waitFor({ state: 'hidden', timeout: 15000 });
                console.log(`[WexCloseScraper] Task saved for app ${appId}.`);
            });

            console.log(`[WexCloseScraper] Total run: ${Date.now() - _runStart}ms`);
            return { action: 'sent', appId, status: sfStatus, comments, assignedTo, taskStatus, priority, dueDate };

        } catch (err) {
            console.error(`[WexCloseScraper] Error on app ${appId}:`, err.message);
            if (this.page && !this.page.isClosed()) {
                try { await this.page.screenshot({ path: `close_error_${appId}_${Date.now()}.png` }); } catch (_) {}
            }
            throw err;
        } finally {
            await this.cleanup();
        }
    }
}

function normalizeDueDate(d) {
    const s = String(d).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[2]}/${m[3]}/${m[1]}` : s;
}

module.exports = WexCloseScraper;
