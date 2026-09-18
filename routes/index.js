const express = require('express');
const schemas = require('../data/schemas');
const { levels, publicInfo } = require('../game/levels');

const router = express.Router();

// the game page: the first level is rendered into the HTML on the server,
// the page switches levels itself from here on (no solutions, publicInfo strips them)
router.get('/', function(req, res, next) {
  res.render('index', { levels: levels.map(publicInfo) });
});

// schemas page: the data is rendered into the HTML on the server (no fetch in the browser)
router.get('/schemas', (req, res) => {
  res.render('schemas', { resources: schemas });
});

module.exports = router;
