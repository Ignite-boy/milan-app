// Vercel lightweight entry - serves frontend static only, no DWN
const path = require('path');
const fs = require('fs');
const express = require('express');
const app = require('express')();

app.disable('x-powered-by');

// Serve frontend static
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath, { maxAge: '1h', etag: true }));

// Minimal health for Vercel
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'MILAN Frontend on Vercel', time: new Date().toISOString() });
});

// For any /api/* that doesn't exist yet, return 503 so frontend knows backend is elsewhere
app.use('/api', (_req, res) => {
  res.status(503).json({ ok: false, error: 'Backend not on Vercel. Deploy backend to api.milanlife.in' });
});

// SPA fallback - serve index.html
app.get('*', (_req, res) => {
  const indexFile = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  res.status(404).send('Frontend not found');
});

module.exports = app;
