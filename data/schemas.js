// Resource schemas, rendered by the /schemas page (views/schemas.ejs).
module.exports = [
  {
    name: 'spot',
    path: '/api/spots',
    fields: [
      { name: 'id', type: 'number', description: 'Spot number, e.g. 107 (floor 1, spot 7)' },
      { name: 'floor', type: 'number', description: '1, 2 or 3' },
      { name: 'size', type: 'string', description: '"standard" or "ev"' },
      { name: 'covered', type: 'boolean', description: 'Has a roof' },
      { name: 'handicap', type: 'boolean', description: 'Reserved for cars with a handicap permit' },
      { name: 'charger', type: 'object or null', description: '{ powerKw: number, pricePerKwh: number }, or null if no charger' },
      { name: 'status', type: 'string', description: '"free", "occupied" or "closed"' },
    ],
  },
  {
    name: 'session',
    path: '/api/sessions',
    fields: [
      { name: 'id', type: 'number', description: 'Ticket number' },
      { name: 'plate', type: 'string', description: 'License plate, e.g. "12-345-67"' },
      { name: 'spotId', type: 'number', description: 'The spot the car is parked in' },
      { name: 'ev', type: 'boolean', description: 'Electric car' },
      { name: 'handicap', type: 'boolean', description: 'Car has a handicap permit' },
      { name: 'startedAt', type: 'string (ISO date)', description: 'When the car parked' },
      { name: 'paid', type: 'boolean', description: 'The ticket is paid' },
      { name: 'chargedKwh', type: 'number', description: 'Energy charged, in kWh' },
      { name: 'amount', type: 'number', description: 'What the car owes: entry fee + charging + penalties' },
    ],
  },
  {
    name: 'level',
    path: '/api/levels',
    fields: [
      { name: 'id', type: 'number', description: 'Level number, 1 to 13' },
      { name: 'title', type: 'string', description: 'Short level name' },
      { name: 'story', type: 'string', description: 'What the player has to do' },
    ],
  },
  {
    name: 'hint',
    path: '/api/levels/:id/hint',
    fields: [
      { name: 'method', type: 'string', description: 'HTTP method, e.g. "GET"' },
      { name: 'path', type: 'string', description: 'Address, e.g. "/api/spots"' },
      { name: 'query', type: 'object', description: 'Query parameters, e.g. { floor: "2" } (empty if none)' },
      { name: 'body', type: 'object or null', description: 'JSON body, or null if none' },
    ],
  },
];
