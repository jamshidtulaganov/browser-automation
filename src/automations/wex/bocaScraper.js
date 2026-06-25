'use strict';

// C-27: BOCA Link Request scraper.
// Logs into WEX Community (Salesforce), navigates to the application detail page,
// clicks "New Task", fills the task fields, and saves.
// No SF-status gate: always runs regardless of app status.
// Subject + Comments are fixed ("BOCA" / "Please send BOCA").
// Assigned To = Application Owner (passed by caller from SF Owner.Name).

const { BaseScraper } = require('../../core/BaseScraper');

const TASK_DEFAULTS = {
    subject:    'BOCA',
    comments:   'Please send BOCA',
    taskStatus: 'Not Started',
    priority:   'Normal',
};

class WexBocaScraper extends BaseScraper {
    constructor() {
        super();
        this.BASE_URL  = 'https://wexinc.my.site.com';
        this.LOGIN_URL = 'https://wexinc.my.site.com/communities/login';
        this.USERNAME  = process.env.WEX_USERNAME_SCRAPER;
        this.PASSWORD  = process.env.WEX_PASSWORD_SCRAPER;
    }

    // Browser launch/connect (local Chromium vs Browserless) lives in core/browser.js,
    // so BaseScraper.init() is used as-is — no override needed here.

    /**
     * Send a task on the WEX application page.
     * No gate on sfStatus — caller decides when to invoke.
     *
     * @param {string} appId      - Numeric WEX application ID (e.g. "889840")
     * @param {string} sfRecordId - Salesforce record ID (e.g. "a3PVP000003QH6j2AG")
     * @param {string} sfStatus   - Current SF Status__c (passed through to return value; no gate)
     * @param {{
     *   assignedTo?: string,  // Application Owner name (from SF Owner.Name) — required; no fallback default
     *   status?:     string,  // New Task Status field, default: "Not Started" (guarded — absent in std modal)
     *   priority?:   string,  // New Task Priority field, default: "Normal" (None/High/Normal/Low; guarded)
     *   dueDate?:    string,  // Due Date in MM/DD/YYYY or ISO YYYY-MM-DD; omit to leave blank
     * }} [task]
     * @returns {{ action:'sent', appId, status, comments, assignedTo, taskStatus, priority, dueDate }}
     */
    async sendBoca(appId, sfRecordId, sfStatus, task = {}) {
        const assignedTo = task.assignedTo != null ? String(task.assignedTo) : null;
        const taskStatus = task.status     != null ? String(task.status)     : TASK_DEFAULTS.taskStatus;
        const priority   = task.priority   != null ? String(task.priority)   : TASK_DEFAULTS.priority;
        const subject    = TASK_DEFAULTS.subject;    // fixed: 'BOCA'
        const dueDate    = task.dueDate    != null ? normalizeDueDate(task.dueDate) : '';
        const comments   = TASK_DEFAULTS.comments;   // fixed: 'Please send BOCA'

        // Step-scoped error helper: wraps a step fn; on failure adds [step] prefix + screenshot
        const step = async (name, fn) => {
            try {
                await fn();
            } catch (err) {
                const msg = `[${name}] failed: ${err.message}`;
                console.error(`[WexBocaScraper] ${msg}`);
                if (this.page && !this.page.isClosed()) {
                    try { await this.page.screenshot({ path: `boca_error_${appId}_${name.replace(/\s+/g,'_')}_${Date.now()}.png` }); } catch (_) {}
                }
                throw new Error(msg);
            }
        };

        // Aura uiInput helper: JS-focus hidden input, pressSequentially per char, read-back verify.
        // Aura search handler fires on keyup — fill() is paste, Aura ignores it.
        // Retry once if inputValue() empty after first type (focuses again and retypes).
        const auraType = async (locator, value, label) => {
            await locator.waitFor({ state: 'attached', timeout: 10000 });
            for (let attempt = 1; attempt <= 2; attempt++) {
                await locator.evaluate(el => el.focus());
                await this.page.waitForTimeout(100);
                // Clear any existing value first
                await locator.evaluate(el => { el.value = ''; });
                await locator.pressSequentially(value, { delay: 80 });
                await this.page.waitForTimeout(150);
                const typed = await locator.inputValue().catch(() => '');
                if (typed.trim().length > 0) break;
                if (attempt === 2) console.warn(`[WexBocaScraper] ${label}: inputValue empty after 2 attempts — proceeding`);
                await this.page.waitForTimeout(200);
            }
        };

        const _runStart = Date.now();
        await this.init();
        try {
            // ── 1. Login ──────────────────────────────────────────────────────
            await step('login', async () => {
                console.log(`[WexBocaScraper] Logging in for app ${appId}...`);
                await this.page.goto(this.LOGIN_URL, { waitUntil: 'domcontentloaded' });
                await this.page.locator('#username').fill(this.USERNAME);
                await this.page.locator('#password').fill(this.PASSWORD);
                await this.page.locator('#Login').click();
                // Wait for the authenticated community app to load. WEX redirects
                // login → (CommunitiesLanding) → /communities/s/ ; wait for that final
                // URL, THEN for a real authenticated landmark. The old selectors
                // (.slds-global-header / #content / .communityApp) no longer exist on
                // the current Aura community and always timed out even on success.
                await this.page.waitForURL('**/communities/s/**', { timeout: 45000 });
                await this.page.waitForSelector('.forceCommunityGlobalNavigation, .siteforceContentArea', { timeout: 30000 });
            });

            // ── 2. Navigate to app detail page ────────────────────────────────
            await step('navigate', async () => {
                const appUrl = `${this.BASE_URL}/communities/s/onlineapplication/${sfRecordId}/application${appId}`;
                console.log(`[WexBocaScraper] Navigating to ${appUrl}`);
                await this.page.goto(appUrl, { waitUntil: 'domcontentloaded' });
                // Wait for app page to render (New Task button or page header)
                await this.page.waitForSelector('button:has-text("New Task"), .slds-page-header', { timeout: 30000 });
            });

            // ── 3. Open New Task modal ─────────────────────────────────────────
            let modal, modalTitle;
            await step('open-modal', async () => {
                console.log('[WexBocaScraper] Clicking New Task...');
                const newTaskBtn = this.page.locator('button:has-text("New Task")').first();
                await newTaskBtn.waitFor({ state: 'visible', timeout: 20000 });
                await newTaskBtn.click();

                // FIX D1: Aura spawns two dialogs; filter to the real one by heading
                modalTitle = this.page.locator('h2:has-text("New Task"), h1:has-text("New Task")').first();
                await modalTitle.waitFor({ state: 'visible', timeout: 15000 });

                modal = this.page.locator('div[role="dialog"]').filter({
                    has: this.page.locator('h1:has-text("New Task"), h2:has-text("New Task")')
                });

                // FIX D2: fields render 8-10s after title visible
                console.log('[WexBocaScraper] Waiting for form fields...');
                await modal.locator('label:has-text("Assigned To")').first().waitFor({ state: 'visible', timeout: 20000 });
                console.log('[WexBocaScraper] Modal ready.');
            });

            // ── 5. Assigned To (Aura people-lookup) ───────────────────────────
            // Aura people-lookup options render in a DOM PORTAL outside the modal.
            // "div[role=listbox] [role=option]" scoped to modal NEVER matches.
            // Must query page-level with Aura/SLDS container selectors.
            //
            // Known Aura Community portal patterns (tried in order):
            //   1. ul.lookup__list li a                 — classic Aura uiInputLookup
            //   2. .lookup__menu [role="option"]        — SLDS lookup menu variant
            //   3. div.uiAutocompleteList [role="option"] — uiAutocomplete overlay
            //   4. div.uiAutocompleteList li a          — uiAutocomplete no-role variant
            //   5. lightning-base-combobox-item         — Lightning base combobox
            //   6. .slds-listbox_dropdown [role="option"] — SLDS combobox portal
            //   7. [role="listbox"] [role="option"]     — broadest fallback (page-wide)
            if (assignedTo) {
                await step('assigned-to', async () => {
                    // The New Task modal PRE-SELECTS the task's team owner — for BOCA
                    // that is already "TSS Fuel Team", shown as a pill. While a pill is
                    // selected the "Search People..." input is hidden, so re-typing
                    // fails (this was the 10s-timeout bug). If the pill already matches
                    // the desired assignee, KEEP it and skip. Scope everything to the
                    // OwnerId field so we never disturb the "Related To" lookup.
                    const ownerField = modal.locator('[data-target-selection-name="sfdc:RecordField.Task.OwnerId"]').first();

                    const currentPill = ownerField
                        .locator('.slds-pill, lightning-pill, a.pillText, span.pillText')
                        .filter({ hasText: assignedTo }).first();
                    if (await currentPill.count() > 0) {
                        console.log(`[WexBocaScraper] Assigned To already "${assignedTo}" — keeping pre-selected pill (no re-entry needed).`);
                        return;
                    }

                    // Remove the pre-filled pill (default "TSS Fuel Team") so the search input
                    // becomes visible. Live-confirmed remove = a.deleteAction; SLDS variants as
                    // fallback. On Render the modal fields render slowly, so a single remove-click
                    // can land before the pill exists or before Aura re-renders the input — leaving
                    // the input hidden (the 8s timeout). Poll up to 20s: each round, if the input is
                    // already visible we're done, else click whatever remove control is present.
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
                    for (let i = 0; i < 40; i++) {            // 40 × 500ms = 20s
                        if (await ownerInputVisible()) { inputReady = true; break; }
                        for (const sel of REMOVE_SELS) {
                            const rm = ownerField.locator(sel).first();
                            if (await rm.count() > 0) {
                                await rm.click({ force: true }).catch(() => {});
                                await rm.evaluate(el => el.click()).catch(() => {});
                                if (i === 0) console.log(`[WexBocaScraper] Removing pre-filled pill via ${sel}`);
                                break;
                            }
                        }
                        await this.page.waitForTimeout(500);
                    }
                    if (!inputReady) {
                        throw new Error('[assigned-to] "Search People..." input never became visible — pill removal failed (pre-selected owner still locked)');
                    }

                    // Diagnostic: confirm pill gone + input visible
                    try {
                        const postRemove = await this.page.evaluate(() => {
                            const f   = document.querySelector('[data-target-selection-name="sfdc:RecordField.Task.OwnerId"]');
                            const inp = f?.querySelector('input[placeholder="Search People..."]');
                            const pll = f?.querySelector('.slds-pill, a.pillText');
                            return `input:${inp ? `exists,offsetParent=${inp.offsetParent ? 'set' : 'null'}` : 'MISSING'} | pill:${pll ? `"${pll.textContent?.trim()}"` : 'none'}`;
                        });
                        console.log(`[WexBocaScraper] Post-remove: ${postRemove}`);
                    } catch (_) {}

                    // Focus the INPUT itself — container click opens MRU but doesn't focus input;
                    // typing into an unfocused element goes to void, leaving input.value empty.
                    const lookupInput = ownerField.locator('input[placeholder="Search People..."]').first();
                    await lookupInput.click({ force: true }).catch(() => {});
                    // Verify focus landed on input before typing
                    const focused = await this.page.evaluate(() => {
                        const f   = document.querySelector('[data-target-selection-name="sfdc:RecordField.Task.OwnerId"]');
                        const inp = f?.querySelector('input[placeholder="Search People..."]');
                        return !!(inp && document.activeElement === inp);
                    }).catch(() => false);
                    if (!focused) {
                        console.warn('[WexBocaScraper] Input not activeElement after click — applying JS focus');
                        await lookupInput.evaluate(el => el.focus()).catch(() => {});
                    }
                    await this.page.waitForTimeout(100);

                    await auraType(lookupInput, assignedTo, 'Assigned To');

                    // Diagnostic: confirm type registered (input.value non-empty + search fired)
                    try {
                        const postType = await this.page.evaluate(() => {
                            const f   = document.querySelector('[data-target-selection-name="sfdc:RecordField.Task.OwnerId"]');
                            const inp = f?.querySelector('input[placeholder="Search People..."]');
                            return `value="${inp?.value}" aria-expanded="${inp?.getAttribute('aria-expanded')}"`;
                        });
                        console.log(`[WexBocaScraper] Post-type: ${postType}`);
                    } catch (_) {}

                    // Wait for person results in the lookup portal. The Aura people-search
                    // round-trips to Salesforce; from a remote/datacenter host (Browserless on
                    // Render) that round-trip is markedly slower than locally, so 5s was too
                    // short — the dropdown still held only the "Search in People" header
                    // (a div[role="option"], NOT an a[role="option"]) → zero person results →
                    // false "no option" failure. Poll up to 20s and re-type once midway in
                    // case the first keystrokes didn't trigger Aura's keyup search handler.
                    const hasOptions = () => this.page
                        .evaluate(() => !!document.querySelector('a[role="option"] .primaryLabel'))
                        .catch(() => false);
                    let optsReady = false;
                    for (let i = 0; i < 40; i++) {            // 40 × 500ms = 20s
                        if (await hasOptions()) { optsReady = true; break; }
                        if (i === 14) {                       // ~7s in: re-fire the search
                            console.warn('[WexBocaScraper] No options after ~7s — re-typing search term');
                            await lookupInput.evaluate(el => el.focus()).catch(() => {});
                            await auraType(lookupInput, assignedTo, 'Assigned To (retry)');
                        }
                        await this.page.waitForTimeout(500);
                    }
                    if (!optsReady) console.warn('[WexBocaScraper] Options still absent after 20s — attempting click anyway');

                    // Click option by title/text match via single JS evaluate (no double-fire race).
                    // Confirmed live markup: a[role="option"] > .primaryLabel[title="<name>"]
                    const optionClicked = await this.page.evaluate((name) => {
                        const labels = document.querySelectorAll('a[role="option"] .primaryLabel');
                        for (const lbl of labels) {
                            if ((lbl.getAttribute('title') || lbl.textContent?.trim()) === name) {
                                const anchor = lbl.closest('a[role="option"]');
                                if (anchor) { anchor.click(); return `exact:${name}`; }
                            }
                        }
                        // fallback: first option
                        const first = document.querySelector('a[role="option"]');
                        const label = first?.querySelector('.primaryLabel')?.getAttribute('title') || first?.textContent?.trim() || '?';
                        if (first) { first.click(); return `first:${label}`; }
                        return null;
                    }, assignedTo).catch(() => null);

                    if (!optionClicked) {
                        throw new Error(`Assigned To "${assignedTo}": no a[role="option"] in DOM after search`);
                    }
                    console.log(`[WexBocaScraper] Option selected: ${optionClicked}`);
                    // Wait for pill to render after selection (replaces fixed sleep)
                    await this.page.waitForSelector(
                        '[data-target-selection-name="sfdc:RecordField.Task.OwnerId"] .slds-pill',
                        { state: 'attached', timeout: 5000 }
                    ).catch(() => {});

                    // ASSERT pill changed — throw on mismatch so we don't save with wrong owner
                    const pill = ownerField.locator('.slds-pill, lightning-pill, a.pillText, span.pillText').first();
                    const pillText = (await pill.textContent().catch(() => '')).trim();
                    if (!pillText) {
                        throw new Error(`[assigned-to] pill not set after option click — selection did not take (default TSS Fuel Team likely still selected)`);
                    }
                    if (!pillText.includes(assignedTo) && !assignedTo.includes(pillText)) {
                        throw new Error(`[assigned-to] pill mismatch: want "${assignedTo}" got "${pillText}"`);
                    }
                    console.log(`[WexBocaScraper] Assigned To verified: "${pillText}"`);
                });
            }

            // ── 6. Due Date ───────────────────────────────────────────────────
            if (dueDate) {
                await step('due-date', async () => {
                    const dueDateInput = modal.locator('label:has-text("Due Date") ~ div input').first();
                    await dueDateInput.waitFor({ state: 'visible', timeout: 5000 });
                    await dueDateInput.fill(dueDate);
                    await dueDateInput.press('Tab');
                }).catch(() => { /* field may be absent */ });
            }

            // ── 7. Subject — GUARDED ─────────────────────────────────────────
            // FIX R1: switch to auraType (pressSequentially) in case Subject is Aura uiInput
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
            }).catch(() => { /* Subject optional */ });

