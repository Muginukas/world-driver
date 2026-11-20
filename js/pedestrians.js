// Blocky "Roblox-style" little people: a shared figure builder (used for
// the player, bodyguards and villains too — see player.js, combat.js)
// plus ambient pedestrians who simply wander wherever they like, around
// buildings, across roads and squares. Everyone looks different: hair
// styles, hats, glasses, backpacks, body width, kids and grown-ups.
// They hop out of the way, arms up, if you drive at them.

const PERSON_SCALE = 0.62; // everyone is small next to the buildings
const PERSON_RADIUS = 0.3; // for building collision

const PED_COUNT = 120;
const PED_SPEED_MIN = 1.0; // m/s
const PED_SPEED_MAX = 2.0;
const PED_JOGGER_SPEED = 3.5;
const PED_WANDER_STEP = 30; // each new destination is up to this far away
const PED_VISIBLE_DIST = 140; // beyond this (deep in the fog) they're hidden and frozen
const PED_RECYCLE_DIST = 190; // further than this from you -> moved somewhere near you
const PED_RESPAWN_MIN = 90;
const PED_RESPAWN_MAX = 140;
const PED_DODGE_DIST = 2.2;
const PED_GRAVITY = 18;

const SHIRT_COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0xffffff, 0x34495e, 0xff6fae, 0x00bcd4, 0x8bc34a];
const PANTS_COLORS = [0x2c3e50, 0x1f3a93, 0x5d4037, 0x212121, 0x607d8b, 0x7f8c8d, 0xc2185b, 0xd7ccc8];
const SKIN_COLORS = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
const HAIR_COLORS = [0x2b1b0e, 0x5a3825, 0xd6b45a, 0x111111, 0x8b3a1a, 0xb0b0b0, 0xff7043];
const HAT_COLORS = [0xd32f2f, 0x1976d2, 0x388e3c, 0x212121, 0xfbc02d, 0x6d4c41];
const HAIR_STYLES = ['short', 'short', 'long', 'long', 'spiky', 'bald'];
const HAT_STYLES = [null, null, null, null, 'cap', 'cap', 'tophat', 'beanie'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPersonLook() {
  const kid = Math.random() < 0.15;
  return {
    shirt: pick(SHIRT_COLORS),
    pants: pick(PANTS_COLORS),
    skin: pick(SKIN_COLORS),
    hair: pick(HAIR_COLORS),
    hairStyle: pick(HAIR_STYLES),
    hat: pick(HAT_STYLES),
    hatColor: pick(HAT_COLORS),
    glasses: Math.random() < 0.15,
    backpack: Math.random() < 0.2 ? pick(HAT_COLORS) : null,
    width: 0.85 + Math.random() * 0.4,
    scale: kid ? 0.7 : 0.9 + Math.random() * 0.25,
  };
}

// Geometries/materials are shared across every figure — only the meshes
// themselves are per-person.
const personMatCache = new Map();
function personMat(color) {
  if (!personMatCache.has(color)) personMatCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return personMatCache.get(color);
}

const personGeoCache = new Map();
function boxGeo(w, h, d, pivotTop = false) {
  const key = w + ',' + h + ',' + d + ',' + pivotTop;
  if (!personGeoCache.has(key)) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (pivotTop) g.translate(0, -h / 2, 0); // pivot at the top (hip/shoulder)
    personGeoCache.set(key, g);
  }
  return personGeoCache.get(key);
}

