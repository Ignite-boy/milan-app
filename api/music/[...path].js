'use strict';

const musicRouter = require('../../../backend/routes/music');

module.exports = function handler(req, res) {
  return musicRouter(req, res);
};
