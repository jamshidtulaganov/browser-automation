'use strict';

// Central error → JSON. Automations throw HttpError(4xx,...) for client errors
// (safe to echo); anything else is a server/automation failure → 5xx, whose
// details are logged server-side only and never returned (avoids info leakage).

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    const status = err && err.status ? err.status : 502;
    const message = err && err.message ? err.message : String(err);
    if (status >= 500) {
        console.error(`[error] ${req.method} ${req.path}: ${message}`, err && err.stack ? `\n${err.stack}` : '');
        // DEBUG_ERRORS=true surfaces the real message/stack in the response (temporary
        // diagnostics for an internal service). Default redacts to avoid info leakage.
        if (process.env.DEBUG_ERRORS === 'true') {
            return res.status(status).json({ success: false, message, stack: err && err.stack ? String(err.stack) : null });
        }
        return res.status(status).json({ success: false, message: 'internal error' });
    }
    res.status(status).json({ success: false, message });
}

module.exports = { errorHandler };