// Builds one figure facing local -Z (same "heading 0" convention as cars,
// see geo.js), feet at y=0. Unscaled it's ~2.1 m tall; the group is
// scaled by PERSON_SCALE * look.scale. Returns the group plus its limbs,
// so animatePerson can swing them.
//
// `look` fields: shirt, pants, skin, hair (colors); optional hairStyle
// ('short'|'long'|'spiky'|'bald'), hat ('cap'|'tophat'|'beanie'),
// hatColor, glasses (sunglasses), backpack (color), mask (color, covers
// the lower face), eyes (pupil color), width (body width factor), scale.
function buildPersonMesh(look) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const width = look.width || 1;

  const add = (parent, geo, color, x, y, z) => {
    const mesh = new THREE.Mesh(geo, personMat(color));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  const legX = 0.15 * width;
  const leftLeg = add(group, boxGeo(0.24, 0.85, 0.26, true), look.pants, -legX, 0.85, 0);
  const rightLeg = add(group, boxGeo(0.24, 0.85, 0.26, true), look.pants, legX, 0.85, 0);
  const torso = add(group, boxGeo(0.62, 0.72, 0.34), look.shirt, 0, 1.21, 0);
  torso.scale.x = width;

  const armX = 0.31 * width + 0.1;
  const leftArm = add(group, boxGeo(0.18, 0.62, 0.2, true), look.shirt, -armX, 1.55, 0);
  const rightArm = add(group, boxGeo(0.18, 0.62, 0.2, true), look.shirt, armX, 1.55, 0);
  add(leftArm, boxGeo(0.17, 0.16, 0.19), look.skin, 0, -0.68, 0);
  add(rightArm, boxGeo(0.17, 0.16, 0.19), look.skin, 0, -0.68, 0);

  add(group, boxGeo(0.44, 0.44, 0.44), look.skin, 0, 1.79, 0);

  // Hair
  const style = look.hairStyle || 'short';
  if (style !== 'bald') add(group, boxGeo(0.47, 0.14, 0.47), look.hair, 0, 2.04, 0);
  if (style === 'long') add(group, boxGeo(0.47, 0.55, 0.1), look.hair, 0, 1.78, 0.22);
  if (style === 'spiky') {
    [-0.14, 0, 0.14].forEach((x) => add(group, boxGeo(0.1, 0.14, 0.1), look.hair, x, 2.17, 0));
  }

  // Hat
  if (look.hat === 'cap') {
    add(group, boxGeo(0.49, 0.14, 0.49), look.hatColor, 0, 2.08, 0);
    add(group, boxGeo(0.46, 0.04, 0.22), look.hatColor, 0, 2.03, -0.33);
  } else if (look.hat === 'tophat') {
    add(group, boxGeo(0.58, 0.04, 0.58), look.hatColor, 0, 2.06, 0);
    add(group, boxGeo(0.38, 0.42, 0.38), look.hatColor, 0, 2.29, 0);
  } else if (look.hat === 'beanie') {
    add(group, boxGeo(0.49, 0.22, 0.49), look.hatColor, 0, 2.08, 0);
  }

  // Face on the -Z (front) side of the head: eye whites, pupils, mouth.
  add(group, boxGeo(0.11, 0.11, 0.03), 0xffffff, -0.1, 1.85, -0.215);
  add(group, boxGeo(0.11, 0.11, 0.03), 0xffffff, 0.1, 1.85, -0.215);
  add(group, boxGeo(0.055, 0.07, 0.03), look.eyes || 0x111111, -0.1, 1.84, -0.232);
  add(group, boxGeo(0.055, 0.07, 0.03), look.eyes || 0x111111, 0.1, 1.84, -0.232);
  if (look.glasses) add(group, boxGeo(0.42, 0.1, 0.03), 0x111111, 0, 1.85, -0.24);
  if (look.mask) {
    add(group, boxGeo(0.46, 0.17, 0.46), look.mask, 0, 1.69, 0);
  } else {
    add(group, boxGeo(0.16, 0.035, 0.03), 0x7a2e2e, 0, 1.7, -0.222);
  }

  if (look.backpack) add(group, boxGeo(0.46, 0.5, 0.2), look.backpack, 0, 1.24, 0.27);

  group.scale.setScalar(PERSON_SCALE * (look.scale || 1));
  return { group, leftArm, rightArm, leftLeg, rightLeg };
}

// Walk cycle: legs and arms swing in opposition. `amount` 0..1 scales the
// swing (0 = standing still).
function animatePerson(p, phase, amount) {
  const swing = Math.sin(phase) * 0.8 * amount;
  p.leftLeg.rotation.x = swing;
  p.rightLeg.rotation.x = -swing;
  p.leftArm.rotation.x = -swing;
  p.rightArm.rotation.x = swing;
}

// Both arms thrown up in the air (used mid-hop).
function setArmsUp(p, up) {
  p.leftArm.rotation.z = up ? -2.6 : 0;
  p.rightArm.rotation.z = up ? 2.6 : 0;
}

// Right arm thrust straight forward — a punch.
function setPunch(p) {
  p.rightArm.rotation.x = -1.6;
}

// Lying flat on their back (knocked out) or standing up again.
function setKnockedOut(p, down) {
  p.group.rotation.x = down ? Math.PI / 2 : 0;
}

