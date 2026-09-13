const express = require('express');
const { levels, findLevel, publicInfo, hint } = require('../game/levels');

const router = express.Router();

// the level list for the page: title and story only, never the solutions
router.get('/', (req, res) => {
  res.json(levels.map(publicInfo));
});

// the level's solution, only when the player asks for it (Hint button)
router.get('/:id/hint', (req, res) => {
  const level = findLevel(req.params.id);
  if (!level) return res.status(404).json({ error: 'Level not found' });
  res.json(hint(level));
});

// known address, but a method it doesn't support
router.all(['/', '/:id/hint'], (req, res) => {
  res.status(405).json({ error: 'Method not allowed' });
});

module.exports = router;
