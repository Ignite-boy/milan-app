const express = require('express');
const auth = require('../middleware/auth');
const { readJson, writeJson, findUserById, addActivity } = require('../utils/store');
const router = express.Router();
router.get('/', auth, (req, res) => { const found = findUserById(readJson(global.usersFile), req.userId); if (!found) return res.status(404).json({error:'User not found'}); res.json(found.user.profile || {}); });
router.put('/', auth, (req, res) => { const users = readJson(global.usersFile); const found = findUserById(users, req.userId); if (!found) return res.status(404).json({error:'User not found'}); const {display_name,bio,website,avatar}=req.body; found.user.profile={ display_name:String(display_name||'').trim(), bio:String(bio||'').trim(), website:String(website||'').trim(), avatar:String(avatar||'').trim(), updated_at:new Date().toISOString() }; users[found.email]=found.user; writeJson(global.usersFile, users); addActivity(req.userId, 'profile.updated'); res.json(found.user.profile); });
router.put('/settings', auth, (req,res)=>{ const users=readJson(global.usersFile); const found=findUserById(users, req.userId); if(!found) return res.status(404).json({error:'User not found'}); found.user.settings={...(found.user.settings||{}), ...req.body, updated_at:new Date().toISOString()}; users[found.email]=found.user; writeJson(global.usersFile, users); res.json(found.user.settings); });
module.exports = router;
