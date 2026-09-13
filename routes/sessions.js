const express = require('express');
const db = require('../data/db');
const { calculateAmount, withAmount } = require('../data/pricing');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.sessions.map(withAmount));
});

router.get('/:id', (req, res) => {
  const session = db.findSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(withAmount(session));
});

router.post('/', (req, res) => {
  const { plate, spotId, ev = false, handicap = false } = req.body ?? {};
  if (typeof plate !== 'string' || !plate.trim() || typeof spotId !== 'number') {
    return res.status(400).json({ error: 'Body must have plate (non-empty string) and spotId (number)' });
  }
  if (typeof ev !== 'boolean' || typeof handicap !== 'boolean') {
    return res.status(400).json({ error: 'ev and handicap must be true or false' });
  }

  const spot = db.findSpot(spotId);
  if (!spot) return res.status(404).json({ error: 'Spot not found' });
  if (spot.status !== 'free') return res.status(409).json({ error: `Spot is ${spot.status}` });
  if (db.sessions.some((s) => s.plate === plate)) {
    return res.status(409).json({ error: 'This car is already parked' });
  }

  const session = {
    id: db.nextSessionId++,
    plate,
    spotId,
    ev,
    handicap,
    startedAt: new Date().toISOString(),
    paid: false,
    chargedKwh: 0,
  };
  db.sessions.push(session);
  spot.status = 'occupied';
  res.status(201).json(withAmount(session));
});

// charge the car: sets the energy on the ticket (like a meter, it only goes up)
router.patch('/:id', (req, res) => {
  const session = db.findSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { chargedKwh } = req.body ?? {};
  if (!Number.isInteger(chargedKwh) || chargedKwh <= 0) {
    return res.status(400).json({ error: 'Body must have chargedKwh (positive whole number)' });
  }
  if (session.paid) return res.status(409).json({ error: 'Session is already paid' });
  if (!session.ev || !db.findSpot(session.spotId).charger) {
    return res.status(409).json({ error: 'Only an EV parked on a charger spot can charge' });
  }
  if (chargedKwh < session.chargedKwh) {
    return res.status(409).json({ error: `Already charged ${session.chargedKwh} kWh, it can only go up` });
  }

  session.chargedKwh = chargedKwh;
  res.json(withAmount(session));
});

router.post('/:id/payment', (req, res) => {
  const session = db.findSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { amount } = req.body ?? {};
  if (typeof amount !== 'number') {
    return res.status(400).json({ error: 'Body must have amount (number)' });
  }
  if (session.paid) return res.status(409).json({ error: 'Session is already paid' });

  const due = calculateAmount(session);
  if (amount < due) return res.status(402).json({ error: 'Amount is less than what is due' });

  session.paid = true;
  res.json({ ...withAmount(session), change: amount - due });
});

router.delete('/:id', (req, res) => {
  const session = db.findSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!session.paid) return res.status(409).json({ error: 'Session is not paid yet' });

  db.sessions = db.sessions.filter((s) => s !== session);
  db.findSpot(session.spotId).status = 'free';
  res.status(204).end();
});

// known address, but a method it doesn't support
router.all(['/', '/:id', '/:id/payment'], (req, res) => {
  res.status(405).json({ error: 'Method not allowed' });
});

module.exports = router;
