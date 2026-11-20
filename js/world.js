// Builds the 3D scene: sky/lighting, a flat ground plane, road ribbons
// (with sidewalks) following the real (OSRM-resolved, locally-projected)
// Vilnius street paths, and a dense city of procedurally placed low-poly
// "block" buildings. There's no real building-footprint data here (that
// would need an Overpass API pass) — buildings are stylised filler,
// Roblox-block style, not accurate to real Vilnius architecture.
//
// Roads and buildings are each drawn as a single THREE.InstancedMesh, so
// thousands of buildings still cost only one draw call (important on
// phones).

const ROAD_WIDTH = 7;
const SIDEWALK_WIDTH = 2.6;
const SIDEWALK_OFFSET = ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2; // sidewalk centerline, used by pedestrians.js
const SIDEWALK_TOP = 0.07; // sidewalk surface height, pedestrians stand on it
const ROAD_CLEARANCE = ROAD_WIDTH / 2 + SIDEWALK_WIDTH + 0.4; // nothing is built closer than this to a road centerline
const BUILDING_SETBACK = ROAD_CLEARANCE + 0.3;

const ROADSIDE_SPACING = 12; // metres between roadside building slots
const FILL_RADIUS = 340; // fill the blocks between roads within this distance of spawn
const FILL_SPACING = 17;
const FILL_PLAZA_RADIUS = 75; // keep an open square around the spawn (Lukiškės Sq.) and its parked cars

// Drive-through lanes: a grid of open asphalt streets cut through the
// city blocks around the spawn, so the dense buildings still leave room
// to drive (and walk) between them. Lines run along x = k*SPACING and
// z = k*SPACING inside a square of +/- LANE_EXTENT.
const LANE_SPACING = 68;
const LANE_HALF_WIDTH = 6;
const LANE_EXTENT = 420;
const DRIVEWAY_CHANCE = 0.2; // chance a roadside slot is left open as a gap
const MAX_BUILDINGS = 4000;

const BUILDING_PALETTE = [
  0xcfd8dc, 0xd7ccc8, 0xb0bec5, 0xffe0b2, 0xc5cae9, 0xb2dfdb,
  0xf8bbd0, 0xfff59d, 0xa5d6a7, 0xbcaaa4, 0x90a4ae, 0xffccbc,
];

function buildWorld(scene, projectedRoutes, keepClear = []) {
  scene.background = new THREE.Color(0x8fd3f4);
  scene.fog = new THREE.Fog(0x8fd3f4, 60, 260);

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(80, 120, 40);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshLambertMaterial({ color: 0x7ec850 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  addRoads(scene, projectedRoutes);
  addLanes(scene);
  const roadIndex = buildRoadIndex(projectedRoutes);
  return placeBuildings(scene, projectedRoutes, roadIndex, keepClear);
}

// ---------- Roads ----------

function addRoads(scene, projectedRoutes) {
  const segs = [];
  projectedRoutes.forEach((path) => {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      segs.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, len, rotY: Math.atan2(dx, dz) });
    }
  });

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const road = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x4a4a4a }), segs.length);
  const walk = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xbdbdbd }), segs.length);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  segs.forEach((seg, i) => {
    q.setFromAxisAngle(up, seg.rotY); // box local +Z along the segment
    p.set(seg.x, 0.05, seg.z);
    s.set(ROAD_WIDTH, 0.2, seg.len + 0.6);
    road.setMatrixAt(i, m.compose(p, q, s));
    p.set(seg.x, 0, seg.z);
    s.set(ROAD_WIDTH + SIDEWALK_WIDTH * 2, SIDEWALK_TOP * 2, seg.len + 0.6);
    walk.setMatrixAt(i, m.compose(p, q, s));
  });
  // An InstancedMesh's bounds are just the unit box at the origin, so
  // frustum culling would wrongly drop the whole thing — draw it always.
  road.frustumCulled = false;
  walk.frustumCulled = false;
  scene.add(walk);
  scene.add(road);
}

function distToLaneLine(v) {
  return Math.abs(v - Math.round(v / LANE_SPACING) * LANE_SPACING);
}

function onLane(x, z) {
  if (Math.abs(x) > LANE_EXTENT || Math.abs(z) > LANE_EXTENT) return false;
  return distToLaneLine(x) < LANE_HALF_WIDTH || distToLaneLine(z) < LANE_HALF_WIDTH;
}

