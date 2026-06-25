'use strict';

// Optional Postgres pool for durable metrics. When DATABASE_URL is unset the
// pool is null and metrics fall back to in-memory (local dev / no DB).

let pool = null;

// TLS strategy (avoid disabling verification — that allows MITM):
//   PGSSL=disable               → no TLS. Use this with Render's INTERNAL Database
//                                 URL: traffic stays on Render's private network.
//   DATABASE_CA_CERT=<pem>      → verified TLS against the provided CA (use this
//                                 with an EXTERNAL URL). Render lets you download
//                                 the CA cert for your database.
//   neither                     → verified TLS using the system trust store.
function sslConfig() {
    if (process.env.PGSSL === 'disable') return false;
    if (process.env.DATABASE_CA_CERT) return { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true };
    return { rejectUnauthorized: true };
}

if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: sslConfig(),
        max: 5,
    });
    pool.on('error', (err) => console.error('[db] pool error:', err.message));
}

async function init() {
    if (!pool) {
        console.log('[db] DATABASE_URL not set — metrics are in-memory (reset on restart).');
        return;
    }
    await pool.query(`
        CREATE TABLE IF NOT EXISTS automation_runs (
            id    BIGSERIAL PRIMARY KEY,
            name  TEXT NOT NULL,
            ok    BOOLEAN NOT NULL,
            ms    INTEGER NOT NULL,
            error TEXT,
            ts    TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_runs_ts   ON automation_runs (ts DESC);
        CREATE INDEX IF NOT EXISTS idx_runs_name ON automation_runs (name);
    `);
    console.log('[db] Postgres connected — metrics are durable.');
}

module.exports = { pool: () => pool, init };
