const express = require('express');
const auth = require('../middleware/auth');
const { readJson } = require('../utils/store');
const router = express.Router();
router.get('/', auth, (req,res)=>res.json((readJson(global.activityFile,{})[req.userId] || []).slice(0,100)));
module.exports = router;
