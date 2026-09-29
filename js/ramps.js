// Ramps: simple jump-triggers placed near the start. Driving over one
// launches the car into the air (a little upward velocity + gravity in
// vehicles.js), landing back on the ground a bit further on — playful,
// not a precise physics model, matching what was asked for ("paprastai").

const RAMP_LENGTH = 10;
const RAMP_WIDTH = 6;
const RAMP_THICKNESS = 0.4;
const RAMP_TILT = 0.32; // radians, ramp surface incline
const RAMP_TRIGGER_RADIUS = 3.5; // metres from the ramp's far (launch) edge
const RAMP_LAUNCH_VY = 8; // m/s upward, at launch

// Placed just off to the side of the spawn point, clear of the parked
// cars there, each facing a direction that's easy to line up with while
// driving out of the start area.
const RAMP_SPECS = [
  { position: { x: 28, z: 10 }, heading: 0 },
  { position: { x: -28, z: 10 }, heading: Math.PI / 2 },
];

function buildRampSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4c430';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1a1a1a';
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RAMP', canvas.width / 2, canvas.height / 2 + 2);
  return new THREE.CanvasTexture(canvas);
}

function buildRampSign() {
  const group = new THREE.Group();

  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 2.2, 0.15),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f })
  );
  post.position.y = 1.1;
  group.add(post);

  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.8),
    new THREE.MeshLambertMaterial({ map: buildRampSignTexture(), side: THREE.DoubleSide })
  );
  board.position.set(0, 1.9, 0);
  group.add(board);

  return group;
}

// A simplified tilted ramp: a thick box pitched up at RAMP_TILT, its
// near edge resting on the ground and its far edge raised — enough to
// launch a car driving up it without needing a true wedge mesh.
function buildRampMesh(spec) {
  const group = new THREE.Group();
  group.position.set(spec.position.x, 0, spec.position.z);
  group.rotation.order = 'YXZ';
  group.rotation.y = spec.heading;

  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(RAMP_WIDTH, RAMP_THICKNESS, RAMP_LENGTH),
    new THREE.MeshLambertMaterial({ color: 0x888888 })
  );
  const riseCenter = Math.sin(RAMP_TILT) * (RAMP_LENGTH / 2);
  ramp.position.set(0, riseCenter / 2, 0);
  ramp.rotation.x = RAMP_TILT;
  group.add(ramp);

  const sign = buildRampSign();
  const right = rightVec(spec.heading);
  sign.position.set(
    right.x * (RAMP_WIDTH / 2 + 1.2),
    0,
    right.z * (RAMP_WIDTH / 2 + 1.2)
  );
  sign.rotation.y = spec.heading;
  group.add(sign);

  return group;
}

// Returns an array of { launchPoint: {x, z} } — one per placed ramp —
// used by checkRampLaunch to detect when a driven car has reached a
// ramp's far edge.
function buildRamps(scene) {
  return RAMP_SPECS.map((spec) => {
    scene.add(buildRampMesh(spec));
    const fwd = forwardVec(spec.heading);
    const launchPoint = {
      x: spec.position.x + fwd.x * (RAMP_LENGTH / 2),
      z: spec.position.z + fwd.z * (RAMP_LENGTH / 2),
    };
    return { launchPoint };
  });
}

// Launches the given vehicle if it's driving fast enough near a ramp's
// far edge and isn't already airborne.
function checkRampLaunch(vehicle, ramps) {
  if (!vehicle || vehicle.y > 0.01 || Math.abs(vehicle.speed) < 3) return;

  for (const ramp of ramps) {
    if (dist2D(vehicle.position, ramp.launchPoint) <= RAMP_TRIGGER_RADIUS) {
      vehicle.vy = RAMP_LAUNCH_VY;
      return;
    }
  }
}