            // ── 9. Status — GUARDED ───────────────────────────────────────────
            await step('status', async () => {
                const statusLabelCount = await modal.locator('label:has-text("Status")').count();
                if (statusLabelCount === 0) return;
                const taskStatusTrigger = modal.locator('label:has-text("Status") ~ div button').first();
                await taskStatusTrigger.click();
                await this.page.waitForSelector('div[role="listbox"]', { timeout: 3000 }).catch(() => {});
                await this.page.locator(`div[role="listbox"] span[title="${taskStatus}"], div[role="listbox"] span:has-text("${taskStatus}")`).first().click();
            }).catch(() => { /* Status field absent in std modal */ });

            // ── 10. Priority — GUARDED ───────────────────────────────────────
            await step('priority', async () => {
                const priorityLabelCount = await modal.locator('label:has-text("Priority")').count();
                if (priorityLabelCount === 0) return;
                const priorityTrigger = modal.locator('label:has-text("Priority") ~ div button').first();
                await priorityTrigger.click();
                await this.page.waitForSelector('div[role="listbox"]', { timeout: 3000 }).catch(() => {});
                await this.page.locator(`div[role="listbox"] span[title="${priority}"], div[role="listbox"] span:has-text("${priority}")`).first().click();
            }).catch(() => { /* Priority absent in std modal */ });

