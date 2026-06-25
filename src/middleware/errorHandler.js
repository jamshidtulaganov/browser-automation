'use strict';

// Central error → JSON. Automations throw HttpError(400,...) for client errors;
// anything else is a browser/automation failure → 502.

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    const status = err && err.status ? err.status : 502;
    const message = err && err.message ? err.message : String(err);
    if (status >= 500) console.error(`[error] ${req.method} ${req.path}: ${message}`);
    res.status(status).json({ success: false, message });
}

module.exports = { errorHandler };
