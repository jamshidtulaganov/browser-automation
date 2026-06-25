'use strict';

// SSRF guard for generic URL-driven ops (screenshot/pdf/extract). Without this,
// a caller could point the server at internal/cloud-metadata endpoints.
// Two layers: (1) optional env allowlist (preferred); (2) DNS resolution +
// private/loopback/link-local/CGNAT/multicast rejection.

const dns = require('dns').promises;
const net = require('net');
const { badRequest } = require('./httpError');

function isPrivateIp(ipRaw) {
    let ip = ipRaw;
    if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7); // IPv4-mapped IPv6
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number);
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;          // link-local / cloud metadata
        if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
        if (a === 192 && b === 168) return true;          // 192.168/16
        if (a === 100 && b >= 64 && b <= 127) return true;// CGNAT 100.64/10
        if (a >= 224) return true;                        // multicast / reserved
        return false;
    }
    if (net.isIPv6(ip)) {
        const l = ip.toLowerCase();
        if (l === '::1' || l === '::') return true;
        if (l.startsWith('fe80')) return true;            // link-local
        if (l.startsWith('fc') || l.startsWith('fd')) return true; // ULA fc00::/7
        if (l.startsWith('ff')) return true;              // multicast
        return false;
    }
    return true; // unknown format → block
}

/**
 * Validate a user-supplied URL is safe to fetch. Returns the normalized URL.
 * Throws HttpError(400) when unsafe.
 */
async function assertSafeUrl(rawUrl) {
    let u;
    try { u = new URL(String(rawUrl || '')); } catch (_) { throw badRequest('a valid http(s) url is required'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw badRequest('only http(s) urls are allowed');

    const allow = (process.env.AUTOMATION_URL_ALLOWLIST || '')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (allow.length) {
        const host = u.hostname.toLowerCase();
        const ok = allow.some(d => host === d || host.endsWith('.' + d));
        if (!ok) throw badRequest('url host is not in AUTOMATION_URL_ALLOWLIST');
        return u.toString();
    }

    // No allowlist → resolve and reject internal targets.
    let addrs;
    try { addrs = await dns.lookup(u.hostname, { all: true }); }
    catch (_) { throw badRequest('could not resolve url host'); }
    for (const a of addrs) {
        if (isPrivateIp(a.address)) throw badRequest('url resolves to a private/internal address');
    }
    return u.toString();
}

module.exports = { assertSafeUrl, isPrivateIp };
