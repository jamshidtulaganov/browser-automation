'use strict';

// browser-automation — bootstrap only. App assembly is in src/app.js.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./src/app');
const db = require('./src/core/db');

const PORT = process.env.PORT || 3000;

// Init the metrics DB (no-op if DATABASE_URL is unset), then listen. A DB error
// must not stop the service — metrics just fall back to in-memory.
db.init()
    .catch((e) => console.error('[db] init failed (metrics fall back to in-memory):', e.message))
    .finally(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🤖 browser-automation listening on port ${PORT}`);
        });
    });
