const express = require('express');
const db = require('../data/db');
const { checkLevel } = require('../game/levels');
const spotsRouter = require('./spots');
const sessionsRouter = require('./sessions');
const levelsRouter = require('./levels');

const router = express.Router();

router.use(checkLevel); // adds the level verdict headers to requests that carry X-Level-Id
router.use('/spots', spotsRouter);
router.use('/sessions', sessionsRouter);
router.use('/levels', levelsRouter);

// start over: the lot goes back to the seed data (Reset button, page load)
router.post('/reset', (req, res) => {
  db.reset();
  res.status(204).end();
});

router.all('/reset', (req, res) => {
  res.status(405).json({ error: 'Method not allowed' });
});

// unknown /api/... address → JSON 404 (not the HTML error page)
router.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

module.exports = router;
