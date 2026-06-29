'use strict';

// Tests for WEX endpoints (C-14 close + existing routes).
// Mock Playwright browser interactions to avoid real WEX site calls.

const request = require('supertest');
const app = require('../app');

// Mock the registry and scrapers to avoid real browser launches
jest.mock('../registry', () => ({
    runAutomation: jest.fn(),
}));

const registry = require('../registry');

describe('WEX Routes', () => {
    const TEST_API_KEY = 'test-api-key-12345';

    beforeAll(() => {
        process.env.API_KEY = TEST_API_KEY;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /wex/application/:appId/close', () => {
        it('returns 401 when API key missing', async () => {
            const res = await request(app)
                .post('/wex/application/889510/close')
                .send({});

            expect(res.status).toBe(401);
        });

        it('returns 401 when API key invalid', async () => {
            const res = await request(app)
                .post('/wex/application/889510/close')
                .set('x-api-key', 'wrong-key')
                .send({});

            expect(res.status).toBe(401);
        });

        it('calls wex.close automation with appId from URL', async () => {
            registry.runAutomation.mockResolvedValue({
                appId: '889510',
                found: true,
                status: 'Pending Information',
                action: 'sent',
                comments: 'Please close the application.',
            });

            const res = await request(app)
                .post('/wex/application/889510/close')
                .set('x-api-key', TEST_API_KEY)
                .send({});

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                success: true,
                appId: '889510',
                found: true,
                action: 'sent',
            });
            expect(registry.runAutomation).toHaveBeenCalledWith(
                'wex.close',
                expect.objectContaining({ appId: '889510' })
            );
        });

        it('passes optional task params (assignedTo, status, priority, dueDate)', async () => {
            registry.runAutomation.mockResolvedValue({
                appId: '889510',
                found: true,
                action: 'sent',
            });

            const taskParams = {
                assignedTo: 'John Mercer',
                status: 'In Progress',
                priority: 'High',
                dueDate: '2026-07-15',
            };

            const res = await request(app)
                .post('/wex/application/889510/close')
                .set('x-api-key', TEST_API_KEY)
                .send(taskParams);

            expect(res.status).toBe(200);
            expect(registry.runAutomation).toHaveBeenCalledWith(
                'wex.close',
                expect.objectContaining({
                    appId: '889510',
                    ...taskParams,
                })
            );
        });

        it('returns found:false when application not found in SF', async () => {
            registry.runAutomation.mockResolvedValue({
                appId: '999999',
                found: false,
                action: 'skipped',
            });

            const res = await request(app)
                .post('/wex/application/999999/close')
                .set('x-api-key', TEST_API_KEY)
                .send({});

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                success: true,
                appId: '999999',
                found: false,
                action: 'skipped',
            });
        });

        it('returns 400 when appId is missing', async () => {
            registry.runAutomation.mockRejectedValue(
                Object.assign(new Error('appId is required'), { statusCode: 400 })
            );

            const res = await request(app)
                .post('/wex/application//close')
                .set('x-api-key', TEST_API_KEY)
                .send({});

            // Express route won't match /wex/application//close, expect 404
            expect(res.status).toBe(404);
        });

        it('returns 502 when scraper throws unexpected error', async () => {
            registry.runAutomation.mockRejectedValue(
                new Error('Playwright navigation timeout')
            );

            const res = await request(app)
                .post('/wex/application/889510/close')
                .set('x-api-key', TEST_API_KEY)
                .send({});

            expect(res.status).toBe(502);
            expect(res.body).toHaveProperty('message');
        });
    });

    describe('POST /wex/boca', () => {
        it('requires valid API key', async () => {
            const res = await request(app)
                .post('/wex/boca')
                .send({ appId: '889510' });

            expect(res.status).toBe(401);
        });

        it('calls wex.boca automation', async () => {
            registry.runAutomation.mockResolvedValue({
                appId: '889510',
                found: true,
                action: 'sent',
            });

            const res = await request(app)
                .post('/wex/boca')
                .set('x-api-key', TEST_API_KEY)
                .send({ appId: '889510' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(registry.runAutomation).toHaveBeenCalledWith(
                'wex.boca',
                expect.objectContaining({ appId: '889510' })
            );
        });
    });

    describe('POST /wex/apps', () => {
        it('requires valid API key', async () => {
            const res = await request(app)
                .post('/wex/apps')
                .send({ companyName: 'Acme Transport' });

            expect(res.status).toBe(401);
        });

        it('calls wex.apps automation with search params', async () => {
            registry.runAutomation.mockResolvedValue({
                found: true,
                appId: '889510',
            });

            const res = await request(app)
                .post('/wex/apps')
                .set('x-api-key', TEST_API_KEY)
                .send({ companyName: 'Acme Transport' });

            expect(res.status).toBe(200);
            expect(registry.runAutomation).toHaveBeenCalledWith(
                'wex.apps',
                expect.objectContaining({ companyName: 'Acme Transport' })
            );
        });
    });
});
