// Platform admin(s) — may moderate/delete ANY post for cleanup & safety.
// Everyone else stays bound by the strict per-owner DWN model.
// Configure with ADMIN_EMAILS (comma-separated) in backend/.env; defaults to
// the founder account so the feature works out of the box.
const DEFAULT_ADMIN = 'np7218468@gmail.com';

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || DEFAULT_ADMIN)
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}
function isAdminEmail(email) {
  return !!email && adminEmails().includes(String(email).toLowerCase());
}
module.exports = { isAdminEmail };
