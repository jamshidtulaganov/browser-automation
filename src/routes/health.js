'use strict';

const { Router } = require('express');

const router = Router();
router.get('/health', (req, res) => res.json({ ok: true, service: 'browser-automation' }));
router.get('/', (req, res) => res.json({ service: 'browser-automation', status: 'up' }));

module.exports = router;
