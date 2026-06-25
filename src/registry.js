'use strict';

// Central automation registry. Add a new site/op = add its module to the list.
// Each automation is { name, description?, run(params) }.

const wex = require('./automations/wex');
const common = require('./automations/common');

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

module.exports = { get, list };