function addLanes(scene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x5c5c5c });
  const kMax = Math.floor(LANE_EXTENT / LANE_SPACING);
  for (let k = -kMax; k <= kMax; k++) {
    const alongX = new THREE.Mesh(new THREE.PlaneGeometry(LANE_EXTENT * 2, LANE_HALF_WIDTH * 2 - 2), mat);
    alongX.rotation.x = -Math.PI / 2;
    alongX.position.set(0, 0.02, k * LANE_SPACING);
    scene.add(alongX);
    const alongZ = new THREE.Mesh(new THREE.PlaneGeometry(LANE_HALF_WIDTH * 2 - 2, LANE_EXTENT * 2), mat);
    alongZ.rotation.x = -Math.PI / 2;
    alongZ.position.set(k * LANE_SPACING, 0.03, 0);
    scene.add(alongZ);
  }
}

// Spatial hash of road segments, so "how far is this point from the
// nearest road" stays cheap with thousands of segments.
const ROAD_CELL = 25;

function pointSegDist(px, pz, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

function buildRoadIndex(projectedRoutes) {
  const cells = new Map();
  for (const path of projectedRoutes) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const x0 = Math.floor(Math.min(a.x, b.x) / ROAD_CELL);
      const x1 = Math.floor(Math.max(a.x, b.x) / ROAD_CELL);
      const z0 = Math.floor(Math.min(a.z, b.z) / ROAD_CELL);
      const z1 = Math.floor(Math.max(a.z, b.z) / ROAD_CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const key = cx + ',' + cz;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push([a, b]);
        }
      }
    }
  }

  return {
    // Distance to the nearest road segment, or Infinity if none is
    // within `maxR` (only nearby cells are searched).
    minDist(x, z, maxR) {
      let best = Infinity;
      const x0 = Math.floor((x - maxR) / ROAD_CELL);
      const x1 = Math.floor((x + maxR) / ROAD_CELL);
      const z0 = Math.floor((z - maxR) / ROAD_CELL);
      const z1 = Math.floor((z + maxR) / ROAD_CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const list = cells.get(cx + ',' + cz);
          if (!list) continue;
          for (const [a, b] of list) {
            const d = pointSegDist(x, z, a, b);
            if (d < best) best = d;
          }
        }
      }
      return best;
    },
  };
}

// ---------- Buildings ----------

function randomBuildingHeight() {
  const r = Math.random();
  if (r < 0.08) return 30 + Math.random() * 25; // the odd tower
  if (r < 0.4) return 12 + Math.random() * 14;
  return 5 + Math.random() * 8;
}

