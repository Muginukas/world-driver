// The player: a real first-person controller with free mouse/touch look
// (yaw+pitch), decoupled from movement direction — the same look
// controls work whether walking or driving. Walking shows a simple 3D
// "viewmodel" pair of hands bobbing as you move; driving swaps them for
// a dashboard/wheel and seats the camera in the car (movement itself
// still follows the vehicle's own heading/steering, not where you look).

const WALK_SPEED_MPS = 5; // brisk game-pace walk, not realistic 1.4 m/s
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

// The car's interior: dashboard + wheel directly ahead, plus A-pillars
// and a sun visor framing the windshield in peripheral view — so it
// reads as sitting inside the car, not just floating with a HUD prop.
function buildDashboard() {
  const group = new THREE.Group();
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });

  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 0.4), trimMat);
  dash.position.set(0, -0.28, -0.55);
  group.add(dash);

  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.04, 8, 20),
    new THREE.MeshLambertMaterial({ color: 0x111111 })
  );
  wheel.position.set(0, -0.16, -0.5);
  wheel.rotation.x = Math.PI / 2.3;
  group.add(wheel);

  const pillarGeo = new THREE.BoxGeometry(0.1, 1.3, 0.1);
  const leftPillar = new THREE.Mesh(pillarGeo, trimMat);
  leftPillar.position.set(-0.68, 0.1, -0.7);
  leftPillar.rotation.z = 0.18;
  group.add(leftPillar);

  const rightPillar = new THREE.Mesh(pillarGeo, trimMat);
  rightPillar.position.set(0.68, 0.1, -0.7);
  rightPillar.rotation.z = -0.18;
  group.add(rightPillar);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.25), trimMat);
  visor.position.set(0, 0.58, -0.65);
  group.add(visor);

  group.visible = false;
  return group;
}

class Player {
  constructor(camera, startLocal) {
    this.camera = camera;
    this.position = { x: startLocal.x, z: startLocal.z };
    this.yaw = 0;
    this.pitch = 0;
    this.driveLookYaw = 0; // look angle *relative to the car's heading* while driving
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
    // Start facing forward through the windshield; free look adds an
    // offset on top of the car's heading from here (see updateCamera).
    this.driveLookYaw = 0;
    this.pitch = 0;
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
    // Keep facing wherever you were looking in the car (car heading +
    // whatever look offset you'd built up), not just straight ahead.
    this.yaw = v.heading + this.driveLookYaw;
    this.pitch = 0;
    this.hands.group.visible = true;
    this.dashboard.visible = false;
    v.mesh.visible = true;
    return v;
  }

  // deltaYaw/deltaPitch in radians; sign convention: positive deltaYaw
  // turns left, positive deltaPitch looks up (see geo.js forwardVec).
  // While driving this adjusts the look angle *relative to the car*
  // (driveLookYaw) rather than an absolute world direction — so the
  // view turns together with the car through a corner, the way sitting
  // in a real seat works, instead of staying fixed while the car spins
  // underneath you.
  look(deltaYaw, deltaPitch) {
    if (this.isDriving) {
      this.driveLookYaw += deltaYaw;
    } else {
      this.yaw += deltaYaw;
    }
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
    const bob = Math.sin(this.walkPhase * 12) * 0.03;
    this.hands.leftHand.position.y = -0.32 + bob;
    this.hands.rightHand.position.y = -0.32 - bob;
  }

  updateCamera() {
    this.camera.rotation.order = 'YXZ';

    if (this.isDriving) {
      const v = this.vehicle;
      // The seat's position within the car is fixed to the car's own
      // heading (it's a physical spot in the cabin). The view direction
      // follows the car's heading too — turning a corner turns you with
      // it, like actually sitting in the seat — plus whatever extra look
      // angle you've dragged in on top (driveLookYaw).
      const fwd = forwardVec(v.heading);
      this.camera.position.set(
        v.position.x + fwd.x * DRIVE_SEAT_FORWARD_OFFSET,
        DRIVE_EYE_HEIGHT + v.y,
        v.position.z + fwd.z * DRIVE_SEAT_FORWARD_OFFSET
      );
      this.camera.rotation.y = v.heading + this.driveLookYaw;
      this.camera.rotation.x = this.pitch;
    } else {
      this.camera.position.set(this.position.x, EYE_HEIGHT, this.position.z);
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
    }
  }
}
