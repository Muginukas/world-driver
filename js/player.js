// The player: a small blocky person you see from behind (third-person,
// the default) or through their own eyes (first-person) — toggle with V
// or the 👁 button. Free mouse/touch look (yaw+pitch) works the same
// whether walking or driving. On foot you can run up to 50 km/h, same as
// a car's top speed, with a proper walk/run cycle on the avatar. In a car
// the third-person camera chases the car; first-person shows the
// dashboard and wheel from the driver's seat.

const WALK_MAX_SPEED_MPS = 50 / 3.6; // 50 km/h, same as the cars
const WALK_ACCEL = 16; // m/s^2 — full speed in under a second
const WALK_DECEL = 30;
const PLAYER_RADIUS = 0.3; // for building collision on foot
const EYE_HEIGHT = 1.15; // you're a small figure now (see PERSON_SCALE)
const DRIVE_EYE_HEIGHT = 1.15; // seated in the cabin, not standing above it
const DRIVE_SEAT_FORWARD_OFFSET = 0.5; // toward the windshield, off the car's center
const PITCH_LIMIT = Math.PI / 2 - 0.05;

// Third-person camera distances; zoom (+/- buttons, mouse wheel) moves
// between the min and max. Getting into a car pulls the camera up high
// and far back so you see the car and the streets around it.
const WALK_CAM_DIST_DEFAULT = 5;
const WALK_CAM_PITCH = -0.35; // a little above, looking down past your guards
const WALK_CAM_DIST_MIN = 1.2;
const WALK_CAM_DIST_MAX = 45;
const DRIVE_CAM_DIST_DEFAULT = 15;
const DRIVE_CAM_DIST_MIN = 4;
const DRIVE_CAM_DIST_MAX = 80;
const DRIVE_CAM_PITCH = -0.6; // looking down on the car from above
const THIRD_PERSON_TARGET_HEIGHT = 0.95;
const DRIVE_THIRD_PERSON_TARGET_HEIGHT = 1.2;
const THIRD_PITCH_MIN = -1.45; // looking down from above
const THIRD_PITCH_MAX = 0.5; // looking up from near the ground
const MIN_CAMERA_HEIGHT = 0.4;

// The player's own look: red shirt, blue jeans, brown hair.
const PLAYER_LOOK = { shirt: 0xe53935, pants: 0x1e4fa8, skin: 0xf1c27d, hair: 0x5a3825, hairStyle: 'short' };

const MAX_HEALTH = 100;
const HEALTH_REGEN_DELAY = 5; // seconds without being hit before healing starts
const HEALTH_REGEN_RATE = 6; // per second

function buildHandsViewmodel() {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: PLAYER_LOOK.skin });

  const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.35), skinMat);
  leftHand.position.set(-0.28, -0.32, -0.5);
  leftHand.rotation.x = 0.3;
  group.add(leftHand);

  const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.35), skinMat);
  rightHand.position.set(0.28, -0.32, -0.5);
  rightHand.rotation.x = 0.3;
  group.add(rightHand);

  return { group, leftHand, rightHand };
}

// The car's interior seen from the driver's seat: a low dashboard bar
// along the bottom of the view with the steering wheel in front of it —
// kept small and low so the road stays clearly visible.
function buildDashboard() {
  const group = new THREE.Group();

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.3, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x1c1c1c })
  );
  dash.position.set(0, -0.62, -1.0);
  group.add(dash);

  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.03, 8, 20),
    new THREE.MeshLambertMaterial({ color: 0x111111 })
  );
  wheel.position.set(0, -0.48, -0.75);
  wheel.rotation.x = -0.5;
  group.add(wheel);

  group.visible = false;
  return group;
}

// Shortest signed angle from `a` to `b`, in (-PI, PI].
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

class Player {
  constructor(camera, scene, startLocal) {
    this.camera = camera;
    this.position = { x: startLocal.x, z: startLocal.z };
    this.yaw = 0;
    this.pitch = WALK_CAM_PITCH;
    this.driveLookYaw = 0; // look angle *relative to the car's heading* while driving
    this.vehicle = null; // Vehicle instance while driving, else null
    this.viewMode = 'third'; // 'third' (see yourself) or 'first' (through your eyes)
    this.speed = 0; // m/s on foot
    this.moveDir = { x: 0, z: -1 };
    this.isMoving = false;
    this.walkPhase = 0;
    this.walkCamDist = WALK_CAM_DIST_DEFAULT;
    this.driveCamDist = DRIVE_CAM_DIST_DEFAULT;

    this.health = MAX_HEALTH;
    this.dead = false;
    this.sinceHit = 999;
    this.punchAnim = 0;
    this.onHurt = null; // set by main.js: flashes the screen red
    this.onDeath = null; // set by main.js: shows the "knocked out" screen

    this.avatar = buildPersonMesh(PLAYER_LOOK);
    this.avatarHeading = 0;
    scene.add(this.avatar.group);

    this.hands = buildHandsViewmodel();
    camera.add(this.hands.group);

    this.dashboard = buildDashboard();
    camera.add(this.dashboard);

    this.applyVisibility();
    this.updateCamera();
  }

