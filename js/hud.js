// DOM/HUD glue: hands sway while walking, speedometer while driving,
// and the contextual "press E" prompt.

const HUD = {
  handsEl: null,
  handLeft: null,
  handRight: null,
  driveHudEl: null,
  speedValueEl: null,
  promptEl: null,
  modeLabelEl: null,

  stepPhase: 0, // seconds accumulated for the walk-cycle
  STEP_PERIOD: 0.55,

  init() {
    this.handsEl = document.getElementById('hands-hud');
    this.handLeft = document.querySelector('.hand-left');
    this.handRight = document.querySelector('.hand-right');
    this.driveHudEl = document.getElementById('drive-hud');
    this.speedValueEl = document.getElementById('speed-value');
    this.promptEl = document.getElementById('prompt');
    this.modeLabelEl = document.getElementById('mode-label');
  },

  setMode(isDriving) {
    this.handsEl.classList.toggle('hidden', isDriving);
    this.driveHudEl.classList.toggle('hidden', !isDriving);
    this.modeLabelEl.textContent = isDriving ? 'Vairavimas' : 'Vaikščiojimas';
  },

  updateWalkingHands(dt, isMoving) {
    if (!isMoving) {
      this.handLeft.classList.remove('step-a', 'step-b');
      this.handRight.classList.remove('step-a', 'step-b');
      return;
    }
    this.stepPhase += dt;
    const phase = this.stepPhase % this.STEP_PERIOD < this.STEP_PERIOD / 2 ? 'a' : 'b';
    const other = phase === 'a' ? 'b' : 'a';
    this.handLeft.classList.add(`step-${phase}`);
    this.handLeft.classList.remove(`step-${other}`);
    this.handRight.classList.add(`step-${other}`);
    this.handRight.classList.remove(`step-${phase}`);
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
