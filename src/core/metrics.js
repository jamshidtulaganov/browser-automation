'use strict';

// Usage metrics + recent-runs log. Durable when Postgres is configured
// (DATABASE_URL) — otherwise in-memory (reset on restart). Powers /monitor
// and /metrics.

const { pool } = require('./db');

const MAX_LOG = 300;
const startedAt = new Date().toISOString();

// ── in-memory fallback state ──
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

// Record a run. Always updates the in-memory view; also persists to Postgres
// (fire-and-forget) when configured. Never throws.
function record(name, ok, ms, error) {
    recordMemory(name, ok, ms, error);
    const p = pool();
    if (p) {
        p.query(
            'INSERT INTO automation_runs (name, ok, ms, error) VALUES ($1,$2,$3,$4)',
            [name, ok, Math.round(ms), error ? String(error).slice(0, 1000) : null],
        ).catch((e) => console.error('[metrics] insert failed:', e.message));
    }
}

function memorySnapshot() {
    const automations = [...counters.entries()].map(([name, c]) => ({
        name, runs: c.runs, success: c.success, failure: c.failure,
        avgMs: c.runs ? Math.round(c.totalMs / c.runs) : 0,
        lastMs: c.lastMs, lastAt: c.lastAt, lastStatus: c.lastStatus,
    })).sort((a, b) => b.runs - a.runs);
    const totals = automations.reduce((t, a) => {
        t.runs += a.runs; t.success += a.success; t.failure += a.failure; return t;
    }, { runs: 0, success: 0, failure: 0 });
    return { automations, totals, recent };
}

async function dbSnapshot(p) {
    const agg = await p.query(`
        SELECT name,
               count(*)::int                                  AS runs,
               count(*) FILTER (WHERE ok)::int                AS success,
               count(*) FILTER (WHERE NOT ok)::int            AS failure,
               COALESCE(round(avg(ms)),0)::int                AS "avgMs"
        FROM automation_runs GROUP BY name`);
    const last = await p.query(`
        SELECT DISTINCT ON (name) name, ms AS "lastMs", ts AS "lastAt",
               (CASE WHEN ok THEN 'ok' ELSE 'error' END) AS "lastStatus"
        FROM automation_runs ORDER BY name, ts DESC`);
    const lastByName = new Map(last.rows.map(r => [r.name, r]));
    const automations = agg.rows.map(r => ({ ...r, ...(lastByName.get(r.name) || {}) }))
        .sort((a, b) => b.runs - a.runs);
    const totals = automations.reduce((t, a) => {
        t.runs += a.runs; t.success += a.success; t.failure += a.failure; return t;
    }, { runs: 0, success: 0, failure: 0 });
    const rec = await p.query(`
        SELECT name, ok, ms, error, ts FROM automation_runs ORDER BY ts DESC LIMIT ${MAX_LOG}`);
    return { automations, totals, recent: rec.rows };
}

async function snapshot() {
    const base = { startedAt, uptimeSec: Math.round(process.uptime()), now: new Date().toISOString(), durable: false };
    const p = pool();
    if (p) {
        try { return { ...base, durable: true, ...(await dbSnapshot(p)) }; }
        catch (e) { console.error('[metrics] snapshot query failed, using memory:', e.message); }
    }
    return { ...base, ...memorySnapshot() };
}

module.exports = { record, snapshot };
