const express = require('express');
const spotsRouter = require('./spots');
const sessionsRouter = require('./sessions');

const router = express.Router();

router.use('/spots', spotsRouter);
router.use('/sessions', sessionsRouter);

// unknown /api/... address → JSON 404 (not the HTML error page)
router.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

module.exports = router;
