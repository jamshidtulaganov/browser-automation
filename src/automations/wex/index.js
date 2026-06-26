'use strict';

// WEX automations. Each exposes { name, run(params) } and is self-contained
// (owns SF lookup + browser flow). Registered into the global registry.

const WexBocaScraper = require('./bocaScraper');
const WexReportScraper = require('./reportScraper');
const WexAppsScraper = require('./appsScraper');
const { resolveApplication, dueDateInPast } = require('./application');
const { badRequest } = require('../../core/httpError');

const boca = {
    name: 'wex.boca',
    description: 'Create a BOCA task on a WEX application (resolves SF record by appId).',
    async run(params = {}) {
        const appIdRaw = params.appId;
        const appId = appIdRaw != null
            ? String(appIdRaw).replace(/^Application-/i, '').replace(/\D/g, '')
            : '';
        if (!appId) throw badRequest('appId is required');
        if (dueDateInPast(params.dueDate)) throw badRequest('dueDate must not be in the past.');

        const rec = await resolveApplication(appId);
        if (!rec) return { appId, found: false, action: 'skipped' };

        const task = {
            assignedTo: params.assignedTo != null ? String(params.assignedTo) : rec.ownerName,
            status:     params.status   != null ? String(params.status)   : undefined,
            priority:   params.priority != null ? String(params.priority) : undefined,
            dueDate:    params.dueDate  != null ? String(params.dueDate)  : undefined,
        };
        console.log(`[wex.boca] app=${appId} sfId=${rec.sfRecordId} owner="${task.assignedTo}" status="${rec.sfStatus}"`);
        const result = await new WexBocaScraper().sendBoca(appId, rec.sfRecordId, rec.sfStatus, task);
        return { appId, found: true, status: rec.sfStatus, ...result };
    },
};

const report = {
    name: 'wex.report',
    description: 'Scrape the WEX "App Created — Today" Lightning report.',
    async run() {
        const records = await new WexReportScraper().run();
        return { count: records.length, records };
    },
};

const apps = {
    name: 'wex.apps',
    description: 'Search for WEX application by Company Name or App ID and submit a close task.',
    async run(params = {}) {
        const result = await new WexAppsScraper().closeApplication(params);
        return result;
    },
};

module.exports = [boca, report, apps];
