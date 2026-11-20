// DOM/HUD glue: speedometer while driving, and the contextual "press E"
// prompt. Hands are a real 3D viewmodel now (see player.js), not DOM.

const HUD = {
  driveHudEl: null,
  speedValueEl: null,
  promptEl: null,
  modeLabelEl: null,

  init() {
    this.driveHudEl = document.getElementById('drive-hud');
    this.speedValueEl = document.getElementById('speed-value');
    this.promptEl = document.getElementById('prompt');
    this.modeLabelEl = document.getElementById('mode-label');
  },

  // The speedometer stays visible on foot too — you can run 50 km/h.
  setMode(isDriving) {
    this.modeLabelEl.textContent = isDriving ? 'Vairavimas' : 'Vaikščiojimas';
  },

  updateSpeed(kmh) {
    this.speedValueEl.textContent = Math.round(kmh);
  },

  showPrompt(text) {
    this.promptEl.textContent = text;
    this.promptEl.classList.remove('hidden');
  },

  hidePrompt() {
    this.promptEl.classList.add('hidden');
  },
};
