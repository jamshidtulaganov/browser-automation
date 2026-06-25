'use strict';

// Central error → JSON. Automations throw HttpError(4xx,...) for client errors
// (safe to echo); anything else is a server/automation failure → 5xx, whose
// details are logged server-side only and never returned (avoids info leakage).

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    const status = err && err.status ? err.status : 502;
    const message = err && err.message ? err.message : String(err);
    if (status >= 500) {
        // Full details to the server log only; clients get a generic message.
        console.error(`[error] ${req.method} ${req.path}: ${message}`, err && err.stack ? `\n${err.stack}` : '');
        return res.status(status).json({ success: false, message: 'internal error' });
    }
    res.status(status).json({ success: false, message });
}

module.exports = { errorHandler };
