'use strict';

// Generic dispatch: list automations + run any by name.

const { Router } = require('express');
const { verifyApiKey } = require('../middleware/auth');
const registry = require('../registry');
const { HttpError } = require('../core/httpError');

const router = Router();

router.get('/automations', verifyApiKey, (req, res) => {
    res.json({ success: true, automations: registry.list() });
});

router.post('/run/:name', verifyApiKey, async (req, res, next) => {
    try {
        const automation = registry.get(req.params.name);
        if (!automation) throw new HttpError(404, `Unknown automation: ${req.params.name}`);
        const result = await automation.run(req.body || {});
        res.json({ success: true, automation: automation.name, ...result });
    } catch (e) { next(e); }
});

module.exports = router;
