'use strict';

// Love's Shop Connect automations. `loves.token` mints the Auth0 ID token the Mytrion Ops
// Maintenance poller uses as its bearer (contract: mytrion-ops docs/LOVES_SHOP_CONNECT.md —
// `POST /loves/token` → { idToken, expiresAt }). The token lives ~24h and is cached in memory
// until five minutes before `exp`, so a poller asking every ten minutes costs one login a day.

const { withBrowser } = require('../../core/withBrowser');
const { HttpError } = require('../../core/httpError');
const { loginForIdToken, jwtExpiryMs } = require('./auth0Login');

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const FALLBACK_TTL_MS = 23 * 60 * 60 * 1000;

let cached = null; // { idToken, expiresAt }

const token = {
    name: 'loves.token',
    description: "Mint (or serve the cached) Auth0 ID token for Love's Shop Connect by driving the real login page.",
    async run(params = {}) {
        const login = process.env.LOVES_PORTAL_LOGIN;
        const password = process.env.LOVES_PORTAL_PASSWORD;
        if (!login || !password) {
            throw new HttpError(500, 'Service misconfigured: LOVES_PORTAL_LOGIN / LOVES_PORTAL_PASSWORD missing');
        }
        const now = Date.now();
        if (!params.force && cached && cached.expiresAt - REFRESH_MARGIN_MS > now) {
            return { idToken: cached.idToken, expiresAt: cached.expiresAt, cached: true };
        }
        const idToken = await withBrowser(({ page }) => loginForIdToken(page, login, password), { timeout: 60000 });
        const expiresAt = jwtExpiryMs(idToken) || now + FALLBACK_TTL_MS;
        cached = { idToken, expiresAt };
        console.log(`[loves.token] minted; expires ${new Date(expiresAt).toISOString()}`);
        return { idToken, expiresAt, cached: false };
    },
};

const automations = [token];
// Test seam: forget the cached token.
automations.clearLovesTokenCache = () => { cached = null; };

module.exports = automations;