  get isDriving() {
    return this.vehicle !== null;
  }

  get isThirdPerson() {
    return this.viewMode === 'third';
  }

  get speedKmh() {
    return this.speed * 3.6;
  }

  // Zoom the third-person camera: factor < 1 closer, > 1 further away.
  // Zooming out from first person switches to third person.
  zoom(factor) {
    if (!this.isThirdPerson) {
      if (factor > 1) this.toggleView();
      return;
    }
    if (this.isDriving) {
      this.driveCamDist = Math.max(DRIVE_CAM_DIST_MIN, Math.min(DRIVE_CAM_DIST_MAX, this.driveCamDist * factor));
    } else {
      this.walkCamDist = Math.max(WALK_CAM_DIST_MIN, Math.min(WALK_CAM_DIST_MAX, this.walkCamDist * factor));
    }
  }

  takeDamage(amount) {
    if (this.dead || this.isDriving) return;
    this.health = Math.max(0, this.health - amount);
    this.sinceHit = 0;
    if (this.onHurt) this.onHurt();
    if (this.health <= 0) {
      this.dead = true;
      this.speed = 0;
      setKnockedOut(this.avatar, true);
      if (this.onDeath) this.onDeath();
    }
  }

  respawn(startLocal) {
    this.position = { x: startLocal.x, z: startLocal.z };
    this.health = MAX_HEALTH;
    this.dead = false;
    this.speed = 0;
    this.sinceHit = 999;
    setKnockedOut(this.avatar, false);
  }

  punch() {
    this.punchAnim = 0.25;
  }

  toggleView() {
    this.viewMode = this.isThirdPerson ? 'first' : 'third';
    this.pitch = this.isThirdPerson ? (this.isDriving ? DRIVE_CAM_PITCH : WALK_CAM_PITCH) : 0;
    this.applyVisibility();
  }

  // Which of avatar / hands / dashboard / car shell should show, for the
  // current mode (walking or driving) and view (first or third person).
  applyVisibility() {
    const third = this.isThirdPerson;
    this.avatar.group.visible = !this.isDriving && third;
    this.hands.group.visible = !this.isDriving && !third;
    this.dashboard.visible = this.isDriving && !third;
    // In first person the car's own shell is hidden so nothing sits
    // between the camera and the dashboard/world.
    if (this.vehicle) this.vehicle.mesh.visible = third;
  }

  enterVehicle(vehicle) {
    this.vehicle = vehicle;
    this.speed = 0;
    this.driveLookYaw = 0;
    this.pitch = this.isThirdPerson ? DRIVE_CAM_PITCH : 0;
    this.applyVisibility();
  }

  exitVehicle() {
    const v = this.vehicle;
    v.mesh.visible = true;
    this.vehicle = null;
    // Step out beside the car rather than on top of it.
    const right = rightVec(v.heading);
    this.position = { x: v.position.x + right.x * 2.5, z: v.position.z + right.z * 2.5 };
    // Keep facing wherever you were looking in the car.
    this.yaw = v.heading + this.driveLookYaw;
    this.avatarHeading = v.heading;
    this.pitch = this.isThirdPerson ? WALK_CAM_PITCH : 0;
    this.applyVisibility();
    return v;
  }

  // deltaYaw/deltaPitch in radians; positive deltaYaw turns left,
  // positive deltaPitch looks up (see geo.js forwardVec). While driving
  // this adjusts the look angle *relative to the car* (driveLookYaw), so
  // the view turns together with the car through a corner.
  look(deltaYaw, deltaPitch) {
    if (this.isDriving) {
      this.driveLookYaw += deltaYaw;
    } else {
      this.yaw += deltaYaw;
    }
    const min = this.isThirdPerson ? THIRD_PITCH_MIN : -PITCH_LIMIT;
    const max = this.isThirdPerson ? THIRD_PITCH_MAX : PITCH_LIMIT;
    this.pitch = Math.max(min, Math.min(max, this.pitch + deltaPitch));
  }

