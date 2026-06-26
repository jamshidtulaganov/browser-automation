'use strict';

// C-29: WEX Apps Application closer.
// Logs into WEX Community (Salesforce), searches for app by Company Name or App ID,
// clicks on application number, selects "New Task", and enters "Please close the application."

const { BaseScraper } = require('../../core/BaseScraper');

const TASK_DEFAULTS = {
    subject:    'Close Application',
    comments:   'Please close the application.',
    taskStatus: 'Not Started',
    priority:   'Normal',
};

class WexAppsScraper extends BaseScraper {
    constructor() {
        super();
        this.BASE_URL  = 'https://wexinc.my.site.com';
        this.LOGIN_URL = 'https://wexinc.my.site.com/communities/login';
        this.USERNAME  = process.env.WEX_USERNAME_SCRAPER;
        this.PASSWORD  = process.env.WEX_PASSWORD_SCRAPER;
    }

    /**
     * Search for WEX application and submit a close task.
     *
     * @param {{
     *   companyName?: string,  // Company Name to search for
     *   appId?:       string,  // Application ID to search for (fallback)
     *   assignedTo?:  string,  // Task owner name, default: app owner from search result
     *   status?:      string,  // Task Status field, default: "Not Started"
     *   priority?:    string,  // Task Priority, default: "Normal"
     *   dueDate?:     string,  // Due Date in MM/DD/YYYY or ISO YYYY-MM-DD
     * }} params
     * @returns {{ action:'sent', searchTerm, appId, assignedTo, taskStatus, priority, dueDate }}
     */
    async closeApplication(params = {}) {
        const searchTerm = params.companyName || params.appId;
        if (!searchTerm) throw new Error('companyName or appId is required');

        const assignedTo = params.assignedTo != null ? String(params.assignedTo) : null;
        const taskStatus = params.status     != null ? String(params.status)     : TASK_DEFAULTS.taskStatus;
        const priority   = params.priority   != null ? String(params.priority)   : TASK_DEFAULTS.priority;
        const subject    = TASK_DEFAULTS.subject;
        const dueDate    = params.dueDate    != null ? normalizeDueDate(params.dueDate) : '';
        const comments   = TASK_DEFAULTS.comments;

        const step = async (name, fn) => {
            try {
                await fn();
            } catch (err) {
                const msg = `[${name}] failed: ${err.message}`;
                console.error(`[WexAppsScraper] ${msg}`);
                if (this.page && !this.page.isClosed()) {
                    try { await this.page.screenshot({ path: `apps_error_${name.replace(/\s+/g,'_')}_${Date.now()}.png` }); } catch (_) {}
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
                if (attempt === 2) console.warn(`[WexAppsScraper] ${label}: inputValue empty after 2 attempts — proceeding`);
                await this.page.waitForTimeout(200);
            }
        };

        const _runStart = Date.now();
        let foundAppId = null;
        let foundOwner = null;

        await this.init();
        try {
            // ── 1. Login ──────────────────────────────────────────────────────
            await step('login', async () => {
                console.log(`[WexAppsScraper] Logging in...`);
                await this.page.goto(this.LOGIN_URL, { waitUntil: 'domcontentloaded' });
                await this.page.locator('#username').fill(this.USERNAME);
                await this.page.locator('#password').fill(this.PASSWORD);
                await this.page.locator('#Login').click();
                await this.page.waitForURL('**/communities/s/**', { timeout: 45000 });
                await this.page.waitForSelector('.forceCommunityGlobalNavigation, .siteforceContentArea', { timeout: 30000 });
            });

            // ── 2. Navigate to Applications page ──────────────────────────────
            await step('navigate-apps', async () => {
                const appsUrl = `${this.BASE_URL}/communities/s/onlineapplications`;
                console.log(`[WexAppsScraper] Navigating to ${appsUrl}`);
                await this.page.goto(appsUrl, { waitUntil: 'domcontentloaded' });
                await this.page.waitForSelector('input[type="search"], .slds-page-header', { timeout: 30000 });
            });

            // ── 3. Search for application ──────────────────────────────────────
            await step('search', async () => {
                console.log(`[WexAppsScraper] Searching for: ${searchTerm}`);
                const searchInput = this.page.locator('input[type="search"], input[placeholder*="Search"]').first();
                await searchInput.waitFor({ state: 'visible', timeout: 10000 });
                await searchInput.fill(searchTerm);
                await searchInput.press('Enter');
                await this.page.waitForTimeout(2000);
            });

            // ── 4. Click on application number ─────────────────────────────────
            await step('open-app', async () => {
                // Look for application link in search results
                const appLink = this.page.locator('a[href*="/onlineapplication/"]').first();
                await appLink.waitFor({ state: 'visible', timeout: 15000 });

                // Extract app ID from href if possible
                const href = await appLink.getAttribute('href');
                const appIdMatch = href?.match(/application(\d+)/);
                if (appIdMatch) foundAppId = appIdMatch[1];

                console.log(`[WexAppsScraper] Opening application ${foundAppId || '(unknown)'}`);
                await appLink.click();
                await this.page.waitForSelector('button:has-text("New Task"), .slds-page-header', { timeout: 30000 });
            });

            // ── 5. Open New Task modal ─────────────────────────────────────────
            let modal, modalTitle;
            await step('open-modal', async () => {
                console.log('[WexAppsScraper] Clicking New Task...');
                const newTaskBtn = this.page.locator('button:has-text("New Task")').first();
                await newTaskBtn.waitFor({ state: 'visible', timeout: 20000 });
                await newTaskBtn.click();

                modalTitle = this.page.locator('h2:has-text("New Task"), h1:has-text("New Task")').first();
                await modalTitle.waitFor({ state: 'visible', timeout: 15000 });

                modal = this.page.locator('div[role="dialog"]').filter({
                    has: this.page.locator('h1:has-text("New Task"), h2:has-text("New Task")')
                });

                console.log('[WexAppsScraper] Waiting for form fields...');
                await modal.locator('label:has-text("Assigned To")').first().waitFor({ state: 'visible', timeout: 20000 });
                console.log('[WexAppsScraper] Modal ready.');
            });

            // ── 6. Assigned To ─────────────────────────────────────────────────
            const finalAssignedTo = assignedTo || foundOwner;
            if (finalAssignedTo) {
                await step('assigned-to', async () => {
                    const ownerField = modal.locator('[data-target-selection-name="sfdc:RecordField.Task.OwnerId"]').first();

                    const currentPill = ownerField
                        .locator('.slds-pill, lightning-pill, a.pillText, span.pillText')
                        .filter({ hasText: finalAssignedTo }).first();
                    if (await currentPill.count() > 0) {
                        console.log(`[WexAppsScraper] Assigned To already "${finalAssignedTo}" — keeping pre-selected pill.`);
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
                                if (i === 0) console.log(`[WexAppsScraper] Removing pre-filled pill via ${sel}`);
                                break;
                            }
                        }
                        await this.page.waitForTimeout(500);
                    }
                    if (!inputReady) {
                        throw new Error('"Search People..." input never became visible');
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

                    await auraType(lookupInput, finalAssignedTo, 'Assigned To');

                    const hasOptions = () => this.page
                        .evaluate(() => !!document.querySelector('a[role="option"] .primaryLabel'))
                        .catch(() => false);
                    let optsReady = false;
                    for (let i = 0; i < 40; i++) {
                        if (await hasOptions()) { optsReady = true; break; }
                        if (i === 14) {
                            console.warn('[WexAppsScraper] No options after ~7s — re-typing search term');
                            await lookupInput.evaluate(el => el.focus()).catch(() => {});
                            await auraType(lookupInput, finalAssignedTo, 'Assigned To (retry)');
                        }
                        await this.page.waitForTimeout(500);
                    }
                    if (!optsReady) console.warn('[WexAppsScraper] Options still absent after 20s — attempting click anyway');

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
                    }, finalAssignedTo).catch(() => null);

                    if (!optionClicked) {
                        throw new Error(`Assigned To "${finalAssignedTo}": no a[role="option"] in DOM after search`);
                    }
                    console.log(`[WexAppsScraper] Option selected: ${optionClicked}`);
                    await this.page.waitForSelector(
                        '[data-target-selection-name="sfdc:RecordField.Task.OwnerId"] .slds-pill',
                        { state: 'attached', timeout: 5000 }
                    ).catch(() => {});

                    const pill = ownerField.locator('.slds-pill, lightning-pill, a.pillText, span.pillText').first();
                    const pillText = (await pill.textContent().catch(() => '')).trim();
                    if (!pillText) {
                        throw new Error('pill not set after option click');
                    }
                    if (!pillText.includes(finalAssignedTo) && !finalAssignedTo.includes(pillText)) {
                        throw new Error(`pill mismatch: want "${finalAssignedTo}" got "${pillText}"`);
                    }
                    console.log(`[WexAppsScraper] Assigned To verified: "${pillText}"`);
                });
            }

