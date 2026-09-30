// Ramps: drivable inclined ramps placed near the start, approached via a
// painted red lane with a "RAMP" sign at its start. Driving onto one
// climbs it like a real hill — the car's height tracks the slope as it
// drives up, with guard rails along both edges so it can't slide off the
// side. Past the top it launches briefly into the air and falls back to
// the ground under ordinary gravity (see vehicles.js).

const RAMP_LENGTH = 10; // horizontal run of the sloped surface
const RAMP_HEIGHT = 4; // height reached at the top of the ramp
const RAMP_WIDTH = 6;
const RAMP_THICKNESS = 0.4;
const RAMP_TILT = Math.atan2(RAMP_HEIGHT, RAMP_LENGTH); // slope angle from horizontal
const RAMP_SLOPE_LENGTH = Math.hypot(RAMP_LENGTH, RAMP_HEIGHT);
const RAMP_RAIL_HEIGHT = 0.9; // side guard rails, tall enough you can't drive off the edge
const RAMP_RAIL_THICKNESS = 0.25;
const RAMP_LAUNCH_VY = 4; // m/s upward hop off the top before gravity takes over

const RAMP_APPROACH_LENGTH = 14; // length of the painted red approach lane

// Each spec's `position` is the ramp's base (ground level, where the climb
// starts) and `heading` is the climbing direction — same convention as a
// vehicle's own heading (see geo.js): forwardVec(heading) points the way
// you drive to climb it.
const RAMP_SPECS_NEAR_SPAWN = [
  { position: { x: 25, z: 20 }, heading: 0 },
  { position: { x: -25, z: 20 }, heading: Math.PI / 2 },
];

const RAMP_ROAD_OFFSET = 7; // metres off a road's centerline, clear of ROAD_WIDTH (see world.js)
const RAMP_ROAD_FRACTION = 0.45; // how far along each route's path to place its ramp

// One ramp per real traffic route, planted just off to the side of the
// road at a point along its actual path, oriented with the road's local
// direction there — so driving that route, you run into ramps along the
// way instead of only finding them back at spawn.
function buildRoadRampSpecs(projectedRoutes) {
  const specs = [];
  for (const path of projectedRoutes) {
    if (!path || path.length < 4) continue;
    const i = Math.min(path.length - 2, Math.max(0, Math.floor(path.length * RAMP_ROAD_FRACTION)));
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b || dist2D(a, b) < 0.5) continue;

    const heading = headingTo(a, b);
    const right = rightVec(heading);
    specs.push({
      position: { x: a.x + right.x * RAMP_ROAD_OFFSET, z: a.z + right.z * RAMP_ROAD_OFFSET },
      heading,
    });
  }
  return specs;
}

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

// The red painted lane leading up to the ramp's base, with the RAMP sign
// planted at its far end — the start of the lane as a driver approaches —
// so it's the first thing you see before reaching the ramp itself.
function buildApproachPath() {
  const group = new THREE.Group();

  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(RAMP_WIDTH, RAMP_APPROACH_LENGTH),
    new THREE.MeshLambertMaterial({ color: 0xcc3b30 })
  );
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.03, RAMP_APPROACH_LENGTH / 2);
  group.add(lane);

  const sign = buildRampSign();
  sign.position.set(RAMP_WIDTH / 2 + 1.2, 0, RAMP_APPROACH_LENGTH);
  group.add(sign);

  return group;
}

// The sloped ramp surface: tilted up from the base (local origin, ground
// level) to the top (RAMP_HEIGHT up, RAMP_LENGTH along the climb
// direction). Guard rails run its full length on both edges, tilted
// together with it as children of the same pitched group, so a car can't
// slide off the side going up.
function buildRampSurface() {
  const surface = new THREE.Group();
  surface.position.set(0, RAMP_HEIGHT / 2, -RAMP_LENGTH / 2);
  surface.rotation.x = RAMP_TILT;

  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(RAMP_WIDTH, RAMP_THICKNESS, RAMP_SLOPE_LENGTH),
    new THREE.MeshLambertMaterial({ color: 0x888888 })
  );
  surface.add(ramp);

  const railMat = new THREE.MeshLambertMaterial({ color: 0xcc3b30 });
  const railGeo = new THREE.BoxGeometry(RAMP_RAIL_THICKNESS, RAMP_RAIL_HEIGHT, RAMP_SLOPE_LENGTH);
  const railOffsetX = RAMP_WIDTH / 2 + RAMP_RAIL_THICKNESS / 2;
  const railY = RAMP_THICKNESS / 2 + RAMP_RAIL_HEIGHT / 2;
  [-1, 1].forEach((side) => {
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(railOffsetX * side, railY, 0);
    surface.add(rail);
  });

  return surface;
}

function buildRampMesh(spec) {
  const group = new THREE.Group();
  group.position.set(spec.position.x, 0, spec.position.z);
  group.rotation.order = 'YXZ';
  group.rotation.y = spec.heading;

  group.add(buildApproachPath());
  group.add(buildRampSurface());

  return group;
}

// Returns an array of ramp descriptors used by updateRampPhysics to test
// a vehicle's position against each ramp's footprint. `projectedRoutes`
// (the same local-meter paths passed to buildWorld) is used to scatter
// extra ramps along the actual roads, on top of the two near spawn.
function buildRamps(scene, projectedRoutes) {
  const specs = RAMP_SPECS_NEAR_SPAWN.concat(buildRoadRampSpecs(projectedRoutes || []));
  return specs.map((spec) => {
    scene.add(buildRampMesh(spec));
    return {
      position: spec.position,
      forward: forwardVec(spec.heading),
      right: rightVec(spec.heading),
    };
  });
}

// Drives the vehicle up a ramp like a hill while it's on one — its height
// tracks the slope directly by position, no real physics — then launches
// it briefly into the air the moment it drives off the top. Ordinary
// gravity in vehicles.js takes over from there, falling back to the
// ground.
function updateRampPhysics(vehicle, ramps) {
  if (!vehicle) return;

  for (const ramp of ramps) {
    const relX = vehicle.position.x - ramp.position.x;
    const relZ = vehicle.position.z - ramp.position.z;
    const along = relX * ramp.forward.x + relZ * ramp.forward.z;
    const lateral = relX * ramp.right.x + relZ * ramp.right.z;
    const onRampFootprint = along >= 0 && along <= RAMP_LENGTH && Math.abs(lateral) <= RAMP_WIDTH / 2;

    if (onRampFootprint) {
      vehicle.y = (along / RAMP_LENGTH) * RAMP_HEIGHT;
      vehicle.vy = 0;
      vehicle.onRamp = true;
      vehicle.render(); // apply the corrected height this same frame, not next
      return;
    }

    if (vehicle.onRamp) {
      vehicle.onRamp = false;
      if (along > RAMP_LENGTH) {
        vehicle.vy = RAMP_LAUNCH_VY; // drove off the top - into the air
      } else {
        vehicle.y = 0; // backed off the base - back on the ground
      }
      vehicle.render();
      return;
    }
  }
}