// Moves `pos` toward `target` at `speed`, sliding along buildings instead
// of passing through them. Returns { arrived, blocked, heading }.
function stepToward(pos, target, speed, dt, buildings, radius = PERSON_RADIUS) {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return { arrived: true, blocked: false, heading: null };
  const step = Math.min(dist, speed * dt);
  const sx = (dx / dist) * step;
  const sz = (dz / dist) * step;
  let moved = false;
  if (!collidesWithBuilding(pos.x + sx, pos.z, buildings, radius)) {
    pos.x += sx;
    moved = true;
  }
  if (!collidesWithBuilding(pos.x, pos.z + sz, buildings, radius)) {
    pos.z += sz;
    moved = true;
  }
  return {
    arrived: Math.hypot(target.x - pos.x, target.z - pos.z) < 0.2,
    blocked: !moved,
    heading: Math.atan2(-dx, -dz),
  };
}

// A random spot between minR and maxR from `center` that isn't inside a
// building, or null if none was found in a few tries.
function findFreeSpot(center, minR, maxR, buildings) {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    if (!collidesWithBuilding(x, z, buildings, 0.8)) return { x, z };
  }
  return null;
}

class Pedestrian {
  constructor(scene, position) {
    this.figure = buildPersonMesh(randomPersonLook());
    scene.add(this.figure.group);
    this.position = { x: position.x, z: position.z };
    this.heading = Math.random() * Math.PI * 2;
    this.speed = Math.random() < 0.12 ? PED_JOGGER_SPEED : PED_SPEED_MIN + Math.random() * (PED_SPEED_MAX - PED_SPEED_MIN);
    this.phase = Math.random() * 10;
    this.y = 0;
    this.vy = 0;
    this.dodge = { x: 0, z: 0 };
    this.target = null;
    this.pause = Math.random() * 2;
  }

  pickTarget(buildings) {
    this.target = findFreeSpot(this.position, 4, PED_WANDER_STEP, buildings);
    if (!this.target) this.pause = 1;
  }

  update(dt, car, viewer, buildings) {
    const group = this.figure.group;

    const fromViewer = dist2D(this.position, viewer);
    if (fromViewer > PED_RECYCLE_DIST) {
      // Wandered off (or you drove away): pop back in somewhere around you,
      // out in the fog, so the streets near you always have people.
      const spot = findFreeSpot(viewer, PED_RESPAWN_MIN, PED_RESPAWN_MAX, buildings);
      if (spot) {
        this.position = spot;
        this.target = null;
      }
    }
    group.visible = dist2D(this.position, viewer) < PED_VISIBLE_DIST;
    if (!group.visible) return;

    // Jump out of the way of a car coming at you.
    if (car && car.speedKmh > 3 && this.y === 0 && dist2D(this.position, car.position) < PED_DODGE_DIST) {
      const ax = this.position.x - car.position.x;
      const az = this.position.z - car.position.z;
      const len = Math.hypot(ax, az) || 1;
      this.vy = 6;
      this.dodge = { x: (ax / len) * 6, z: (az / len) * 6 };
    }

    const airborne = this.y > 0 || this.vy > 0;
    if (airborne) {
      this.vy -= PED_GRAVITY * dt;
      this.y += this.vy * dt;
      this.position.x += this.dodge.x * dt;
      this.position.z += this.dodge.z * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
      }
      setArmsUp(this.figure, this.y > 0);
      animatePerson(this.figure, 0, 0);
    } else if (this.pause > 0) {
      this.pause -= dt;
      animatePerson(this.figure, 0, 0);
    } else {
      if (!this.target) this.pickTarget(buildings);
      if (this.target) {
        const res = stepToward(this.position, this.target, this.speed, dt, buildings);
        if (res.heading !== null) this.heading = res.heading;
        if (res.arrived || res.blocked) {
          this.target = null;
          if (Math.random() < 0.4) this.pause = 1 + Math.random() * 3; // stop and look around
        }
        this.phase += dt * (3 + this.speed * 2.2);
        animatePerson(this.figure, this.phase, Math.min(1, this.speed / 2));
      }
    }

    group.position.set(this.position.x, this.y, this.position.z);
    group.rotation.y = this.heading;
  }
}

class PedestrianManager {
  constructor(scene) {
    this.scene = scene;
    this.people = [];
  }

  init(buildings) {
    for (let i = 0; i < PED_COUNT; i++) {
      const spot = findFreeSpot({ x: 0, z: 0 }, 5, 150, buildings) || { x: 0, z: 0 };
      this.people.push(new Pedestrian(this.scene, spot));
    }
  }

  // `car` is the player's car while driving (pedestrians dodge it), and
  // `viewer` is where the player is (to hide/recycle far-away people).
  update(dt, car, viewer, buildings) {
    for (const p of this.people) p.update(dt, car, viewer, buildings);
  }
}
