'use strict';

// WEX application lookup — resolves a numeric appId to its Salesforce record
// (Id, Status, Owner) via SOQL. Keeps this service self-contained: it owns the
// full WEX flow (SF lookup + browser scrape) and does not depend on servercrm.

const axios = require('axios');
const { getWexSalesforceToken } = require('./salesforceAuth');

/**
 * Resolve a WEX OnlineApplication by its numeric id.
 * @param {string} appId numeric application id (e.g. "889510")
 * @returns {Promise<{sfRecordId:string, sfStatus:string, ownerName:string|null}|null>}
 *          null when no matching application exists.
 */
async function resolveApplication(appId) {
    const { token, instanceUrl } = await getWexSalesforceToken();
    const soql = `SELECT Id, Name, Status__c, Owner.Name FROM OnlineApplication__c ` +
                 `WHERE Name = 'Application-${appId}' OR Name = '${appId}' ` +
                 `ORDER BY LastModifiedDate DESC LIMIT 1`;
    const url = `${instanceUrl}/services/data/v52.0/query/?q=${encodeURIComponent(soql)}`;
    const sf = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
    const rec = (sf.data && sf.data.records || [])[0];
    if (!rec) return null;
    return {
        sfRecordId: rec.Id,
        sfStatus:   rec.Status__c || '',
        ownerName:  (rec.Owner && rec.Owner.Name) || null,
    };
}

/**
 * True if the given due date (ISO YYYY-MM-DD or MM/DD/YYYY) is before today (UTC).
 * Returns false for blank/unparseable input (let the scraper decide).
 */
function dueDateInPast(dueDate) {
    if (dueDate == null) return false;
    const s = String(dueDate).trim();
    let parsed;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (iso) parsed = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    else if (mdy) parsed = new Date(`${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}T00:00:00Z`);
    if (!parsed || isNaN(parsed)) return false;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return parsed < today;
}

module.exports = { resolveApplication, dueDateInPast };
