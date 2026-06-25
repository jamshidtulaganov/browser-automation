const axios = require('axios');

// Salesforce tokens are long-lived; cache for 110 min to avoid re-auth overhead
const TTL_MS = 110 * 60 * 1000;

let _token       = null;
let _instanceUrl = null;
let _expiry      = null;

async function getWexSalesforceToken() {
    if (_token && _expiry && Date.now() < _expiry) {
        return { token: _token, instanceUrl: _instanceUrl };
    }

    console.log('🔄 [WexSF] Fetching new WEX Salesforce token...');

    // SF_WEX_CLIENT_KEY may contain embedded \n from the .env file — strip all whitespace
    const clientId = (process.env.SF_WEX_CLIENT_KEY || '').replace(/\s+/g, '');

    const params = new URLSearchParams({
        grant_type:    'password',
        client_id:     clientId,
        client_secret: process.env.SF_WEX_CLIENT_SECRET,
        username:      process.env.SF_WEX_USER,
        // Salesforce requires password + security token concatenated (no separator)
        password:      process.env.SF_WEX_USER_PASSWORD + process.env.SF_WEX_SECURITY_CODE,
    });

    const authUrl = process.env.WEX_SF_AUTH_URL || 'https://test.salesforce.com/services/oauth2/token';

    let res;
    try {
        res = await axios.post(authUrl, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
    } catch (err) {
        const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        console.error('[WexSF] auth HTTP error:', detail);   // details to server log only
        throw new Error('WEX Salesforce auth failed (see server logs)');
    }

    if (!res.data.access_token) {
        console.error('[WexSF] auth response missing access_token:', JSON.stringify(res.data));
        throw new Error('WEX Salesforce auth failed (see server logs)');
    }

    _token       = res.data.access_token;
    _instanceUrl = res.data.instance_url;
    _expiry      = Date.now() + TTL_MS;

    console.log(`✅ [WexSF] Token acquired. Instance: ${_instanceUrl}`);
    return { token: _token, instanceUrl: _instanceUrl };
}

function clearWexSalesforceToken() {
    _token       = null;
    _instanceUrl = null;
    _expiry      = null;
}

module.exports = { getWexSalesforceToken, clearWexSalesforceToken };
