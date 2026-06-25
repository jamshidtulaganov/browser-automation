'use strict';

// Tiny helper so automations can signal an HTTP status from deep in their logic.
// errorHandler middleware reads err.status; anything without one is treated as 502.

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const badRequest = (msg) => new HttpError(400, msg);

module.exports = { HttpError, badRequest };
