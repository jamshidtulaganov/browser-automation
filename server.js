'use strict';

// browser-automation — bootstrap only. App assembly is in src/app.js.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./src/app');
const store = require('./src/core/store');

const PORT = process.env.PORT || 3000;

// Init the embedded metrics store (falls back to in-memory if the dir isn't
// writable), then listen.
store.init();
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🤖 browser-automation listening on port ${PORT}`);
});
