const express = require('express');
const schemas = require('../data/schemas');

const router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

// schemas page: the data is rendered into the HTML on the server (no fetch in the browser)
router.get('/schemas', (req, res) => {
  res.render('schemas', { resources: schemas });
});

module.exports = router;
