const express = require('express');
const { levels, findLevel, publicInfo, startLevel } = require('../game/levels');

const router = express.Router();

// the level list for the page: title and story only, never the solutions
router.get('/', (req, res) => {
  res.json(levels.map(publicInfo));
});

// set the current level: resets the lot to the level's starting state
router.put('/current', (req, res) => {
  const { id } = req.body ?? {};
  if (typeof id !== 'number') return res.status(400).json({ error: 'Body must have id (number)' });

  const level = findLevel(id);
  if (!level) return res.status(404).json({ error: 'Level not found' });

  startLevel(level);
  res.json(publicInfo(level));
});

// known address, but a method it doesn't support
router.all(['/', '/current'], (req, res) => {
  res.status(405).json({ error: 'Method not allowed' });
});

module.exports = router;
