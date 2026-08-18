const path = require('path');
const express = require('express');
const app = express();

app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BACKEND_URL = process.env.BACKEND_URL || 'https://milan-api-4n3n.onrender.com';

app.use('/api', async (req, res) => {
  try {
    const targetUrl = BACKEND_URL + req.originalUrl;
    console.log('Proxying', req.method, req.originalUrl, '->', targetUrl);
    const resp = await fetch(targetUrl, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });
    const text = await resp.text();
    res.status(resp.status);
    try { res.set('Content-Type', resp.headers.get('content-type') || 'application/json'); } catch {}
    res.send(text);
  } catch (e) {
    console.error('Proxy failed', e);
    res.status(502).json({ ok: false, error: 'Backend proxy failed', details: e.message, backend: BACKEND_URL });
  }
});

const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath, { maxAge: '1h' }));

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

module.exports = app;
