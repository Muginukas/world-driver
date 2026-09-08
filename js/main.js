// Entry point. Called once the player dismisses the intro overlay
// (Three.js is already loaded by then via a plain, synchronous <script>
// tag in index.html, so `THREE` is available with no callback dance).

const pressedKeys = new Set();
let renderer, scene, camera, player, traffic;
let lastFrameTime = null;
let pointerLocked = false;

const WALK_FOV = 70;
const DRIVE_FOV = 78;
const LOOK_SENSITIVITY = 0.0022; // mouse (pointer lock)
const TOUCH_LOOK_SENSITIVITY = 0.005;
const KEY_LOOK_RATE = 1.8; // rad/s, arrow-key look fallback

function initGame() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(WALK_FOV, window.innerWidth / window.innerHeight, 0.1, 400);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  document.getElementById('game-container').appendChild(renderer.domElement);

  window.addEventListener('resize', onResize);

  player = new Player(camera, { x: 0, z: 0 });
  traffic = new TrafficManager(scene);

  resolveTrafficRoutes((latLngPaths) => {
    const projected = latLngPaths.map((path) => path.map((p) => toLocal(START_POSITION, p)));
    buildWorld(scene, projected);
    const parkedLocal = PARKED_CARS.map((p) => toLocal(START_POSITION, p));
    traffic.init(projected, parkedLocal);
  });

  HUD.init();
  HUD.setMode(false);

  bindInput();
  bindTouchControls();
  bindLookZone();

  requestAnimationFrame(tick);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function bindInput() {
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'e') {
      if (!e.repeat) handleInteract();
      return;
    }
    pressedKeys.add(key);
  });

  window.addEventListener('keyup', (e) => pressedKeys.delete(e.key.toLowerCase()));

  // #look-zone visually covers the canvas (it needs to sit on top to
  // catch touch-look drags), so it's the element that actually receives
  // desktop clicks too — hook pointer-lock activation there instead of
  // on the canvas itself.
  document.getElementById('look-zone').addEventListener('click', () => {
    if (renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
  });

  document.addEventListener('mousemove', (e) => {
    if (!pointerLocked || player.isDriving) return;
    player.look(-e.movementX * LOOK_SENSITIVITY, -e.movementY * LOOK_SENSITIVITY);
  });
}

// On-screen D-pad + action button. They just add/remove the same key
// strings the keyboard handler uses, so every movement/driving rule
// above works unchanged regardless of input source.
function bindHoldButton(id, keys) {
  const el = document.getElementById(id);

  const press = (e) => {
    e.preventDefault();
    keys.forEach((k) => pressedKeys.add(k));
  };
  const release = (e) => {
    e.preventDefault();
    keys.forEach((k) => pressedKeys.delete(k));
  };

  el.addEventListener('touchstart', press, { passive: false });
  el.addEventListener('touchend', release, { passive: false });
  el.addEventListener('touchcancel', release, { passive: false });
  el.addEventListener('mousedown', press);
  el.addEventListener('mouseup', release);
  el.addEventListener('mouseleave', release);
}

function bindTouchControls() {
  bindHoldButton('btn-up', ['w']);
  bindHoldButton('btn-down', ['s']);
  bindHoldButton('btn-left', ['a']);
  bindHoldButton('btn-right', ['d']);

  const actionBtn = document.getElementById('btn-action');
  actionBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleInteract();
  }, { passive: false });
  actionBtn.addEventListener('click', () => handleInteract());
}

// Touch-drag anywhere on screen looks around (like mouse-look on
// desktop). The D-pad/action button sit visually on top of this layer,
// so touches starting on them go to their own handlers instead.
function bindLookZone() {
  const zone = document.getElementById('look-zone');
  let last = null;

  zone.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    last = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  zone.addEventListener('touchmove', (e) => {
    if (!last || e.touches.length !== 1 || player.isDriving) return;
    const t = e.touches[0];
    const dx = t.clientX - last.x;
    const dy = t.clientY - last.y;
    last = { x: t.clientX, y: t.clientY };
    player.look(-dx * TOUCH_LOOK_SENSITIVITY, -dy * TOUCH_LOOK_SENSITIVITY);
    e.preventDefault();
  }, { passive: false });

  const clearLast = () => { last = null; };
  zone.addEventListener('touchend', clearLast);
  zone.addEventListener('touchcancel', clearLast);
}

function handleInteract() {
  if (player.isDriving) {
    const vehicle = player.exitVehicle();
    traffic.onVehicleExited(vehicle);
    HUD.setMode(false);
    camera.fov = WALK_FOV;
    camera.updateProjectionMatrix();
  } else {
    const vehicle = traffic.findEnterable(player.position);
    if (vehicle) {
      player.enterVehicle(vehicle);
      traffic.onVehicleEntered(vehicle);
      HUD.setMode(true);
      camera.fov = DRIVE_FOV;
      camera.updateProjectionMatrix();
    }
  }
}

function updatePrompt() {
  const actionBtn = document.getElementById('btn-action');

  if (player.isDriving) {
    HUD.hidePrompt();
    actionBtn.textContent = 'Išlipti';
    actionBtn.classList.remove('disabled');
    return;
  }

  const nearby = traffic.findEnterable(player.position);
  if (nearby) {
    HUD.showPrompt('Paspausk E — įlipti į mašiną');
    actionBtn.textContent = 'Įlipti';
    actionBtn.classList.remove('disabled');
  } else {
    HUD.hidePrompt();
    actionBtn.textContent = 'E';
    actionBtn.classList.add('disabled');
  }
}

// Arrow keys as a keyboard-only look fallback (mouse/touch-drag are the
// primary look input). Disabled while driving, where the camera is
// locked to the vehicle's own heading.
function updateKeyboardLook(dt) {
  if (player.isDriving) return;
  let deltaYaw = 0;
  let deltaPitch = 0;
  if (pressedKeys.has('arrowleft')) deltaYaw += KEY_LOOK_RATE * dt;
  if (pressedKeys.has('arrowright')) deltaYaw -= KEY_LOOK_RATE * dt;
  if (pressedKeys.has('arrowup')) deltaPitch += KEY_LOOK_RATE * dt;
  if (pressedKeys.has('arrowdown')) deltaPitch -= KEY_LOOK_RATE * dt;
  if (deltaYaw || deltaPitch) player.look(deltaYaw, deltaPitch);
}

function tick(now) {
  if (lastFrameTime === null) lastFrameTime = now;
  let dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  dt = Math.min(dt, 0.1); // guard against tab-switch stalls

  updateKeyboardLook(dt);

  if (player.isDriving) {
    player.vehicle.updateDriven(dt, pressedKeys);
    traffic.update(dt, player.vehicle);
    HUD.updateSpeed(player.vehicle.speedKmh);
  } else {
    player.updateWalking(dt, pressedKeys);
    traffic.update(dt, null);
  }

  player.updateCamera();
  updatePrompt();

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('setup-overlay').classList.add('hidden');
    initGame();
  });
});
