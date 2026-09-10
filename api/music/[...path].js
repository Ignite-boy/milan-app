'use strict';

const express = require('express');
const musicRouter = require('../../backend/routes/music');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use('/', musicRouter);

module.exports = app;
