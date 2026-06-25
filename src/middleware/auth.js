'use strict';

// x-api-key guard. Rejects when API_KEY is unset (fail-closed) or the header
// does not match. Comparison is constant-time over SHA-256 digests so neither
// the key contents nor its length leak via response timing.

const crypto = require('crypto');

function keysMatch(given, expected) {
    const g = crypto.createHash('sha256').update(String(given || '')).digest();
    const e = crypto.createHash('sha256').update(String(expected)).digest();
    return crypto.timingSafeEqual(g, e);
}

function verifyApiKey(req, res, next) {
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
        console.error('[auth] API_KEY not configured — rejecting all requests');
        return res.status(500).json({ success: false, message: 'Service misconfigured: API_KEY missing' });
    }
    if (!keysMatch(req.get('x-api-key'), API_KEY)) {
        return res.status(401).json({ success: false, message: 'Invalid or missing x-api-key' });
    }
    next();
}

module.exports = { verifyApiKey };
