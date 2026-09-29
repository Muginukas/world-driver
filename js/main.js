// Entry point. Called once the player dismisses the intro overlay
// (Three.js is already loaded by then via a plain, synchronous <script>
// tag in index.html, so `THREE` is available with no callback dance).

const pressedKeys = new Set();
let renderer, scene, camera, player, traffic;
let minimapCamera, playerMarker;
let ramps = [];
let lastFrameTime = null;
let pointerLocked = false;

const WALK_FOV = 70;
const DRIVE_FOV = 78;
const LOOK_SENSITIVITY = 0.0022; // mouse (pointer lock)
const TOUCH_LOOK_SENSITIVITY = 0.005;
const KEY_LOOK_RATE = 1.8; // rad/s, arrow-key look fallback

// Minimap: rendered as a second pass into a small scissored viewport of
// the same canvas, matching #minimap-frame's CSS position/size exactly.
const MINIMAP_SIZE = 140; // CSS px, must match #minimap-frame in style.css
const MINIMAP_MARGIN_LEFT = 12;
const MINIMAP_MARGIN_TOP = 56;
const MINIMAP_VIEW_HALF = 80; // metres shown from center to edge

// A small marker representing the player on the minimap. Lives on
// THREE layer 1 only, so the main first-person camera (layer 0) never
// renders it, while the minimap camera (layers 0+1) always does.
function buildPlayerMarker() {
  const group = new THREE.Group();

  const dot = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 0.4, 12),
    new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false })
  );
  group.add(dot);

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.4, 2.4),
    new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false })
  );
  nose.position.set(0, 0, -1.7); // toward -Z = forward, matches heading 0
  group.add(nose);

  // renderOrder/layers must be set per-mesh, not just on the parent
  // group: Three.js reads each renderable object's own value, not an
  // inherited one.
  group.traverse((obj) => {
    obj.layers.set(1);
    obj.renderOrder = 999;
  });
  return group;
}

function initGame() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(WALK_FOV, window.innerWidth / window.innerHeight, 0.1, 400);

  minimapCamera = new THREE.OrthographicCamera(
    -MINIMAP_VIEW_HALF, MINIMAP_VIEW_HALF, MINIMAP_VIEW_HALF, -MINIMAP_VIEW_HALF, 1, 500
  );
  minimapCamera.position.set(0, 150, 0);
  minimapCamera.rotation.order = 'YXZ';
  minimapCamera.rotation.x = -Math.PI / 2; // look straight down, fixed north-up
  minimapCamera.layers.enable(1);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  document.getElementById('game-container').appendChild(renderer.domElement);

  window.addEventListener('resize', onResize);

  player = new Player(camera, { x: 0, z: 0 });
  traffic = new TrafficManager(scene);

  playerMarker = buildPlayerMarker();
  scene.add(playerMarker);

  resolveTrafficRoutes((latLngPaths) => {
    const projected = latLngPaths.map((path) => path.map((p) => toLocal(START_POSITION, p)));
    buildWorld(scene, projected);
    const parkedLocal = PARKED_CARS.map((p) => toLocal(START_POSITION, p));
    traffic.init(projected, parkedLocal);
    ramps = buildRamps(scene);
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
    if (!pointerLocked) return;
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
//
// Tracked by the specific finger's touch identifier, not just "how many
// touches are on screen" — e.touches counts every active touch on the
// whole page, so holding a D-pad button (1 touch there) while dragging
// to look (a 2nd finger, here) must not get rejected just because the
// page-wide total is 2.
function bindLookZone() {
  const zone = document.getElementById('look-zone');
  let activeTouchId = null;
  let last = null;

  const findTouch = (touchList, id) => {
    for (let i = 0; i < touchList.length; i++) {
      if (touchList[i].identifier === id) return touchList[i];
    }
    return null;
  };

  zone.addEventListener('touchstart', (e) => {
    if (activeTouchId !== null) return; // already tracking a look-drag finger
    const t = e.changedTouches[0];
    activeTouchId = t.identifier;
    last = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  zone.addEventListener('touchmove', (e) => {
    if (activeTouchId === null) return;
    const t = findTouch(e.changedTouches, activeTouchId);
    if (!t) return; // this event is about some other finger
    const dx = t.clientX - last.x;
    const dy = t.clientY - last.y;
    last = { x: t.clientX, y: t.clientY };
    player.look(-dx * TOUCH_LOOK_SENSITIVITY, -dy * TOUCH_LOOK_SENSITIVITY);
    e.preventDefault();
  }, { passive: false });

  const releaseIfOurs = (e) => {
    if (findTouch(e.changedTouches, activeTouchId)) {
      activeTouchId = null;
      last = null;
    }
  };
  zone.addEventListener('touchend', releaseIfOurs);
  zone.addEventListener('touchcancel', releaseIfOurs);
}

function handleInteract() {
  const cockpitFrame = document.getElementById('cockpit-frame');

  if (player.isDriving) {
    const vehicle = player.exitVehicle();
    traffic.onVehicleExited(vehicle);
    HUD.setMode(false);
    cockpitFrame.classList.add('hidden');
    camera.fov = WALK_FOV;
    camera.updateProjectionMatrix();
  } else {
    const vehicle = traffic.findEnterable(player.position);
    if (vehicle) {
      player.enterVehicle(vehicle);
      traffic.onVehicleEntered(vehicle);
      HUD.setMode(true);
      cockpitFrame.classList.remove('hidden');
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
// primary look input, and work the same whether walking or driving).
// Disabled while driving specifically because arrows double as the
// steering fallback there (see vehicles.js) — using them for look too
// would fight the steering input.
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
    checkRampLaunch(player.vehicle, ramps);
    traffic.update(dt, player.vehicle);
    HUD.updateSpeed(player.vehicle.speedKmh);
    // A bit of extra FOV at high speed sells how fast the car is going.
    const speedFraction = Math.min(1, player.vehicle.speedKmh / 50);
    camera.fov = DRIVE_FOV + speedFraction * 35;
    camera.updateProjectionMatrix();
  } else {
    player.updateWalking(dt, pressedKeys);
    traffic.update(dt, null);
  }

  player.updateCamera();
  updatePrompt();
  updateMinimapMarker();

  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
  renderer.render(scene, camera);

  renderMinimap();

  requestAnimationFrame(tick);
}

function updateMinimapMarker() {
  const pos = player.isDriving ? player.vehicle.position : player.position;
  const heading = player.isDriving ? player.vehicle.heading : player.yaw;

  playerMarker.position.set(pos.x, 2, pos.z);
  playerMarker.rotation.y = heading;

  minimapCamera.position.x = pos.x;
  minimapCamera.position.z = pos.z;
}

function renderMinimap() {
  const dpr = renderer.getPixelRatio();
  const size = MINIMAP_SIZE * dpr;
  const x = MINIMAP_MARGIN_LEFT * dpr;
  const y = renderer.domElement.height - MINIMAP_MARGIN_TOP * dpr - size; // CSS top -> WebGL bottom-left origin

  renderer.setViewport(x, y, size, size);
  renderer.setScissor(x, y, size, size);
  renderer.setScissorTest(true);

  // The main view's distance fog would otherwise wash out a flat
  // top-down camera ~150m up (well inside the fog's near/far range) —
  // drop it just for this pass so the minimap stays crisp.
  const savedFog = scene.fog;
  scene.fog = null;
  renderer.render(scene, minimapCamera);
  scene.fog = savedFog;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('setup-overlay').classList.add('hidden');
    initGame();
  });
});
