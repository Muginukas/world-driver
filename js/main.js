// Entry point. `initGame` is invoked by the Maps JS API script tag
// (see config.js) once google.maps is ready.

const pressedKeys = new Set();
let map, player, traffic;
let lastFrameTime = null;

function initGame() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: LITHUANIA_CENTER,
    zoom: 18,
    tilt: 0,
    disableDefaultUI: true,
    clickableIcons: false,
  });

  HUD.init();
  HUD.setMode(false);

  player = new Player(map, START_POSITION);
  traffic = new TrafficManager(map);

  map.setCenter(player.currentPosition);

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

  map.setCenter(player.currentPosition);
  updatePrompt();

  requestAnimationFrame(tick);
}
