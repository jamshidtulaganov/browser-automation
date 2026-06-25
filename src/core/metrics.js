'use strict';

// Usage metrics + recent-runs log. Durable via the embedded file store when
// enabled (DATA_DIR / disk), otherwise in-memory (reset on restart). Powers
// /monitor and /metrics.

const store = require('./store');

const MAX_LOG = 300;
const startedAt = new Date().toISOString();

// in-memory fallback state
const counters = new Map();
const recent = [];

function recordMemory(name, ok, ms, error) {
    const c = counters.get(name) || { runs: 0, success: 0, failure: 0, totalMs: 0, lastMs: 0, lastAt: null, lastStatus: null };
    c.runs += 1;
    if (ok) c.success += 1; else c.failure += 1;
    c.totalMs += ms;
    c.lastMs = ms;
    c.lastAt = new Date().toISOString();
    c.lastStatus = ok ? 'ok' : 'error';
    counters.set(name, c);
    recent.unshift({ ts: c.lastAt, name, ok, ms, error: error ? String(error).slice(0, 300) : null });
    if (recent.length > MAX_LOG) recent.pop();
}

// Record a run. Updates the in-memory view and appends to the durable store.
// Never throws.
function record(name, ok, ms, error) {
    recordMemory(name, ok, ms, error);
    store.append({
        ts: new Date().toISOString(), name, ok, ms: Math.round(ms),
        error: error ? String(error).slice(0, 1000) : null,
    });
}

function aggregate(rows) {
    const map = new Map();
    for (const r of rows) {
        const c = map.get(r.name) || { name: r.name, runs: 0, success: 0, failure: 0, totalMs: 0, lastMs: 0, lastAt: null, lastStatus: null };
        c.runs += 1;
        if (r.ok) c.success += 1; else c.failure += 1;
        c.totalMs += (r.ms || 0);
        c.lastMs = r.ms || 0;                 // rows are in chronological order → last wins
        c.lastAt = r.ts;
        c.lastStatus = r.ok ? 'ok' : 'error';
        map.set(r.name, c);
    }
    const automations = [...map.values()].map(c => ({
        name: c.name, runs: c.runs, success: c.success, failure: c.failure,
        avgMs: c.runs ? Math.round(c.totalMs / c.runs) : 0,
        totalMs: c.totalMs,
        lastMs: c.lastMs, lastAt: c.lastAt, lastStatus: c.lastStatus,
    })).sort((a, b) => b.runs - a.runs);
    const totals = automations.reduce((t, a) => {
        t.runs += a.runs; t.success += a.success; t.failure += a.failure; return t;
    }, { runs: 0, success: 0, failure: 0 });
    return { automations, totals };
}

function snapshot() {
    const base = { startedAt, uptimeSec: Math.round(process.uptime()), now: new Date().toISOString(), durable: false };
    const rows = store.enabled() ? store.readAll() : null;
    if (rows) {
        const { automations, totals } = aggregate(rows);
        const rec = rows.slice(-MAX_LOG).reverse(); // newest-first
        return { ...base, durable: true, automations, totals, recent: rec };
    }
    // in-memory fallback — use counters directly (recent buffer is capped)
    const automations = [...counters.entries()].map(([name, c]) => ({
        name, runs: c.runs, success: c.success, failure: c.failure,
        avgMs: c.runs ? Math.round(c.totalMs / c.runs) : 0,
        totalMs: c.totalMs,
        lastMs: c.lastMs, lastAt: c.lastAt, lastStatus: c.lastStatus,
    })).sort((a, b) => b.runs - a.runs);
    const totals = automations.reduce((t, a) => {
        t.runs += a.runs; t.success += a.success; t.failure += a.failure; return t;
    }, { runs: 0, success: 0, failure: 0 });
    return { ...base, automations, totals, recent };
}

module.exports = { record, snapshot };