  updateWalking(dt, keys, buildings) {
    this.sinceHit += dt;
    if (!this.dead && this.sinceHit > HEALTH_REGEN_DELAY) {
      this.health = Math.min(MAX_HEALTH, this.health + HEALTH_REGEN_RATE * dt);
    }
    if (this.dead) {
      // Knocked out: lie there until you respawn.
      this.speed = 0;
      animatePerson(this.avatar, 0, 0);
      this.avatar.group.position.set(this.position.x, 0.08, this.position.z);
      return;
    }

    const forward = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
    const strafe = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    this.isMoving = forward !== 0 || strafe !== 0;

    if (this.isMoving) {
      // Movement is relative to where you're looking (the camera's yaw).
      const fwd = forwardVec(this.yaw);
      const right = rightVec(this.yaw);
      const dx = fwd.x * forward + right.x * strafe;
      const dz = fwd.z * forward + right.z * strafe;
      const len = Math.hypot(dx, dz) || 1;
      this.moveDir = { x: dx / len, z: dz / len };
      this.speed = Math.min(WALK_MAX_SPEED_MPS, this.speed + WALK_ACCEL * dt);
    } else {
      this.speed = Math.max(0, this.speed - WALK_DECEL * dt);
    }

    if (this.speed > 0) {
      const stepX = this.moveDir.x * this.speed * dt;
      const stepZ = this.moveDir.z * this.speed * dt;
      // Try each axis separately so you slide along a wall instead of
      // sticking to it.
      if (!collidesWithBuilding(this.position.x + stepX, this.position.z, buildings, PLAYER_RADIUS)) {
        this.position.x += stepX;
      }
      if (!collidesWithBuilding(this.position.x, this.position.z + stepZ, buildings, PLAYER_RADIUS)) {
        this.position.z += stepZ;
      }
    }

    // Turn the avatar smoothly toward the direction it's moving.
    if (this.isMoving) {
      const target = Math.atan2(-this.moveDir.x, -this.moveDir.z);
      this.avatarHeading += angleDelta(this.avatarHeading, target) * Math.min(1, dt * 12);
    }

    const runAmount = Math.min(1, this.speed / 3);
    this.walkPhase += dt * (3 + this.speed * 0.8);
    animatePerson(this.avatar, this.walkPhase, runAmount);
    this.punchAnim -= dt;
    if (this.punchAnim > 0) setPunch(this.avatar);
    const g = this.avatar.group;
    g.position.set(this.position.x, 0, this.position.z);
    g.rotation.y = this.avatarHeading;
    g.rotation.x = -0.25 * Math.min(1, this.speed / WALK_MAX_SPEED_MPS); // lean into a sprint

    this.updateHandsBob();
  }

  updateHandsBob() {
    const bob = this.speed > 0.1 ? Math.sin(this.walkPhase * 2) * 0.03 : 0;
    this.hands.leftHand.position.y = -0.32 + bob;
    this.hands.rightHand.position.y = -0.32 - bob;
  }

  // Third-person: put the camera `dist` behind/above `target`, looking
  // at it along yaw/pitch.
  orbitCamera(tx, ty, tz, yaw, dist) {
    const cp = Math.cos(this.pitch);
    const dirX = -Math.sin(yaw) * cp;
    const dirY = Math.sin(this.pitch);
    const dirZ = -Math.cos(yaw) * cp;
    this.camera.position.set(
      tx - dirX * dist,
      Math.max(MIN_CAMERA_HEIGHT, ty - dirY * dist),
      tz - dirZ * dist
    );
    this.camera.rotation.y = yaw;
    this.camera.rotation.x = this.pitch;
  }

  updateCamera() {
    this.camera.rotation.order = 'YXZ';

    if (this.isDriving) {
      const v = this.vehicle;
      const yaw = v.heading + this.driveLookYaw;
      if (this.isThirdPerson) {
        this.orbitCamera(v.position.x, v.y + DRIVE_THIRD_PERSON_TARGET_HEIGHT, v.position.z, yaw, this.driveCamDist);
        return;
      }
      const fwd = forwardVec(v.heading);
      this.camera.position.set(
        v.position.x + fwd.x * DRIVE_SEAT_FORWARD_OFFSET,
        DRIVE_EYE_HEIGHT + v.y,
        v.position.z + fwd.z * DRIVE_SEAT_FORWARD_OFFSET
      );
      this.camera.rotation.y = yaw;
      this.camera.rotation.x = this.pitch;
    } else if (this.isThirdPerson) {
      this.orbitCamera(this.position.x, THIRD_PERSON_TARGET_HEIGHT, this.position.z, this.yaw, this.walkCamDist);
    } else {
      this.camera.position.set(this.position.x, EYE_HEIGHT, this.position.z);
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
    }
  }
}
