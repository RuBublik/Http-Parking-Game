const express = require('express');
const { levels, publicInfo } = require('../game/levels');

const router = express.Router();

// the level list for the page: title and story only, never the solutions
router.get('/', (req, res) => {
  res.json(levels.map(publicInfo));
});

// known address, but a method it doesn't support
router.all('/', (req, res) => {
  res.status(405).json({ error: 'Method not allowed' });
});

module.exports = router;
