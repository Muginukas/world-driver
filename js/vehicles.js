// Vehicle: either an ambient NPC car following a road-snapped path back
// and forth ("constant traffic"), or a car under direct player control.

const CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c'];

const NPC_SPEED_MPS = 8; // ~29 km/h ambient city traffic speed
const ENTER_RADIUS_M = 14;

const DRIVE_MAX_SPEED_MPS = 25; // ~90 km/h
const DRIVE_ACCEL = 6; // m/s^2
const DRIVE_BRAKE = 10; // m/s^2
const DRIVE_FRICTION = 3; // m/s^2 natural decel when coasting
const DRIVE_TURN_RATE = 55; // deg/s at full speed

function carSymbol(color, headingDeg) {
  return {
    path: 'M 0,-14 L 6,-6 L 6,12 L -6,12 L -6,-6 Z',
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#1c1c1c',
    strokeWeight: 1.5,
    scale: 1.4,
    rotation: headingDeg,
    anchor: new google.maps.Point(0, 0),
  };
}

class Vehicle {
  constructor(map, position, color) {
    this.map = map;
    this.position = position instanceof google.maps.LatLng
      ? position
      : new google.maps.LatLng(position.lat, position.lng);
    this.heading = 0;
    this.speed = 0; // signed, m/s (negative = reversing)
    this.color = color;

    // NPC route state (null when parked / player-controlled)
    this.route = null;
    this.routeIndex = 0;
    this.routeDir = 1; // 1 forward, -1 ping-pong back

    this.driven = false; // true while the player is inside

    this.marker = new google.maps.Marker({
      position: this.position,
      map,
      icon: carSymbol(color, this.heading),
      zIndex: 5,
    });
  }

  setRoute(path, startIndex = 0) {
    this.route = path;
    this.routeIndex = Math.min(startIndex, path.length - 1);
    this.routeDir = 1;
    if (path.length > 1) {
      const next = path[this.routeIndex + 1] || path[this.routeIndex - 1];
      this.position = path[this.routeIndex];
      this.heading = next ? Geo.heading(this.position, next) : 0;
      if (!path[this.routeIndex + 1]) this.routeDir = -1; // started at the far end
    }
  }

  updateNpc(dt) {
    if (!this.route || this.route.length < 2) return;

    let target = this.route[this.routeIndex + this.routeDir];
    if (!target) {
      // reached an end of the path - bounce back the other way
      this.routeDir *= -1;
      target = this.route[this.routeIndex + this.routeDir];
      if (!target) return;
    }

    const distToTarget = Geo.distance(this.position, target);
    const step = NPC_SPEED_MPS * dt;
    this.heading = Geo.heading(this.position, target);

    if (step >= distToTarget) {
      this.position = target;
      this.routeIndex += this.routeDir;
    } else {
      this.position = Geo.offset(this.position, step, this.heading);
    }

    this.render();
  }

  // Manual driving physics, used while the player is inside this vehicle.
  updateDriven(dt, keys) {
    const throttle = keys.has('w') || keys.has('arrowup');
    const brake = keys.has('s') || keys.has('arrowdown');
    const left = keys.has('a') || keys.has('arrowleft');
    const right = keys.has('d') || keys.has('arrowright');

    if (throttle) {
      this.speed += DRIVE_ACCEL * dt;
    } else if (brake) {
      this.speed -= DRIVE_BRAKE * dt;
    } else if (this.speed > 0) {
      this.speed = Math.max(0, this.speed - DRIVE_FRICTION * dt);
    } else if (this.speed < 0) {
      this.speed = Math.min(0, this.speed + DRIVE_FRICTION * dt);
    }

    this.speed = Math.max(-DRIVE_MAX_SPEED_MPS / 2, Math.min(DRIVE_MAX_SPEED_MPS, this.speed));

    if (Math.abs(this.speed) > 0.05) {
      const turnFactor = Math.min(1, Math.abs(this.speed) / (DRIVE_MAX_SPEED_MPS * 0.4));
      const dir = this.speed >= 0 ? 1 : -1;
      if (left) this.heading -= DRIVE_TURN_RATE * turnFactor * dir * dt;
      if (right) this.heading += DRIVE_TURN_RATE * turnFactor * dir * dt;
      this.heading = (this.heading + 360) % 360;
    }

    if (Math.abs(this.speed) > 0.001) {
      this.position = Geo.offset(this.position, this.speed * dt, this.heading);
    }

    this.render();
  }

  render() {
    this.marker.setPosition(this.position);
    this.marker.setIcon(carSymbol(this.color, this.heading));
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  destroy() {
    this.marker.setMap(null);
  }
}

// Owns every Vehicle instance: ambient traffic + parked cars, spawning
// replacements so traffic density stays constant even as the player
// hops between cars.
class TrafficManager {
  constructor(map) {
    this.map = map;
    this.vehicles = [];
    this.pathsByRoute = [];
  }

  init(resolvedPaths, parkedCarSpecs) {
    this.pathsByRoute = resolvedPaths;

    resolvedPaths.forEach((path, routeIdx) => {
      for (let i = 0; i < CARS_PER_ROUTE; i++) {
        this.spawnOnRoute(routeIdx, i);
      }
    });

    parkedCarSpecs.forEach((spec) => {
      const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
      const v = new Vehicle(this.map, spec, color);
      this.vehicles.push(v);
    });
  }

  spawnOnRoute(routeIdx, offsetIndex) {
    const path = this.pathsByRoute[routeIdx];
    if (!path || path.length < 2) return;

    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const startIndex = Math.floor((offsetIndex / CARS_PER_ROUTE) * (path.length - 1));
    const v = new Vehicle(this.map, path[startIndex], color);
    v.setRoute(path, startIndex);
    v.sourceRoute = routeIdx;
    this.vehicles.push(v);
  }

  update(dt, driven) {
    for (const v of this.vehicles) {
      if (v === driven) continue; // player-controlled vehicle is updated separately
      if (v.route && !v.driven) v.updateNpc(dt);
    }
  }

  // Vehicle nearest to `pos` within ENTER_RADIUS_M that isn't already
  // being driven, or null.
  findEnterable(pos) {
    let best = null;
    let bestDist = ENTER_RADIUS_M;
    for (const v of this.vehicles) {
      if (v.driven) continue;
      const d = Geo.distance(pos, v.position);
      if (d <= bestDist) {
        best = v;
        bestDist = d;
      }
    }
    return best;
  }

  onVehicleEntered(vehicle) {
    vehicle.driven = true;
    // Pull it out of ambient NPC rotation and replace it so traffic
    // density on that route stays constant.
    if (vehicle.route) {
      vehicle.route = null;
      if (vehicle.sourceRoute !== undefined) {
        this.spawnOnRoute(vehicle.sourceRoute, Math.floor(Math.random() * CARS_PER_ROUTE));
      }
    }
  }

  onVehicleExited(vehicle) {
    vehicle.driven = false;
    vehicle.speed = 0;
    // Stays parked wherever the player left it; it can be re-entered later.
  }
}
