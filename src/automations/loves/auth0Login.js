'use strict';

// Love's Shop Connect (shopconnect.loves.com) is an Auth0 SPA — Authorization Code + PKCE, the ID
// token used as the API bearer, ~24h, no refresh token, no machine client. The only road to a
// token is the real login page in a real browser; this drives it and catches the SPA's own
// `/oauth/token` exchange on the way back. Credentials and tokens are never logged here.

const { HttpError } = require('../../core/httpError');

const USER_SELECTORS = ['input[name=username]', 'input[name=email]', 'input#username', 'input[type=email]', 'input[type=text]'];
const SUBMIT_SELECTORS = ['button[type=submit]', 'button[name=submit]', 'input[type=submit]', 'button.auth0-lock-submit'];
// Auth0 Universal Login's inline error slots (classic and new experience).
const ERROR_SELECTOR = '#error-element-password, #error-element-username, .ulp-input-error-message, [data-error-code], .auth0-global-message-error';

function portalUrl() {
    return (process.env.LOVES_SHOP_CONNECT_URL || 'https://shopconnect.loves.com').replace(/\/+$/, '');
}

/** `exp` of a JWT in epoch ms, or null when the token does not carry one. */
function jwtExpiryMs(jwt) {
    try {
        const payload = JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8'));
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch (_) {
        return null;
    }
}

async function firstPresent(page, selectors) {
    for (const s of selectors) {
        if (await page.locator(s).count()) return s;
    }
    return null;
}

/**
 * Drive the portal's login and return the Auth0 ID token.
 * @param {import('playwright').Page} page
 */
async function loginForIdToken(page, login, password) {
    // The trap goes in before anything moves: the SPA exchanges its PKCE code the moment it lands back.
    const tokenResponse = page.waitForResponse(
        (r) => /\/oauth\/token(\?|$)/.test(r.url()) && r.request().method() === 'POST',
        { timeout: 90000 },
    );
    tokenResponse.catch(() => { /* settled through the race below */ });

    await page.goto(portalUrl(), { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/auth0\.com/, { timeout: 45000 });
    await page.waitForSelector('input[type=password]', { timeout: 30000 });

    const userSel = await firstPresent(page, USER_SELECTORS);
    if (!userSel) throw new HttpError(502, "Love's login page has no username field");
    await page.fill(userSel, login);
    await page.fill('input[type=password]', password);
    const submitSel = await firstPresent(page, SUBMIT_SELECTORS);
    if (submitSel) await page.click(submitSel);
    else await page.keyboard.press('Enter');

    const outcome = await Promise.race([
        tokenResponse.then((res) => ({ res })),
        page.waitForSelector(ERROR_SELECTOR, { timeout: 90000 }).then(() => ({ refused: true })),
    ]).catch(() => ({ timedOut: true }));

    if (!outcome.res) {
        let reason = outcome.timedOut ? 'no token exchange within 90s' : 'login refused';
        if (outcome.refused) {
            const text = await page.locator(ERROR_SELECTOR).first().textContent().catch(() => null);
            if (text && text.trim()) reason = `login refused: ${text.trim().slice(0, 120)}`;
        }
        throw new HttpError(502, `Love's login did not produce a token (${reason})`);
    }
    const json = await outcome.res.json().catch(() => null);
    const idToken = json && json.id_token;
    if (!idToken) throw new HttpError(502, "Love's token exchange answered without an id_token");
    return idToken;
}

module.exports = { loginForIdToken, jwtExpiryMs, portalUrl };
