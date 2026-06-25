'use strict';

// In-memory usage metrics + a recent-runs log ring buffer. Powers the /monitor
// page and /metrics endpoint. Resets on restart/redeploy (the container is
// ephemeral); for durable history, back this with a DB later.

const MAX_LOG = 300;
const startedAt = new Date().toISOString();

const counters = new Map(); // name → { runs, success, failure, totalMs, lastMs, lastAt, lastStatus }
const recent = [];          // newest-first ring buffer of { ts, name, ok, ms, error }

function record(name, ok, ms, error) {
    const c = counters.get(name) || {
        runs: 0, success: 0, failure: 0, totalMs: 0, lastMs: 0, lastAt: null, lastStatus: null,
    };
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

function snapshot() {
    const automations = [...counters.entries()].map(([name, c]) => ({
        name,
        runs: c.runs,
        success: c.success,
        failure: c.failure,
        avgMs: c.runs ? Math.round(c.totalMs / c.runs) : 0,
        lastMs: c.lastMs,
        lastAt: c.lastAt,
        lastStatus: c.lastStatus,
    })).sort((a, b) => b.runs - a.runs);

    const totals = automations.reduce((t, a) => {
        t.runs += a.runs; t.success += a.success; t.failure += a.failure; return t;
    }, { runs: 0, success: 0, failure: 0 });

    return {
        startedAt,
        uptimeSec: Math.round(process.uptime()),
        now: new Date().toISOString(),
        totals,
        automations,
        recent,
    };
}

module.exports = { record, snapshot };
