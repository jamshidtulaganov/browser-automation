'use strict';

// Generic dispatch: list automations + run any by name.

const { Router } = require('express');
const { verifyApiKey } = require('../middleware/auth');
const registry = require('../registry');

const router = Router();

router.get('/automations', verifyApiKey, (req, res) => {
    res.json({ success: true, automations: registry.list() });
});

router.post('/run/:name', verifyApiKey, async (req, res, next) => {
    try {
        const result = await registry.runAutomation(req.params.name, req.body || {});
        res.json({ success: true, automation: req.params.name, ...result });
    } catch (e) { next(e); }
});

module.exports = router;
