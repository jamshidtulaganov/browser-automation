'use strict';

// Explicit WEX routes (thin — delegate to the registry's wex.* automations).

const { Router } = require('express');
const { verifyApiKey } = require('../middleware/auth');
const registry = require('../registry');

const router = Router();

async function runBoca(req, res, next) {
    try {
        const body = req.body || {};
        const params = { ...body, appId: req.params.appId != null ? req.params.appId : body.appId };
        const result = await registry.runAutomation('wex.boca', params);
        res.json({ success: true, ...result });
    } catch (e) { next(e); }
}

router.post('/wex/boca', verifyApiKey, runBoca);
router.post('/wex/boca/:appId', verifyApiKey, runBoca);

router.post('/wex/report', verifyApiKey, async (req, res, next) => {
    try {
        const result = await registry.runAutomation('wex.report', {});
        res.json({ success: true, ...result });
    } catch (e) { next(e); }
});

module.exports = router;
