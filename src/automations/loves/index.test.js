'use strict';

// The loves.token automation with the browser mocked: the misconfiguration guard, the cache
// (one login a day, not one per poll), `force`, and the JWT expiry read.

jest.mock('../../core/withBrowser', () => ({ withBrowser: jest.fn() }));

const { withBrowser } = require('../../core/withBrowser');
const { jwtExpiryMs } = require('./auth0Login');

function fakeJwt(expSeconds) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${b64({ alg: 'RS256' })}.${b64({ exp: expSeconds, iss: 'https://example.auth0.com/' })}.sig`;
}

describe('loves.token', () => {
    let automations;
    let token;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.LOVES_PORTAL_LOGIN = 'fleet';
        process.env.LOVES_PORTAL_PASSWORD = 'secret';
        automations = require('./index');
        automations.clearLovesTokenCache();
        token = automations.find((a) => a.name === 'loves.token');
    });

    afterEach(() => {
        delete process.env.LOVES_PORTAL_LOGIN;
        delete process.env.LOVES_PORTAL_PASSWORD;
    });

    it('refuses to run without the portal credentials, and never opens a browser', async () => {
        delete process.env.LOVES_PORTAL_PASSWORD;
        await expect(token.run()).rejects.toMatchObject({ status: 500 });
        expect(withBrowser).not.toHaveBeenCalled();
    });

    it('mints once, then serves the cached token until it nears expiry; `force` mints again', async () => {
        const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
        withBrowser.mockResolvedValue(fakeJwt(exp));

        const first = await token.run();
        expect(first).toEqual({ idToken: fakeJwt(exp), expiresAt: exp * 1000, cached: false });
        expect(withBrowser).toHaveBeenCalledTimes(1);

        const second = await token.run();
        expect(second).toEqual({ ...first, cached: true });
        expect(withBrowser).toHaveBeenCalledTimes(1);

        const forced = await token.run({ force: true });
        expect(forced.cached).toBe(false);
        expect(withBrowser).toHaveBeenCalledTimes(2);
    });

    it('a token within five minutes of expiry is minted afresh, not served', async () => {
        const soon = Math.floor(Date.now() / 1000) + 120;
        withBrowser.mockResolvedValue(fakeJwt(soon));
        await token.run();
        await token.run();
        expect(withBrowser).toHaveBeenCalledTimes(2);
    });

    it('reads exp off the JWT, and answers null for anything that is not one', () => {
        expect(jwtExpiryMs(fakeJwt(1790000000))).toBe(1790000000000);
        expect(jwtExpiryMs('not-a-jwt')).toBeNull();
        expect(jwtExpiryMs('a.b.c')).toBeNull();
    });
});
