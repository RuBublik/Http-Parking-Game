// In-memory "database", loaded from seed.json. Changes are lost on reload.
const seed = require('./seed.json');

const db = {
  reset() {
    this.spots = structuredClone(seed.spots);
    this.sessions = structuredClone(seed.sessions);
    this.nextSessionId = Math.max(0, ...this.sessions.map((s) => s.id)) + 1; // ids are never reused
  },

  findSpot(id) {
    return this.spots.find((spot) => spot.id === Number(id));
  },

  findSession(id) {
    return this.sessions.find((session) => session.id === Number(id));
  },
};

db.reset();

module.exports = db;
