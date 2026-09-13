const db = require('./db');

const ENTRY_FEE = 20;
const ICE_ON_EV_SPOT_PENALTY = 100;
const HANDICAP_PENALTY = 200;

// flat entry fee + charged energy at the charger's price + penalties for taking a special spot
function calculateAmount(session) {
  const spot = db.findSpot(session.spotId);
  let amount = ENTRY_FEE;
  if (spot.charger) amount += session.chargedKwh * spot.charger.pricePerKwh;
  if (!session.ev && spot.size === 'ev') amount += ICE_ON_EV_SPOT_PENALTY;
  if (!session.handicap && spot.handicap) amount += HANDICAP_PENALTY;
  return amount;
}

// amount is not stored, it is always calculated
function withAmount(session) {
  return { ...session, amount: calculateAmount(session) };
}

module.exports = { calculateAmount, withAmount };
