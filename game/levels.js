// Level definitions and the verdict. Server-only: the solutions must never reach the client.
const onHeaders = require('on-headers');
const db = require('../data/db');
const { calculateAmount } = require('../data/pricing');

const EV_PLATE = '12-345-67';

// address of the session of the car parked in a spot, e.g. sessionPath(106) → "/api/sessions/7".
// Levels 7–10 use spot 106: level 6 only passes once the car is parked there.
function sessionPath(spotId, suffix = '') {
  return `/api/sessions/${db.findSessionInSpot(spotId)?.id}${suffix}`;
}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

// solutions: the valid requests for a level. query values are strings; body values are exact
//   values or rules; path can be a function, worked out when the request arrives.
// hint: what the Hint button shows ({method, path, query, body}; path and body can be functions).
//   For now every hint is the full solution.
const levels = [
  {
    id: 1,
    title: 'All spots',
    story: 'Show every parking spot in the lot.',
    solutions: [{ method: 'GET', path: '/api/spots', status: 200 }],
    hint: { method: 'GET', path: '/api/spots' },
  },
  {
    id: 2,
    title: 'One spot',
    story: 'Show the details of spot 107.',
    solutions: [{ method: 'GET', path: '/api/spots/107', status: 200 }],
    hint: { method: 'GET', path: '/api/spots/107' },
  },
  {
    id: 3,
    title: 'Free on floor 2',
    story: 'Show only the free spots on floor 2.',
    solutions: [{ method: 'GET', path: '/api/spots', query: { floor: '2', status: 'free' }, status: 200 }],
    hint: { method: 'GET', path: '/api/spots', query: { floor: '2', status: 'free' } },
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
    hint: { method: 'GET', path: '/api/spots', query: { size: 'ev', status: 'free', sortBy: 'price', order: 'asc' } },
  },
  {
    id: 5,
    title: 'Closed for repairs',
    story: 'Spot 110 is broken. Close it for repairs.',
    solutions: [{ method: 'PATCH', path: '/api/spots/110', body: { status: 'closed' }, status: 200 }],
    hint: { method: 'PATCH', path: '/api/spots/110', body: { status: 'closed' } },
  },
  {
    id: 6,
    title: 'An EV arrives',
    story: `An electric car with plate ${EV_PLATE} parks in charger spot 106. Register it.`,
    solutions: [{ method: 'POST', path: '/api/sessions', body: { plate: EV_PLATE, spotId: 106, ev: true }, status: 201 }],
    hint: { method: 'POST', path: '/api/sessions', body: { plate: EV_PLATE, spotId: 106, ev: true } },
  },
  {
    id: 7,
    title: 'Charging',
    story: 'The car from the previous level charged 20 kWh. Record it on its ticket.',
    solutions: [{ method: 'PATCH', path: () => sessionPath(106), body: { chargedKwh: 20 }, status: 200 }],
    hint: { method: 'PATCH', path: () => sessionPath(106), body: { chargedKwh: 20 } },
  },
  {
    id: 8,
    title: 'The bill',
    story: 'The driver wants to leave. How much do they owe?',
    solutions: [
      { method: 'GET', path: () => sessionPath(106), status: 200 },
      { method: 'GET', path: '/api/spots/106/session', status: 200 },
    ],
    hint: { method: 'GET', path: () => sessionPath(106) },
  },
  {
    id: 9,
    title: 'Paying',
    story: 'The driver pays what is due.',
    // the API itself refuses less than what is due (402), so any number that gets a 200 is enough
    solutions: [{ method: 'POST', path: () => sessionPath(106, '/payment'), body: { amount: (amount) => typeof amount === 'number' }, status: 200 }],
    hint: {
      method: 'POST',
      path: () => sessionPath(106, '/payment'),
      body: () => ({ amount: calculateAmount(db.findSessionInSpot(106)) }), // the amount due right now
    },
  },
  {
    id: 10,
    title: 'Leaving',
    story: 'The car leaves the lot.',
    solutions: [{ method: 'DELETE', path: () => sessionPath(106), status: 204 }],
    hint: { method: 'DELETE', path: () => sessionPath(106) },
  },
  {
    id: 11,
    title: 'Who is there?',
    story: 'Who is parked in spot 107 right now?',
    solutions: [{ method: 'GET', path: '/api/spots/107/session', status: 200 }],
    hint: { method: 'GET', path: '/api/spots/107/session' },
  },
  {
    id: 12,
    title: 'No free rides',
    story: 'The car from the previous level tries to leave without paying. Try it and see what the server says.',
    solutions: [{ method: 'DELETE', path: '/api/sessions/3', status: 409 }],
    hint: { method: 'DELETE', path: '/api/sessions/3' },
  },
  {
    id: 13,
    title: 'Closed means closed',
    story: 'A driver tries to park in spot 110, which is closed for repairs. Try it.',
    solutions: [{ method: 'POST', path: '/api/sessions', body: { plate: isNonEmptyString, spotId: 110 }, status: 409 }],
    hint: { method: 'POST', path: '/api/sessions', body: { plate: '98-765-43', spotId: 110 } },
  },
];

function findLevel(id) {
  return levels.find((level) => level.id === Number(id));
}

function publicInfo(level) {
  return { id: level.id, title: level.title, story: level.story };
}

// the level's solutions with every path worked out for the current state of the lot
function currentSolutions(level) {
  return level.solutions.map((solution) => ({
    ...solution,
    path: typeof solution.path === 'function' ? solution.path() : solution.path,
  }));
}

// the level's hint, worked out for the current state of the lot
function hint(level) {
  const { method, path, query = {}, body = null } = level.hint;
  return {
    method,
    path: typeof path === 'function' ? path() : path,
    query,
    body: typeof body === 'function' ? body() : body,
  };
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

  // worked out now, before the request changes the lot (e.g. level 10 deletes the session)
  const solutions = currentSolutions(level);
  const request = {
    method: req.method,
    path: (req.baseUrl + req.path).replace(/(.)\/$/, '$1'), // the cleaned path; "/api/spots/" counts as "/api/spots"
    query: req.query,
    body: req.body,
  };
  onHeaders(res, () => {
    const passed = solutions.some((solution) => isSolution(solution, request, res.statusCode));
    res.setHeader('X-Level-Passed', String(passed));
    res.setHeader('X-Level-Message', passed ? 'Correct!' : 'Not quite, try again');
  });
  next();
}

module.exports = { levels, findLevel, publicInfo, hint, checkLevel };
