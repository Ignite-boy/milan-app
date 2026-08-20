const express = require('express');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const { readJson, writeJson, findUserById, findUserByDid, addActivity } = require('../utils/store');
const router = express.Router();
const uuidv4 = () => crypto.randomUUID();
function now(){ return new Date().toISOString(); }
function file(){ return global.connectionsFile; }
function all(){ return readJson(file(), {}); }
function save(x){ writeJson(file(), x); }
function current(req){ return findUserById(readJson(global.usersFile, {}), req.userId); }
function publicConn(c){ return { id:c.id, fromUserId:c.fromUserId, toUserId:c.toUserId, fromDid:c.fromDid, toDid:c.toDid, status:c.status, message:c.message||'', createdAt:c.createdAt, updatedAt:c.updatedAt }; }
function notifyUser(userId, type, actorDid, details={}){
  try {
    const file = global.notificationsFile;
    const data = readJson(file, {});
    if (!Array.isArray(data[userId])) data[userId] = [];
    data[userId].unshift({ id: uuidv4(), type, actorDid, details, read:false, createdAt: now() });
    data[userId] = data[userId].slice(0, 200);
    writeJson(file, data);
    // Instant push to any live SSE/WebSocket connection of the recipient.
    require('../services/livePush').push(userId, 'notify', { notifType: type });
  } catch (_) {}
}

router.get('/', auth, (req, res) => {
  const me = current(req); if (!me) return res.status(404).json({ error:'User not found' });
  const did = me.user.did;
  const rows = Object.values(all()).filter(c => c.fromDid === did || c.toDid === did).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  res.json(rows.map(publicConn));
});
router.post('/', auth, (req, res) => {
  const me = current(req); if (!me) return res.status(404).json({ error:'User not found' });
  const toDid = String(req.body.toDid || '').trim();
  if (!toDid.startsWith('did:')) return res.status(400).json({ error:'Valid receiver DID required' });
  if (toDid === me.user.did) return res.status(400).json({ error:'You cannot connect to your own DID' });
  const target = findUserByDid(readJson(global.usersFile, {}), toDid);
  if (!target) return res.status(404).json({ error:'Receiver DID not found locally' });
  const data = all();
  const existing = Object.values(data).find(c => (c.fromDid === me.user.did && c.toDid === toDid) || (c.fromDid === toDid && c.toDid === me.user.did));
  if (existing) return res.json(publicConn(existing));
  const c = { id:uuidv4(), fromUserId:req.userId, toUserId:target.user.id, fromDid:me.user.did, toDid, status:'pending', message:String(req.body.message||'').slice(0,1000), createdAt:now(), updatedAt:now() };
  data[c.id]=c; save(data);
  addActivity(req.userId, 'connection.request.sent', { toDid }); addActivity(target.user.id, 'connection.request.received', { fromDid: me.user.did });
  notifyUser(target.user.id, 'connection_request', me.user.did, { connectionId: c.id, message: c.message });
  res.status(201).json(publicConn(c));
});
router.patch('/:id/approve', auth, (req,res)=>{
  const me=current(req); if(!me) return res.status(404).json({error:'User not found'});
  const data=all(); const c=data[req.params.id]; if(!c) return res.status(404).json({error:'Connection not found'});
  if(c.toDid!==me.user.did) return res.status(403).json({error:'Only receiver can approve'});
  c.status='approved'; c.updatedAt=now(); save(data); addActivity(req.userId,'connection.approved',{id:c.id,fromDid:c.fromDid}); notifyUser(c.fromUserId, 'connection_approved', me.user.did, { connectionId: c.id }); res.json(publicConn(c));
});
router.patch('/:id/reject', auth, (req,res)=>{
  const me=current(req); if(!me) return res.status(404).json({error:'User not found'});
  const data=all(); const c=data[req.params.id]; if(!c) return res.status(404).json({error:'Connection not found'});
  if(c.toDid!==me.user.did) return res.status(403).json({error:'Only receiver can reject'});
  c.status='rejected'; c.updatedAt=now(); save(data); addActivity(req.userId,'connection.rejected',{id:c.id,fromDid:c.fromDid}); notifyUser(c.fromUserId, 'connection_rejected', me.user.did, { connectionId: c.id }); res.json(publicConn(c));
});
router.delete('/:id', auth, (req,res)=>{
  const me=current(req); if(!me) return res.status(404).json({error:'User not found'});
  const data=all(); const c=data[req.params.id]; if(!c) return res.json({ok:true});
  if(c.fromDid!==me.user.did && c.toDid!==me.user.did) return res.status(403).json({error:'No access'});
  delete data[req.params.id]; save(data); addActivity(req.userId,'connection.removed',{id:req.params.id}); res.json({ok:true});
});
module.exports = router;
