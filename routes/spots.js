const express = require('express');
const db = require('../data/db');
const { withAmount } = require('../data/pricing');

const router = express.Router();

router.get('/', (req, res) => {
  const { floor, status, size, sortBy, order } = req.query;
  let spots = db.spots;

  if (floor) spots = spots.filter((spot) => spot.floor === Number(floor));
  if (status) spots = spots.filter((spot) => spot.status === status);
  if (size) spots = spots.filter((spot) => spot.size === size);

  if (sortBy === 'price') {
    // charging price; spots without a charger go last
    const price = (spot) => (spot.charger ? spot.charger.pricePerKwh : Infinity);
    spots = [...spots].sort((a, b) => price(a) - price(b));
    if (order === 'desc') spots.reverse();
  }

  res.json(spots);
});

router.get('/:id', (req, res) => {
  const spot = db.findSpot(req.params.id);
  if (!spot) return res.status(404).json({ error: 'Spot not found' });
  res.json(spot);
});

// close a spot for repairs, or reopen it
router.patch('/:id', (req, res) => {
  const spot = db.findSpot(req.params.id);
  if (!spot) return res.status(404).json({ error: 'Spot not found' });

  const { status } = req.body ?? {};
  if (status !== 'closed' && status !== 'free') {
    return res.status(400).json({ error: 'Body must have status: "closed" or "free"' });
  }
  if (spot.status === 'occupied') return res.status(409).json({ error: 'Spot is occupied' });

  spot.status = status;
  res.json(spot);
});

router.get('/:id/session', (req, res) => {
  const spot = db.findSpot(req.params.id);
  if (!spot) return res.status(404).json({ error: 'Spot not found' });

  const session = db.sessions.find((s) => s.spotId === spot.id);
  if (!session) return res.status(404).json({ error: 'No car is parked in this spot' });
  res.json(withAmount(session));
});

// known address, but a method it doesn't support
router.all(['/', '/:id', '/:id/session'], (req, res) => {
  res.status(405).json({ error: 'Method not allowed' });
});

module.exports = router;
