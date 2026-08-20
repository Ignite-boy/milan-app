const express = require('express');
const path = require('path');
const { readJson, writeJson } = require('../utils/store');
const router = express.Router();
const reportsFile = path.join(__dirname, '..', 'data', 'securityReports.json');

router.get('/policy', (_req, res) => res.json({
  ok: true,
  app: 'MILAN',
  model: 'one-user-one-isolated-dwn',
  principles: [
    'Owner-only data by default',
    'DID-based explicit sharing only',
    'No cross-user private data visibility',
    'Admin infrastructure visibility only; private payload visibility is disabled by design',
    'Passwords are hashed; sessions use JWT; uploads are type/size validated'
  ],
  accessModes: ['private', 'public', 'shared_did'],
  revokeSupported: true,
  auditSupported: true
}));

router.post('/report', (req, res) => {
  const all = readJson(reportsFile, []);
  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: String(req.body.title || 'Security report').slice(0, 180),
    details: String(req.body.details || '').slice(0, 5000),
    contact: String(req.body.contact || '').slice(0, 180),
    status: 'new',
    createdAt: new Date().toISOString()
  };
  all.unshift(item); writeJson(reportsFile, all.slice(0, 1000));
  res.status(201).json({ ok: true, report: item });
});

module.exports = router;
