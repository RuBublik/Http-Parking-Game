// Level definitions and the verdict. Server-only: the solutions must never reach the client.
const onHeaders = require('on-headers');
const db = require('../data/db');

const EV_PLATE = '12-345-67';
const EV_TICKET = 7; // the seed has 6 sessions, so the EV parked in level 6 always gets id 7

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

// solutions: the valid requests for a level (query values are strings, body values are
//   exact values or rules). effect: what the level changes in the lot, used to build
//   the starting state of the levels after it.
const levels = [
  {
    id: 1,
    title: 'All spots',
    story: 'Show every parking spot in the lot.',
    solutions: [{ method: 'GET', path: '/api/spots', status: 200 }],
  },
  {
    id: 2,
    title: 'One spot',
    story: 'Show the details of spot 107.',
    solutions: [{ method: 'GET', path: '/api/spots/107', status: 200 }],
  },
  {
    id: 3,
    title: 'Free on floor 2',
    story: 'Show only the free spots on floor 2.',
    solutions: [{ method: 'GET', path: '/api/spots', query: { floor: '2', status: 'free' }, status: 200 }],
  },
  {
    id: 4,
    title: 'Cheapest charging',
    story: 'Show the free EV spots, cheapest charging first.',
    solutions: [{
      method: 'GET',
      path: '/api/spots',
      query: { size: 'ev', status: 'free', sortBy: 'price', order: 'asc' },
      status: 200,
    }],
  },
  {
    id: 5,
    title: 'Closed for repairs',
    story: 'Spot 110 is broken. Close it for repairs.',
    solutions: [{ method: 'PATCH', path: '/api/spots/110', body: { status: 'closed' }, status: 200 }],
    effect() {
      db.findSpot(110).status = 'closed';
    },
  },
  {
    id: 6,
    title: 'An EV arrives',
    story: `An electric car with plate ${EV_PLATE} parks in charger spot 106. Register it.`,
    solutions: [{ method: 'POST', path: '/api/sessions', body: { plate: EV_PLATE, spotId: 106, ev: true }, status: 201 }],
    effect() {
      db.sessions.push({
        id: db.nextSessionId++,
        plate: EV_PLATE,
        spotId: 106,
        ev: true,
        handicap: false,
        startedAt: '2026-09-01T08:30:00.000Z',
        paid: false,
        chargedKwh: 0,
      });
      db.findSpot(106).status = 'occupied';
    },
  },
  {
    id: 7,
    title: 'Charging',
    story: 'The car from the previous level charged 20 kWh. Record it on its ticket.',
    solutions: [{ method: 'PATCH', path: `/api/sessions/${EV_TICKET}`, body: { chargedKwh: 20 }, status: 200 }],
    effect() {
      db.findSession(EV_TICKET).chargedKwh = 20;
    },
  },
  {
    id: 8,
    title: 'The bill',
    story: 'The driver wants to leave. How much do they owe?',
    solutions: [
      { method: 'GET', path: `/api/sessions/${EV_TICKET}`, status: 200 },
      { method: 'GET', path: '/api/spots/106/session', status: 200 },
    ],
  },
  {
    id: 9,
    title: 'Paying',
    story: 'The driver pays what is due.',
    solutions: [{
      method: 'POST',
      path: `/api/sessions/${EV_TICKET}/payment`,
      body: { amount: (amount) => typeof amount === 'number' && amount >= 60 },
      status: 200,
    }],
    effect() {
      db.findSession(EV_TICKET).paid = true;
    },
  },
  {
    id: 10,
    title: 'Leaving',
    story: 'The car leaves the lot.',
    solutions: [{ method: 'DELETE', path: `/api/sessions/${EV_TICKET}`, status: 204 }],
    effect() {
      db.sessions = db.sessions.filter((session) => session.id !== EV_TICKET);
      db.findSpot(106).status = 'free';
    },
  },
  {
    id: 11,
    title: 'Who is there?',
    story: 'Who is parked in spot 107 right now?',
    solutions: [{ method: 'GET', path: '/api/spots/107/session', status: 200 }],
  },
  {
    id: 12,
    title: 'No free rides',
    story: 'The car from the previous level tries to leave without paying. Try it and see what the server says.',
    solutions: [{ method: 'DELETE', path: '/api/sessions/3', status: 409 }],
  },
  {
    id: 13,
    title: 'Closed means closed',
    story: 'A driver tries to park in spot 110, which is closed for repairs. Try it.',
    solutions: [{ method: 'POST', path: '/api/sessions', body: { plate: isNonEmptyString, spotId: 110 }, status: 409 }],
  },
];

function findLevel(id) {
  return levels.find((level) => level.id === Number(id));
}

function publicInfo(level) {
  return { id: level.id, title: level.title, story: level.story };
}

// the lot as it is when the level begins: seed + the effects of all earlier levels
function startLevel(level) {
  db.reset();
  levels.filter((earlier) => earlier.id < level.id && earlier.effect).forEach((earlier) => earlier.effect());
}

// query must have exactly the expected keys and values, in any order
function queryMatches(expected = {}, query) {
  const keys = Object.keys(expected);
  return keys.length === Object.keys(query).length && keys.every((key) => query[key] === expected[key]);
}

// body must have the expected fields (exact value or rule); extra fields are ignored
function bodyMatches(expected, body) {
  if (!expected) return true;
  if (typeof body !== 'object' || body === null) return false;
  return Object.entries(expected).every(([key, rule]) => (typeof rule === 'function' ? rule(body[key]) : body[key] === rule));
}

function isSolution(solution, request, status) {
  return request.method === solution.method
    && request.path === solution.path
    && queryMatches(solution.query, request.query)
    && bodyMatches(solution.body, request.body)
    && status === solution.status;
}

// middleware: if the request carries X-Level-Id, add the verdict headers
// right before the response is sent (only then is the status code known)
function checkLevel(req, res, next) {
  const level = findLevel(req.get('X-Level-Id'));
  if (!level) return next();

  const request = {
    method: req.method,
    path: req.originalUrl.split('?')[0].replace(/(.)\/$/, '$1'), // "/api/spots/" counts as "/api/spots"
    query: req.query,
    body: req.body,
  };
  onHeaders(res, () => {
    const passed = level.solutions.some((solution) => isSolution(solution, request, res.statusCode));
    res.setHeader('X-Level-Passed', String(passed));
    res.setHeader('X-Level-Message', passed ? 'Correct!' : 'Not quite, try again');
  });
  next();
}

module.exports = { levels, findLevel, publicInfo, startLevel, checkLevel };
