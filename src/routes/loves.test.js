'use strict';

// Tests for the Love's token route. The registry is mocked — no browser is launched.

const request = require('supertest');
const app = require('../app');

jest.mock('../registry', () => ({
    runAutomation: jest.fn(),
}));

const registry = require('../registry');
const { HttpError } = require('../core/httpError');

describe('POST /loves/token', () => {
    const TEST_API_KEY = 'test-api-key-12345';

    beforeAll(() => {
        process.env.API_KEY = TEST_API_KEY;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 401 when the API key is missing or wrong', async () => {
        expect((await request(app).post('/loves/token').send({})).status).toBe(401);
        expect((await request(app).post('/loves/token').set('x-api-key', 'wrong').send({})).status).toBe(401);
        expect(registry.runAutomation).not.toHaveBeenCalled();
    });

    it('answers the minter contract: idToken + expiresAt, and passes `force` through', async () => {
        registry.runAutomation.mockResolvedValue({ idToken: 'eyJ.abc.def', expiresAt: 1790000000000, cached: false });

        const res = await request(app)
            .post('/loves/token')
            .set('x-api-key', TEST_API_KEY)
            .send({ force: true });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, idToken: 'eyJ.abc.def', expiresAt: 1790000000000, cached: false });
        expect(registry.runAutomation).toHaveBeenCalledWith('loves.token', { force: true });
    });

    it('a failed login is a 502 with no detail leaked to the caller', async () => {
        registry.runAutomation.mockRejectedValue(new HttpError(502, "Love's login did not produce a token (login refused: Wrong email or password)"));

        const res = await request(app)
            .post('/loves/token')
            .set('x-api-key', TEST_API_KEY)
            .send({});

        expect(res.status).toBe(502);
        expect(res.body).toEqual({ success: false, message: 'internal error' });
    });
});
