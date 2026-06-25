'use strict';

// Central automation registry. Add a new site/op = add its module to the list.
// Each automation is { name, description?, run(params) }.

const wex = require('./automations/wex');
const common = require('./automations/common');
const metrics = require('./core/metrics');
const { HttpError } = require('./core/httpError');

const all = [...wex, ...common];

const byName = new Map();
for (const a of all) {
    if (byName.has(a.name)) throw new Error(`Duplicate automation name: ${a.name}`);
    byName.set(a.name, a);
}

function get(name) {
    return byName.get(name) || null;
}

function list() {
    return all.map(a => ({ name: a.name, description: a.description || '' }));
}

// Single entry point so every run is timed and counted (powers /monitor).
async function runAutomation(name, params) {
    const automation = byName.get(name);
    if (!automation) throw new HttpError(404, `Unknown automation: ${name}`);
    const t0 = Date.now();
    try {
        const result = await automation.run(params || {});
        metrics.record(name, true, Date.now() - t0, null);
        return result;
    } catch (err) {
        metrics.record(name, false, Date.now() - t0, err && err.message ? err.message : String(err));
        throw err;
    }
}

module.exports = { get, list, runAutomation };
