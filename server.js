'use strict';

// browser-automation — bootstrap only. App assembly is in src/app.js.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./src/app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🤖 browser-automation listening on port ${PORT}`);
});
