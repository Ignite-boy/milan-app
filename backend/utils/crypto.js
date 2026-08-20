const crypto = require('crypto');
function encrypt(text, password) {
  const iv = crypto.randomBytes(12);
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return { algorithm:'aes-256-gcm', iv: iv.toString('hex'), salt: salt.toString('hex'), encrypted: encrypted.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
}
function decrypt(obj, password) {
  const key = crypto.scryptSync(password, Buffer.from(obj.salt, 'hex'), 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(obj.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(obj.authTag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(obj.encrypted, 'hex')), decipher.final()]).toString('utf8');
}
function hashText(text){ return crypto.createHash('sha256').update(String(text)).digest('hex'); }
module.exports = { encrypt, decrypt, hashText };
