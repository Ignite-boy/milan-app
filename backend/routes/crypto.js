const express = require('express');
const bcrypt = require('../services/cryptoPool'); // bcrypt off the event loop (worker_threads)
const auth = require('../middleware/auth');
const { encrypt, decrypt, hashText } = require('../utils/crypto');
const { readJson, findUserById } = require('../utils/store');
const router = express.Router();
router.post('/encrypt', auth, (req,res)=>{ const {text,password}=req.body; if(!text||!password) return res.status(400).json({error:'text and password required'}); res.json(encrypt(text,password)); });
router.post('/decrypt', auth, (req,res)=>{ try{ const {payload,password}=req.body; if(!payload||!password) return res.status(400).json({error:'payload and password required'}); res.json({text:decrypt(payload,password)}); }catch(e){ res.status(400).json({error:'Decrypt failed: wrong password or invalid payload'}); } });
router.post('/hash', auth, (req,res)=>res.json({sha256: hashText(req.body.text || '')}));
router.post('/get-raw-seed', auth, async (req,res)=>{ const found=findUserById(readJson(global.usersFile), req.userId); if(!found) return res.status(404).json({error:'User not found'}); const ok=await bcrypt.compare(String(req.body.password||''), found.user.password_hash); if(!ok) return res.status(401).json({error:'Invalid password'}); res.json({ rawSeed: found.user.raw_seed }); });
module.exports = router;
