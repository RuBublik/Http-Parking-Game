/**
 * Game Engine - Manages game lifecycle, logic and API network requests.
 */
export class Game {
  constructor(ui) {
    this.ui = ui;
    this.levels = [];
    this.currentLevelIndex = 0;
  }

  async init() {
    await this.resetGame();
    await this.loadLevels();
  }

  async loadLevels() {
    try {
      const res = await fetch('/api/levels');
      this.levels = await res.json();
      this.startCurrentLevel();
    } catch (err) {
      console.error('Failed to load levels:', err);
    }
  }

  startCurrentLevel() {
    const currentLevel = this.levels[this.currentLevelIndex];
    if (currentLevel) {
      this.ui.renderLevel(currentLevel, this.levels.length);
    } else {
      this.ui.renderVerdict(true, 'כל הכבוד! סיימת את כל השלבים במשחק!');
    }
  }

  async sendRequest() {
    const { method, fullUrl, body } = this.ui.getRequestData();
    const currentLevel = this.levels[this.currentLevelIndex];

    const headers = {
      'X-Level-Id': currentLevel.id.toString()
    };

    const options = { method, headers };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      headers['Content-Type'] = 'application/json';
      options.body = body;
    }

    try {
      const response = await fetch(fullUrl, options);
      const data = await response.json().catch(() => ({}));

      this.ui.renderResponse(response.status, response.statusText, data);

      const passed = response.headers.get('X-Level-Passed') === 'true';
      const message = response.headers.get('X-Level-Message') || '';

      this.ui.renderVerdict(passed, message);
    } catch (err) {
      this.ui.renderResponse(500, 'Error', { error: 'Failed to send network request' });
    }
  }

  async getHint() {
    const currentLevel = this.levels[this.currentLevelIndex];
    try {
      const res = await fetch(`/api/levels/${currentLevel.id}/hint`);
      const hint = await res.json();
      this.ui.fillBuilderFromHint(hint);
    } catch (err) {
      console.error('Failed to fetch hint:', err);
    }
  }

  async resetGame() {
    try {
      await fetch('/api/reset', { method: 'POST' });
      this.currentLevelIndex = 0;
      if (this.levels.length > 0) {
        this.startCurrentLevel();
      }
    } catch (err) {
      console.error('Failed to reset game:', err);
    }
  }

  nextLevel() {
    if (this.currentLevelIndex < this.levels.length - 1) {
      this.currentLevelIndex++;
      this.startCurrentLevel();
    } else {
      this.ui.renderVerdict(true, 'כל הכבוד! סיימת את המשחק בהצלחה!');
    }
  }
}