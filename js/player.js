// The player: a real first-person controller. Walking uses free
// mouse/touch look (yaw+pitch) decoupled from movement direction, with
// a simple 3D "viewmodel" pair of hands bobbing as you walk — the
// closest thing to "only your hands move". Driving locks the camera to
// the vehicle's own heading and swaps the hands for a small dashboard.

const WALK_SPEED_MPS = 1.4; // average human walking speed
const EYE_HEIGHT = 1.7;
const DRIVE_EYE_HEIGHT = 1.15; // seated in the cabin, not standing above it
const DRIVE_SEAT_FORWARD_OFFSET = 0.5; // toward the windshield, off the car's center
const PITCH_LIMIT = Math.PI / 2 - 0.05;

function buildHandsViewmodel() {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xe0b089 });

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

function buildDashboard() {
  const group = new THREE.Group();

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.3, 0.35),
    new THREE.MeshLambertMaterial({ color: 0x222222 })
  );
  dash.position.set(0, -0.35, -0.6);
  group.add(dash);

  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.035, 8, 20),
    new THREE.MeshLambertMaterial({ color: 0x111111 })
  );
  wheel.position.set(0, -0.22, -0.55);
  wheel.rotation.x = Math.PI / 2.3;
  group.add(wheel);

  group.visible = false;
  return group;
}

class Player {
  constructor(camera, startLocal) {
    this.camera = camera;
    this.position = { x: startLocal.x, z: startLocal.z };
    this.yaw = 0;
    this.pitch = 0;
    this.vehicle = null; // Vehicle instance while driving, else null
    this.isMoving = false;
    this.walkPhase = 0;

    this.hands = buildHandsViewmodel();
    camera.add(this.hands.group);

    this.dashboard = buildDashboard();
    camera.add(this.dashboard);

    this.updateCamera();
  }

  get isDriving() {
    return this.vehicle !== null;
  }

  enterVehicle(vehicle) {
    this.vehicle = vehicle;
    this.hands.group.visible = false;
    this.dashboard.visible = true;
    // Hide the car's own shell so nothing sits between the camera and
    // the dashboard/world — the whole point of "being inside" it.
    vehicle.mesh.visible = false;
  }

  exitVehicle() {
    const v = this.vehicle;
    this.vehicle = null;
    // Step out beside the car rather than on top of it.
    const right = rightVec(v.heading);
    this.position = { x: v.position.x + right.x * 2.5, z: v.position.z + right.z * 2.5 };
    this.yaw = v.heading;
    this.pitch = 0;
    this.hands.group.visible = true;
    this.dashboard.visible = false;
    v.mesh.visible = true;
    return v;
  }

  // deltaYaw/deltaPitch in radians; sign convention: positive deltaYaw
  // turns left, positive deltaPitch looks up (see geo.js forwardVec).
  look(deltaYaw, deltaPitch) {
    this.yaw += deltaYaw;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch + deltaPitch));
  }

  updateWalking(dt, keys) {
    const forward = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
    const strafe = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    this.isMoving = forward !== 0 || strafe !== 0;

    if (this.isMoving) {
      const fwd = forwardVec(this.yaw);
      const right = rightVec(this.yaw);
      const dx = fwd.x * forward + right.x * strafe;
      const dz = fwd.z * forward + right.z * strafe;
      const len = Math.hypot(dx, dz) || 1;
      this.position.x += (dx / len) * WALK_SPEED_MPS * dt;
      this.position.z += (dz / len) * WALK_SPEED_MPS * dt;
      this.walkPhase += dt;
    }

    this.updateHandsBob();
  }

  updateHandsBob() {
    if (!this.isMoving) {
      this.hands.leftHand.position.y = -0.32;
      this.hands.rightHand.position.y = -0.32;
      return;
    }
    const bob = Math.sin(this.walkPhase * 8) * 0.03;
    this.hands.leftHand.position.y = -0.32 + bob;
    this.hands.rightHand.position.y = -0.32 - bob;
  }

  updateCamera() {
    this.camera.rotation.order = 'YXZ';

    if (this.isDriving) {
      const v = this.vehicle;
      const fwd = forwardVec(v.heading);
      this.camera.position.set(
        v.position.x + fwd.x * DRIVE_SEAT_FORWARD_OFFSET,
        DRIVE_EYE_HEIGHT,
        v.position.z + fwd.z * DRIVE_SEAT_FORWARD_OFFSET
      );
      this.camera.rotation.y = v.heading;
      this.camera.rotation.x = 0;
    } else {
      this.camera.position.set(this.position.x, EYE_HEIGHT, this.position.z);
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
    }
  }
}
