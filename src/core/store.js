'use strict';

// Embedded, dependency-free metrics store: an append-only NDJSON file (one run
// per line). Lives in the project itself — no external DB service, no native
// build. Durable across restarts/redeploys when DATA_DIR points at a Render
// persistent disk; otherwise the file lives in the (ephemeral) container.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'runs.ndjson');
const MAX_LINES = 5000; // keep the file bounded

let ready = false;

function init() {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '');
        ready = true;
        trim();
        console.log(`[store] durable metrics at ${FILE}`);
    } catch (e) {
        ready = false;
        console.error('[store] disabled — metrics in-memory only:', e.message);
    }
}

function append(rec) {
    if (!ready) return;
    try { fs.appendFileSync(FILE, JSON.stringify(rec) + '\n'); }
    catch (e) { console.error('[store] append failed:', e.message); }
}

function readAll() {
    if (!ready) return null;
    try {
        return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean)
            .map(l => { try { return JSON.parse(l); } catch (_) { return null; } })
            .filter(Boolean);
    } catch (e) {
        console.error('[store] read failed:', e.message);
        return null;
    }
}

// Trim the file to the most recent MAX_LINES so it can't grow without bound.
function trim() {
    if (!ready) return;
    const all = readAll();
    if (all && all.length > MAX_LINES) {
        const keep = all.slice(-MAX_LINES);
        try { fs.writeFileSync(FILE, keep.map(r => JSON.stringify(r)).join('\n') + '\n'); }
        catch (e) { console.error('[store] trim failed:', e.message); }
    }
}

function enabled() { return ready; }

module.exports = { init, append, readAll, enabled };
