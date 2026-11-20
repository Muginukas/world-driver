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

  updateHealth(hp) {
    if (!this.healthFillEl) this.healthFillEl = document.getElementById('health-fill');
    const pct = Math.max(0, Math.min(100, hp));
    this.healthFillEl.style.width = pct + '%';
    this.healthFillEl.style.background = pct > 50 ? '#2ecc71' : pct > 25 ? '#f1c40f' : '#e74c3c';
  },

  // Brief red flash around the screen edges when you get hit.
  flashHurt() {
    const el = document.getElementById('hurt-flash');
    el.classList.add('show');
    clearTimeout(this.hurtTimer);
    this.hurtTimer = setTimeout(() => el.classList.remove('show'), 180);
  },

  updateGuards(n) {
    if (!this.guardsEl) this.guardsEl = document.getElementById('guard-count');
    this.guardsEl.textContent = n;
  },

  // A short message in the middle of the screen for a couple of seconds.
  toast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  },

  showDeath(show) {
    document.getElementById('death-overlay').classList.toggle('hidden', !show);
  },

  showPrompt(text) {
    this.promptEl.textContent = text;
    this.promptEl.classList.remove('hidden');
  },

  hidePrompt() {
    this.promptEl.classList.add('hidden');
  },
};