            // ── 11. Comments ─────────────────────────────────────────────────
            // FIX R1: textarea may be Aura uiInput — use pressSequentially + read-back.
            // click() first to fire Aura focus binding, then auraType handles the rest.
            await step('comments', async () => {
                const commentsLabelCount = await modal.locator('label:has-text("Comments")').count();
                const commentsArea = commentsLabelCount > 0
                    ? modal.locator('label:has-text("Comments") ~ div textarea').first()
                    : modal.locator('textarea').first();

                // Comments is an Aura uiInput "supportInputTextArea". Typing alone makes
                // the textarea SHOW the text (and read-back returns it), but Aura only
                // persists its value model on input/change/blur — without firing those the
                // task saves with an EMPTY Comments. So after typing we dispatch
                // input+change and blur to force Aura to commit before Save.
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
                if (!filled || !filled.includes('BOCA')) {
                    console.warn('[WexBocaScraper] Comments read-back empty — retrying with slower type');
                    filled = await typeAndCommit(60);
                }
                if (!filled || !filled.includes('BOCA')) {
                    throw new Error('[comments] empty after fill — value not committed to textarea');
                }
                console.log(`[WexBocaScraper] Comments set: "${filled}"`);
            });

            // ── 12. Save ──────────────────────────────────────────────────────
            await step('save', async () => {
                console.log('[WexBocaScraper] Saving task...');
                await modal.locator('button:has-text("Save")').first().evaluate(el => el.click());
                await modalTitle.waitFor({ state: 'hidden', timeout: 15000 });
                console.log(`[WexBocaScraper] Task saved for app ${appId}.`);
            });

            console.log(`[WexBocaScraper] Total run: ${Date.now() - _runStart}ms`);
            return { action: 'sent', appId, status: sfStatus, comments, assignedTo, taskStatus, priority, dueDate };

        } catch (err) {
            console.error(`[WexBocaScraper] Error on app ${appId}:`, err.message);
            if (this.page && !this.page.isClosed()) {
                try { await this.page.screenshot({ path: `boca_error_${appId}_${Date.now()}.png` }); } catch (_) {}
            }
            throw err;
        } finally {
            await this.cleanup();
        }
    }
}

/**
 * Normalize a due-date string to MM/DD/YYYY for Salesforce.
 * Accepts ISO YYYY-MM-DD; passes through anything else as-is.
 */
function normalizeDueDate(d) {
    const s = String(d).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[2]}/${m[3]}/${m[1]}` : s;
}

module.exports = WexBocaScraper;
