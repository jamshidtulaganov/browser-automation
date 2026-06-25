'use strict';

// Generic polling helper for slow-rendering SPAs (Aura/Lightning, etc.).
// Returns true as soon as predicate() is truthy, false on timeout.

/**
 * @param {import('playwright').Page} page
 * @param {(i:number)=>Promise<boolean>|boolean} predicate
 * @param {{timeoutMs?:number, intervalMs?:number, onTick?:(i:number)=>Promise<void>|void}} [opts]
 */
async function pollUntil(page, predicate, opts = {}) {
    const timeoutMs = opts.timeoutMs || 20000;
    const intervalMs = opts.intervalMs || 500;
    const tries = Math.max(1, Math.ceil(timeoutMs / intervalMs));
    for (let i = 0; i < tries; i++) {
        if (await predicate(i)) return true;
        if (opts.onTick) await opts.onTick(i);
        await page.waitForTimeout(intervalMs);
    }
    return false;
}

module.exports = { pollUntil };
