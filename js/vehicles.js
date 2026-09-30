// Vehicle: either an ambient NPC car following a road-snapped path back
// and forth ("constant traffic"), or a car under direct player control.
// Positions/headings now live in local 3D meters (see geo.js), not
// lat/lng — movement is plain vector math, no geodesy at runtime.

const CAR_COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x1abc9c];

const NPC_SPEED_MPS = 8; // ~29 km/h ambient city traffic speed
const ENTER_RADIUS_M = 6;

const DRIVE_MAX_SPEED_MPS = 50 / 3.6; // 50 km/h
const DRIVE_ACCEL = 45; // m/s^2
const DRIVE_BRAKE = 70; // m/s^2
const DRIVE_FRICTION = 8; // m/s^2 natural decel when coasting
const DRIVE_TURN_RATE = 1.0; // rad/s at full steering authority
const DRIVE_TURN_FULL_SPEED_MPS = 10; // speed at which steering reaches full authority (~36 km/h)

const JUMP_GRAVITY_MPS2 = 18; // only applied while airborne (see ramps.js)

const CAR_COLLISION_RADIUS = 1.6; // rough car half-size, for simple circle-vs-box building collision

// Point (x, z) vs. a list of building colliders {x, z, hw, hd, rotY} (see
// world.js) — each building is an axis-aligned box in its own rotated
// local frame, so the point is rotated into that frame before the box
// test. Used to stop a driven car dead instead of letting it drive
// through a building.
function collidesWithBuilding(x, z, buildings) {
  for (const b of buildings) {
    const dx = x - b.x;
    const dz = z - b.z;
    const cos = Math.cos(b.rotY);
    const sin = Math.sin(b.rotY);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    if (Math.abs(localX) <= b.hw + CAR_COLLISION_RADIUS && Math.abs(localZ) <= b.hd + CAR_COLLISION_RADIUS) {
      return true;
    }
  }
  return false;
}

// Simple blocky "Roblox-style" car: a body box, a lighter cabin box, and
// four dark wheel boxes. Modeled with its nose toward local -Z, matching
// forwardVec(0) — i.e. heading 0 means facing local -Z.
function buildCarMesh(colorHex) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.9, 4),
    new THREE.MeshLambertMaterial({ color: colorHex })
  );
  body.position.y = 0.55;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.6, 2),
    new THREE.MeshLambertMaterial({ color: 0xdfefff })
  );
  cabin.position.set(0, 1.15, -0.2);
  group.add(cabin);

  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const wheelGeo = new THREE.BoxGeometry(0.4, 0.4, 0.6);
  [
    [-0.95, 0.25, 1.3],
    [0.95, 0.25, 1.3],
    [-0.95, 0.25, -1.3],
    [0.95, 0.25, -1.3],
  ].forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, y, z);
    group.add(wheel);
  });

  return group;
}

class Vehicle {
  constructor(scene, position, colorHex) {
    this.scene = scene;
    this.position = { x: position.x, z: position.z };
    this.heading = 0;
    this.speed = 0; // signed, m/s (negative = reversing)
    this.y = 0; // height off the ground, for ramp jumps (see ramps.js)
    this.vy = 0; // vertical speed, m/s
    this.onRamp = false; // true while climbing a ramp's sloped surface (see ramps.js)
    this.color = colorHex;

    // NPC route state (null when parked / player-controlled)
    this.route = null;
    this.routeIndex = 0;
    this.routeDir = 1; // 1 forward, -1 ping-pong back

    this.driven = false; // true while the player is inside

    this.mesh = buildCarMesh(colorHex);
    scene.add(this.mesh);
    this.render();
  }

  setRoute(path, startIndex = 0) {
    this.route = path;
    this.routeIndex = Math.min(startIndex, path.length - 1);
    this.routeDir = 1;
    if (path.length > 1) {
      const next = path[this.routeIndex + 1] || path[this.routeIndex - 1];
      this.position = { x: path[this.routeIndex].x, z: path[this.routeIndex].z };
      this.heading = next ? headingTo(this.position, next) : 0;
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

    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const step = NPC_SPEED_MPS * dt;
    this.heading = headingTo(this.position, target);

    if (step >= dist) {
      this.position = { x: target.x, z: target.z };
      this.routeIndex += this.routeDir;
    } else if (dist > 0) {
      this.position.x += (dx / dist) * step;
      this.position.z += (dz / dist) * step;
    }

    this.render();
  }

  // Manual driving physics, used while the player is inside this vehicle.
  // `buildings`, if given, is the list of building colliders from
  // world.js — driving into one stops the car dead instead of passing
  // through it.
  updateDriven(dt, keys, buildings) {
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
      const turnFactor = Math.min(1, Math.abs(this.speed) / DRIVE_TURN_FULL_SPEED_MPS);
      const dir = this.speed >= 0 ? 1 : -1;
      if (left) this.heading += DRIVE_TURN_RATE * turnFactor * dir * dt;
      if (right) this.heading -= DRIVE_TURN_RATE * turnFactor * dir * dt;
    }

    if (Math.abs(this.speed) > 0.001) {
      const fwd = forwardVec(this.heading);
      const nextX = this.position.x + fwd.x * this.speed * dt;
      const nextZ = this.position.z + fwd.z * this.speed * dt;
      if (buildings && collidesWithBuilding(nextX, nextZ, buildings)) {
        this.speed = 0; // crashed - stop dead instead of driving through it
      } else {
        this.position.x = nextX;
        this.position.z = nextZ;
      }
    }

    // Ramp jump: once launched (vy set > 0 by updateRampPhysics, after
    // climbing a ramp — see ramps.js), just fall under gravity and land
    // back on the ground.
    if (this.y > 0 || this.vy > 0) {
      this.vy -= JUMP_GRAVITY_MPS2 * dt;
      this.y += this.vy * dt;
      if (this.y < 0) {
        this.y = 0;
        this.vy = 0;
      }
    }

    this.render();
  }

  render() {
    this.mesh.position.set(this.position.x, this.y, this.position.z);
    this.mesh.rotation.y = this.heading;
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  destroy() {
    this.scene.remove(this.mesh);
  }
}

// Owns every Vehicle instance: ambient traffic + parked cars, spawning
// replacements so traffic density stays constant even as the player
// hops between cars.
class TrafficManager {
  constructor(scene) {
    this.scene = scene;
    this.vehicles = [];
    this.pathsByRoute = [];
  }

  init(projectedPaths, parkedLocalPositions) {
    this.pathsByRoute = projectedPaths;

    projectedPaths.forEach((path, routeIdx) => {
      for (let i = 0; i < CARS_PER_ROUTE; i++) {
        this.spawnOnRoute(routeIdx, i);
      }
    });

    parkedLocalPositions.forEach((pos) => {
      const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
      this.vehicles.push(new Vehicle(this.scene, pos, color));
    });
  }

  spawnOnRoute(routeIdx, offsetIndex) {
    const path = this.pathsByRoute[routeIdx];
    if (!path || path.length < 2) return;

    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const startIndex = Math.floor((offsetIndex / CARS_PER_ROUTE) * (path.length - 1));
    const v = new Vehicle(this.scene, path[startIndex], color);
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
      const d = dist2D(pos, v.position);
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
