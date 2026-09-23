'use strict';

// Love's Shop Connect routes (thin — delegate to the registry's loves.* automations).

const { Router } = require('express');
const { verifyApiKey } = require('../middleware/auth');
const registry = require('../registry');

const router = Router();

// The Mytrion Ops Maintenance poller's token minter. Body: { force?: true } skips the cache.
router.post('/loves/token', verifyApiKey, async (req, res, next) => {
    try {
        const result = await registry.runAutomation('loves.token', req.body || {});
        res.json({ success: true, ...result });
    } catch (e) { next(e); }
});

module.exports = router;
