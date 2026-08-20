const crypto = require('crypto');

// Single source of truth for the JWT signing/verifying secret.
// Both routes/auth.js (sign) and middleware/auth.js (verify) MUST use this so
// the secrets can never diverge. Previously the verify side fell back to a
// public constant ('change-this-secret-in-production') while the sign side used
// an ephemeral random key when JWT_SECRET was unset — making every token fail
// to verify (and accepting tokens forged with the public constant).
const JWT_SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET is missing or too short. Refusing to start in production with an insecure signing key — set a long random JWT_SECRET.');
  }
  const dev = crypto.randomBytes(48).toString('hex');
  console.warn('[security] JWT_SECRET not set — using an ephemeral dev secret (tokens reset on restart). Set JWT_SECRET for stable sessions.');
  return dev;
})();

module.exports = JWT_SECRET;
