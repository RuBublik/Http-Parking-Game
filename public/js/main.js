import { UI } from './ui.js';
import { Game } from './game.js';

document.addEventListener('DOMContentLoaded', () => {
  const ui = new UI();
  const game = new Game(ui);

  ui.elements.sendBtn.addEventListener('click', () => game.sendRequest());
  ui.elements.hintBtn.addEventListener('click', () => game.getHint());
  ui.elements.resetBtn.addEventListener('click', () => game.resetGame());
  ui.elements.nextBtn.addEventListener('click', () => game.nextLevel());
  ui.elements.prevBtn.addEventListener('click', () => game.prevLevel());
  game.init();
});