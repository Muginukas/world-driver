// Entry point. Called once the player dismisses the intro overlay
// (Leaflet is already loaded by then via a plain, synchronous <script>
// tag in index.html, so `L` is available with no callback dance needed).

const pressedKeys = new Set();
let map, player, traffic;
let lastFrameTime = null;

const WALK_ZOOM = 19;
const DRIVE_ZOOM = 17;
const WALK_LOOKAHEAD_M = 8; // how far "ahead" of the player the camera looks
const DRIVE_LOOKAHEAD_M = 20;

// #map is kept oversized (its own diagonal) so that rotating it to keep
// the player's heading pointing "up" never exposes empty corners.
function sizeMapLayer() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const diagonal = Math.ceil(Math.sqrt(vw * vw + vh * vh));

  const mapEl = document.getElementById('map');
  mapEl.style.width = `${diagonal}px`;
  mapEl.style.height = `${diagonal}px`;
  mapEl.style.left = `${Math.round((vw - diagonal) / 2)}px`;
  mapEl.style.top = `${Math.round((vh - diagonal) / 2)}px`;

  if (map) map.invalidateSize({ pan: false });
}

function initGame() {
  sizeMapLayer();

  map = L.map('map', {
    center: [LITHUANIA_CENTER.lat, LITHUANIA_CENTER.lng],
    zoom: WALK_ZOOM,
    maxZoom: 19,
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    attributionControl: false, // shown separately, non-rotated (see #osm-attribution)
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  window.addEventListener('resize', sizeMapLayer);
  window.addEventListener('orientationchange', sizeMapLayer);

  HUD.init();
  HUD.setMode(false);

  player = new Player(map, START_POSITION);
  traffic = new TrafficManager(map);

  resolveTrafficRoutes((paths) => {
    traffic.init(paths, PARKED_CARS);
  });

  bindInput();
  bindTouchControls();
  requestAnimationFrame(tick);
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

  window.addEventListener('keyup', (e) => {
    pressedKeys.delete(e.key.toLowerCase());
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

function handleInteract() {
  if (player.isDriving) {
    const vehicle = player.exitVehicle();
    traffic.onVehicleExited(vehicle);
    HUD.setMode(false);
    map.setZoom(WALK_ZOOM, { animate: false });
  } else {
    const vehicle = traffic.findEnterable(player.position);
    if (vehicle) {
      player.enterVehicle(vehicle);
      traffic.onVehicleEntered(vehicle);
      HUD.setMode(true);
      map.setZoom(DRIVE_ZOOM, { animate: false });
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

// Heading-up "first-person" camera: rotate the (oversized) map so the
// player's current heading always points to the top of the screen.
function updateCamera() {
  const heading = player.isDriving ? player.vehicle.heading : player.heading;
  const lookahead = player.isDriving ? DRIVE_LOOKAHEAD_M : WALK_LOOKAHEAD_M;
  // Pivot the view on a point *ahead* of the player (not on the player
  // themselves), so after rotation the player sits nearer the bottom
  // of the screen and more of what's ahead is visible above them.
  const camCenter = Geo.offset(player.currentPosition, lookahead, heading);

  document.getElementById('map').style.transform = `rotate(${-heading}deg)`;
  map.panTo([camCenter.lat, camCenter.lng], { animate: false });
}

function tick(now) {
  if (lastFrameTime === null) lastFrameTime = now;
  let dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  dt = Math.min(dt, 0.1); // guard against tab-switch stalls

  if (player.isDriving) {
    player.vehicle.updateDriven(dt, pressedKeys);
    traffic.update(dt, player.vehicle);
    HUD.updateSpeed(player.vehicle.speedKmh);
  } else {
    player.updateWalking(dt, pressedKeys);
    traffic.update(dt, null);
    HUD.updateWalkingHands(dt, player.isMoving);
  }

  updateCamera();
  updatePrompt();

  requestAnimationFrame(tick);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('setup-overlay').classList.add('hidden');
    initGame();
  });
});