// Returns a building index (see makeBuildingIndex) over colliders {x, z, hw, hd, rotY} — each box's
// half-width/half-depth in its own (rotated) local frame — used by
// vehicles.js/player.js to stop you passing through a building.
// `keepClear` is a list of {x, z, r} circles (spawn, parked cars, ramps)
// where nothing may be built.
function placeBuildings(scene, projectedRoutes, roadIndex, keepClear) {
  const list = [];
  const hash = new Map();
  const HASH_CELL = 12;

  const fits = (b) => {
    if (list.length >= MAX_BUILDINGS) return false;
    const r = Math.hypot(b.w, b.d) / 2;

    for (const k of keepClear) {
      if (Math.hypot(b.x - k.x, b.z - k.z) < r + k.r) return false;
    }

    const hx = Math.floor(b.x / HASH_CELL);
    const hz = Math.floor(b.z / HASH_CELL);
    for (let cx = hx - 2; cx <= hx + 2; cx++) {
      for (let cz = hz - 2; cz <= hz + 2; cz++) {
        const cell = hash.get(cx + ',' + cz);
        if (!cell) continue;
        for (const o of cell) {
          if (Math.hypot(b.x - o.x, b.z - o.z) < (r + o.r) * 0.82) return false;
        }
      }
    }

    // Sample the footprint (corners, edge midpoints, center) against the
    // roads, so no building ever sits on a road or its sidewalk.
    const cos = Math.cos(b.rotY);
    const sin = Math.sin(b.rotY);
    for (let u = -1; u <= 1; u++) {
      for (let v = -1; v <= 1; v++) {
        const lx = (u * b.w) / 2;
        const lz = (v * b.d) / 2;
        const wx = b.x + lx * cos + lz * sin;
        const wz = b.z - lx * sin + lz * cos;
        if (roadIndex.minDist(wx, wz, ROAD_CLEARANCE) < ROAD_CLEARANCE) return false;
        if (onLane(wx, wz)) return false;
      }
    }
    return true;
  };

  const add = (b) => {
    b.r = Math.hypot(b.w, b.d) / 2;
    list.push(b);
    const key = Math.floor(b.x / HASH_CELL) + ',' + Math.floor(b.z / HASH_CELL);
    if (!hash.has(key)) hash.set(key, []);
    hash.get(key).push(b);
  };

  // 1) Two rows of buildings lining both sides of every road, facing it.
  for (const path of projectedRoutes) {
    let carry = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const bpt = path[i + 1];
      const dx = bpt.x - a.x;
      const dz = bpt.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.5) continue;
      const dirX = dx / len;
      const dirZ = dz / len;
      const nX = dirZ;
      const nZ = -dirX;
      const rotY = Math.atan2(dx, dz);

      let s = carry;
      while (s < len) {
        const px = a.x + dirX * s;
        const pz = a.z + dirZ * s;
        for (const side of [1, -1]) {
          if (Math.random() < DRIVEWAY_CHANCE) continue; // leave a gap to drive through
          let off = BUILDING_SETBACK;
          for (let row = 0; row < 2; row++) {
            const w = 7 + Math.random() * 7; // across the road
            const d = 7 + Math.random() * 5; // along the road
            const b = {
              x: px + nX * side * (off + w / 2),
              z: pz + nZ * side * (off + w / 2),
              w, d, h: randomBuildingHeight(), rotY,
            };
            if (fits(b)) add(b);
            off += w + 3 + Math.random() * 3;
          }
        }
        s += ROADSIDE_SPACING * (0.8 + Math.random() * 0.4);
      }
      carry = s - len;
    }
  }

  // 2) Fill the blocks between roads around the spawn with a loose grid.
  for (let gx = -FILL_RADIUS; gx <= FILL_RADIUS; gx += FILL_SPACING) {
    for (let gz = -FILL_RADIUS; gz <= FILL_RADIUS; gz += FILL_SPACING) {
      const fromSpawn = Math.hypot(gx, gz);
      if (fromSpawn > FILL_RADIUS || fromSpawn < FILL_PLAZA_RADIUS) continue;
      const b = {
        x: gx + (Math.random() - 0.5) * 6,
        z: gz + (Math.random() - 0.5) * 6,
        w: 8 + Math.random() * 7,
        d: 8 + Math.random() * 7,
        h: randomBuildingHeight(),
        rotY: Math.random() < 0.75 ? 0 : Math.random() * Math.PI,
      };
      if (fits(b)) add(b);
    }
  }

  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0); // base at y=0, so scale.y is the height
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  list.forEach((b, i) => {
    q.setFromAxisAngle(up, b.rotY);
    p.set(b.x, 0, b.z);
    s.set(b.w, b.h, b.d);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    c.setHex(BUILDING_PALETTE[Math.floor(Math.random() * BUILDING_PALETTE.length)]);
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  scene.add(mesh);

  return makeBuildingIndex(list.map((b) => ({ x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, rotY: b.rotY })));
}

// Spatial hash over the building colliders, so collision checks (cars,
// you, and every little person every frame) only test the few buildings
// nearby instead of all thousands. near(x, z) returns the buildings that
// could touch anything within ~2 m of that point.
const BUILDING_CELL = 20;
const NO_BUILDINGS = [];

function makeBuildingIndex(colliders) {
  const cells = new Map();
  for (const b of colliders) {
    const r = Math.hypot(b.hw, b.hd) + 2;
    const x0 = Math.floor((b.x - r) / BUILDING_CELL);
    const x1 = Math.floor((b.x + r) / BUILDING_CELL);
    const z0 = Math.floor((b.z - r) / BUILDING_CELL);
    const z1 = Math.floor((b.z + r) / BUILDING_CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = cx + ',' + cz;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(b);
      }
    }
  }
  return {
    list: colliders,
    near(x, z) {
      return cells.get(Math.floor(x / BUILDING_CELL) + ',' + Math.floor(z / BUILDING_CELL)) || NO_BUILDINGS;
    },
  };
}
