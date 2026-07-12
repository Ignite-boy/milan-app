// ─────────────────────────────────────────────────────────────────────────────
// MILAN Billing — Razorpay integration (orders + signature verify + entitlement)
//
// Security model:
//   • Prices live ONLY here on the server. The client sends {plan, cycle};
//     the amount is looked up server-side, so a tampered client can never
//     pay ₹1 for Premium.
//   • Every order we create is recorded (billing.json) with the user + plan.
//     Verification checks Razorpay's HMAC signature AND our own order record,
//     then stores the entitlement on the user record — the server, not
//     localStorage, is the source of truth.
//   • Keys come from backend/.env (never committed):
//       RAZORPAY_KEY_ID=rzp_live_xxx / rzp_test_xxx
//       RAZORPAY_KEY_SECRET=xxxx
//     Without keys, /config reports configured:false and the frontend stays
//     in demo mode — nothing breaks.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const auth = require('../middleware/auth');
const { readJson, writeJson, writeJsonAndSync, cleanUsersDb, repairUsersFile } = require('../utils/store');

const router = express.Router();

// Single source of truth for pricing (paise).
const PLANS = {
  premium: {
    name: 'MILAN Premium',
    monthly: { amount: 19900, label: '₹199/month' },
    annual:  { amount: 149900, label: '₹1,499/year' }
  }
};

const keyId = () => String(process.env.RAZORPAY_KEY_ID || '').trim();
const keySecret = () => String(process.env.RAZORPAY_KEY_SECRET || '').trim();
const configured = () => !!(keyId() && keySecret());

const ordersFile = () => path.join(path.dirname(global.usersFile), 'billing.json');
const readOrders = () => readJson(ordersFile(), {});
const writeOrders = (o) => writeJson(ordersFile(), o);

function getUsers() { repairUsersFile(global.usersFile); return cleanUsersDb(readJson(global.usersFile, {})); }
async function saveUsers(users) {
  const r = await writeJsonAndSync(global.usersFile, users).catch(e => ({ ok: false, error: e.message }));
  if (!r || r.ok === false) writeJson(global.usersFile, users);
}

// ── GET /api/billing/config — public checkout config ────────────────────────
router.get('/config', (_req, res) => {
  res.json({
    ok: true,
    configured: configured(),
    keyId: configured() ? keyId() : '',
    currency: 'INR',
    plans: { premium: { monthly: PLANS.premium.monthly.amount / 100, annual: PLANS.premium.annual.amount / 100 } }
  });
});

// ── GET /api/billing/status — the user's server-side entitlement ────────────
router.get('/status', auth, (req, res) => {
  const users = getUsers();
  const u = users[req.userEmail];
  res.json({ ok: true, premium: u && u.premium ? u.premium : null });
});

// ── POST /api/billing/order  {plan, cycle} ──────────────────────────────────
router.post('/order', auth, async (req, res) => {
  try {
    if (!configured()) return res.status(503).json({ error: 'Payments are not configured yet.' });

    const plan = String(req.body.plan || 'premium');
    const cycle = String(req.body.cycle || 'annual');
    const p = PLANS[plan];
    if (!p || !p[cycle]) return res.status(400).json({ error: 'Unknown plan or cycle.' });
    const amount = p[cycle].amount; // server-side price — client input is ignored

    const basic = Buffer.from(keyId() + ':' + keySecret()).toString('base64');
    const rsp = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + basic },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: 'milan_' + String(req.userId).slice(0, 24) + '_' + Date.now(),
        notes: { userId: req.userId, email: req.userEmail, plan, cycle }
      })
    });
    const order = await rsp.json().catch(() => null);
    if (!rsp.ok || !order || !order.id) {
      const msg = order && order.error && order.error.description ? order.error.description : 'Could not create the payment order.';
      return res.status(502).json({ error: msg });
    }

    // Record the order so verify() can trust plan/cycle/amount from OUR side.
    const orders = readOrders();
    orders[order.id] = { userId: req.userId, email: req.userEmail, plan, cycle, amount, at: Date.now(), status: 'created' };
    // Prune records older than 7 days to keep the file small.
    const cutoff = Date.now() - 7 * 864e5;
    for (const [id, o] of Object.entries(orders)) if (o.at < cutoff && o.status === 'created') delete orders[id];
    writeOrders(orders);

    res.json({ ok: true, id: order.id, amount, currency: 'INR', keyId: keyId() });
  } catch (e) {
    res.status(500).json({ error: 'Payment order failed: ' + e.message });
  }
});

// ── POST /api/billing/verify  {razorpay_order_id, razorpay_payment_id, razorpay_signature} ──
router.post('/verify', auth, async (req, res) => {
  try {
    if (!configured()) return res.status(503).json({ error: 'Payments are not configured yet.' });
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment fields.' });
    }

    // 1) Cryptographic proof the payment belongs to this order (Razorpay HMAC).
    const expected = crypto.createHmac('sha256', keySecret())
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');
    const a = Buffer.from(expected), b = Buffer.from(String(razorpay_signature));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(400).json({ error: 'Payment signature mismatch.' });
    }

    // 2) The order must be one WE created, for THIS user.
    const orders = readOrders();
    const rec = orders[razorpay_order_id];
    if (!rec) return res.status(400).json({ error: 'Unknown payment order.' });
    if (rec.email !== req.userEmail) return res.status(403).json({ error: 'This payment belongs to a different account.' });

    // 3) Activate the entitlement on the user record (server-side truth).
    const users = getUsers();
    const u = users[req.userEmail];
    if (!u) return res.status(404).json({ error: 'Account not found.' });
    u.premium = {
      plan: rec.plan,
      cycle: rec.cycle,
      since: new Date().toISOString(),
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      amount: rec.amount
    };
    await saveUsers(users);

    rec.status = 'paid';
    rec.paymentId = razorpay_payment_id;
    writeOrders(orders);

    res.json({ ok: true, premium: u.premium });
  } catch (e) {
    res.status(500).json({ error: 'Verification failed: ' + e.message });
  }
});

// ── POST /api/billing/cancel — switch the account back to free ──────────────
router.post('/cancel', auth, async (req, res) => {
  try {
    const users = getUsers();
    const u = users[req.userEmail];
    if (u && u.premium) { delete u.premium; await saveUsers(users); }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Cancel failed: ' + e.message });
  }
});

module.exports = router;
