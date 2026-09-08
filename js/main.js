// Entry point. Called once the player dismisses the intro overlay
// (Leaflet is already loaded by then via a plain, synchronous <script>
// tag in index.html, so `L` is available with no callback dance needed).

const pressedKeys = new Set();
let map, player, traffic;
let lastFrameTime = null;

function initGame() {
  map = L.map('map', {
    center: [LITHUANIA_CENTER.lat, LITHUANIA_CENTER.lng],
    zoom: 18,
    maxZoom: 19,
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    attributionControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  HUD.init();
  HUD.setMode(false);

  player = new Player(map, START_POSITION);
  traffic = new TrafficManager(map);

  resolveTrafficRoutes((paths) => {
    traffic.init(paths, PARKED_CARS);
  });

  bindInput();
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

function handleInteract() {
  if (player.isDriving) {
    const vehicle = player.exitVehicle();
    traffic.onVehicleExited(vehicle);
    HUD.setMode(false);
  } else {
    const vehicle = traffic.findEnterable(player.position);
    if (vehicle) {
      player.enterVehicle(vehicle);
      traffic.onVehicleEntered(vehicle);
      HUD.setMode(true);
    }
  }
}

function updatePrompt() {
  if (player.isDriving) {
    HUD.hidePrompt();
    return;
  }
  const nearby = traffic.findEnterable(player.position);
  if (nearby) {
    HUD.showPrompt('Paspausk E — įlipti į mašiną');
  } else {
    HUD.hidePrompt();
  }
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

  const pos = player.currentPosition;
  map.panTo([pos.lat, pos.lng], { animate: false });
  updatePrompt();

  requestAnimationFrame(tick);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('setup-overlay').classList.add('hidden');
    initGame();
  });
});
