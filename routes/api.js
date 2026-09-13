const express = require('express');
const { checkLevel } = require('../game/levels');
const spotsRouter = require('./spots');
const sessionsRouter = require('./sessions');
const levelsRouter = require('./levels');

const router = express.Router();

router.use(checkLevel); // adds the level verdict headers to requests that carry X-Level-Id
router.use('/spots', spotsRouter);
router.use('/sessions', sessionsRouter);
router.use('/levels', levelsRouter);

// unknown /api/... address → JSON 404 (not the HTML error page)
router.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

module.exports = router;