            // ── 7. Due Date ────────────────────────────────────────────────────
            if (dueDate) {
                await step('due-date', async () => {
                    const dueDateInput = modal.locator('label:has-text("Due Date") ~ div input').first();
                    await dueDateInput.waitFor({ state: 'visible', timeout: 5000 });
                    await dueDateInput.fill(dueDate);
                    await dueDateInput.press('Tab');
                }).catch(() => {});
            }

            // ── 8. Subject ─────────────────────────────────────────────────────
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

            // ── 9. Status ──────────────────────────────────────────────────────
            await step('status', async () => {
                const statusLabelCount = await modal.locator('label:has-text("Status")').count();
                if (statusLabelCount === 0) return;
                const taskStatusTrigger = modal.locator('label:has-text("Status") ~ div button').first();
                await taskStatusTrigger.click();
                await this.page.waitForSelector('div[role="listbox"]', { timeout: 3000 }).catch(() => {});
                await this.page.locator(`div[role="listbox"] span[title="${taskStatus}"], div[role="listbox"] span:has-text("${taskStatus}")`).first().click();
            }).catch(() => {});

            // ── 10. Priority ───────────────────────────────────────────────────
            await step('priority', async () => {
                const priorityLabelCount = await modal.locator('label:has-text("Priority")').count();
                if (priorityLabelCount === 0) return;
                const priorityTrigger = modal.locator('label:has-text("Priority") ~ div button').first();
                await priorityTrigger.click();
                await this.page.waitForSelector('div[role="listbox"]', { timeout: 3000 }).catch(() => {});
                await this.page.locator(`div[role="listbox"] span[title="${priority}"], div[role="listbox"] span:has-text("${priority}")`).first().click();
            }).catch(() => {});

