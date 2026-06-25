'use strict';

// Express app assembly. Bootstrap (dotenv + listen) lives in /server.js.

const express = require('express');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use(require('./routes/health'));
app.use(require('./routes/wex'));
app.use(require('./routes/run'));

app.use(errorHandler);

module.exports = app;
