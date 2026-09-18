/**
 * Game Engine - Manages game lifecycle, logic and API network requests.
 */
export class Game {
  constructor(ui) {
    this.ui = ui;
    this.levels = [];
    this.currentLevelIndex = 0;
    this.highestUnlockedLevel = 0;
    this.solvedStates = {};
  }

  async init() {
    this.ui.setControlsEnabled(false);
    await this.resetGame();
    await this.loadLevels();
    this.ui.setControlsEnabled(this.levels.length > 0);
  }

  async loadLevels() {
    try {
      const res = await fetch('/api/levels');
      this.levels = await res.json();
      this.startCurrentLevel();
    } catch (err) {
      console.error('Failed to load levels:', err);
      this.ui.showMessage('Could not load the levels, refresh the page');
    }
  }

  startCurrentLevel() {
    const currentLevel = this.levels[this.currentLevelIndex];
    this.ui.renderLevel(currentLevel, this.levels.length);

    this.ui.updateNavButtons(this.currentLevelIndex, this.highestUnlockedLevel, this.levels.length);

    if (this.solvedStates[this.currentLevelIndex]) {
      this.ui.setBuilderState(this.solvedStates[this.currentLevelIndex]);
      const isLastLevel = this.currentLevelIndex === this.levels.length - 1;
      this.ui.renderVerdict(true, "Level already solved! (Viewing your past solution)", isLastLevel);
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
      if (passed) {
        this.solvedStates[this.currentLevelIndex] = this.ui.getBuilderState();
        this.highestUnlockedLevel = Math.max(this.highestUnlockedLevel, this.currentLevelIndex + 1);
        this.ui.updateNavButtons(this.currentLevelIndex, this.highestUnlockedLevel, this.levels.length);

        const isLastLevel = this.currentLevelIndex === this.levels.length - 1;
        if (isLastLevel) {
          this.ui.renderVerdict(true, "Great job! You've completed all stages of the game!",true);
        }else{
          this.ui.renderVerdict(passed, message);
        }
      }
      else{
        this.ui.renderVerdict(false, message);
      }
    } catch (err) {
      this.ui.renderVerdict(false, 'Failed to send network request')
    }
  }

  async getHint() {
    const currentLevel = this.levels[this.currentLevelIndex];
    try {
      const res = await fetch(`/api/levels/${currentLevel.id}/hint`);
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      const hint = await res.json();
      this.ui.fillBuilderFromHint(hint);
    } catch (err) {
      console.error('Failed to fetch hint:', err);
      this.ui.showMessage('Could not load the hint, try again');
    }
  }

  async resetGame() {
    try {
      await fetch('/api/reset', { method: 'POST' });
      this.currentLevelIndex = 0;
      this.highestUnlockedLevel = 0;
      this.solvedStates = {};
      if (this.levels.length > 0) {
        this.startCurrentLevel();
      }
    } catch (err) {
      console.error('Failed to reset game:', err);
    }
  }

  prevLevel() {
    if (this.currentLevelIndex > 0) {
      this.currentLevelIndex--;
      this.startCurrentLevel();
    }
  }
  nextLevel() {
    if (this.currentLevelIndex < this.levels.length - 1) {
      this.currentLevelIndex++;
      this.startCurrentLevel();
    }
  }
}