            // ── 11. Comments ───────────────────────────────────────────────────
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
                    console.warn('[WexAppsScraper] Comments read-back empty — retrying with slower type');
                    filled = await typeAndCommit(60);
                }
                if (!filled || !filled.includes('close')) {
                    throw new Error('[comments] empty after fill — value not committed to textarea');
                }
                console.log(`[WexAppsScraper] Comments set: "${filled}"`);
            });

            // ── 12. Save ───────────────────────────────────────────────────────
            await step('save', async () => {
                console.log('[WexAppsScraper] Saving task...');
                await modal.locator('button:has-text("Save")').first().evaluate(el => el.click());
                await modalTitle.waitFor({ state: 'hidden', timeout: 15000 });
                console.log(`[WexAppsScraper] Task saved.`);
            });

            console.log(`[WexAppsScraper] Total run: ${Date.now() - _runStart}ms`);
            return {
                action: 'sent',
                searchTerm,
                appId: foundAppId,
                assignedTo: finalAssignedTo,
                taskStatus,
                priority,
                dueDate
            };

        } catch (err) {
            console.error(`[WexAppsScraper] Error:`, err.message);
            if (this.page && !this.page.isClosed()) {
                try { await this.page.screenshot({ path: `apps_error_${Date.now()}.png` }); } catch (_) {}
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

module.exports = WexAppsScraper;
