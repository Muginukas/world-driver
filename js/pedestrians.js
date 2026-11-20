// Blocky "Roblox-style" little people: a shared figure builder (also used
// for the player's own avatar, see player.js) plus ambient pedestrians
// strolling the sidewalks of every road and milling around the spawn.
// They hop out of the way, arms up, if you drive at them.

const PED_SPEED_MIN = 1.2; // m/s
const PED_SPEED_MAX = 2.2;
const PED_JOGGER_SPEED = 3.5;
const PEDS_PER_SIDEWALK = 8; // per road side
const PED_WANDERERS = 14; // milling around the spawn point
const PED_WANDER_RADIUS = 22;
const PED_VISIBLE_DIST = 160; // beyond this (deep in the fog) they're just hidden
const PED_DODGE_DIST = 2.8;
const PED_GRAVITY = 18;

const SHIRT_COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0xffffff, 0x34495e, 0xff6fae];
const PANTS_COLORS = [0x2c3e50, 0x1f3a93, 0x5d4037, 0x212121, 0x607d8b, 0x7f8c8d];
const SKIN_COLORS = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
const HAIR_COLORS = [0x2b1b0e, 0x5a3825, 0xd6b45a, 0x111111, 0x8b3a1a, 0xb0b0b0];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPersonLook() {
  return { shirt: pick(SHIRT_COLORS), pants: pick(PANTS_COLORS), skin: pick(SKIN_COLORS), hair: pick(HAIR_COLORS) };
}

// Geometries/materials are shared across every figure — only the meshes
// themselves are per-person.
const personMatCache = new Map();
function personMat(color) {
  if (!personMatCache.has(color)) personMatCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return personMatCache.get(color);
}

let personGeos = null;
function getPersonGeos() {
  if (personGeos) return personGeos;
  const leg = new THREE.BoxGeometry(0.24, 0.85, 0.26);
  leg.translate(0, -0.425, 0); // pivot at the hip
  const arm = new THREE.BoxGeometry(0.18, 0.62, 0.2);
  arm.translate(0, -0.31, 0); // pivot at the shoulder
  personGeos = {
    leg,
    arm,
    hand: new THREE.BoxGeometry(0.17, 0.16, 0.19),
    torso: new THREE.BoxGeometry(0.62, 0.72, 0.34),
    head: new THREE.BoxGeometry(0.44, 0.44, 0.44),
    hair: new THREE.BoxGeometry(0.47, 0.14, 0.47),
    eye: new THREE.BoxGeometry(0.11, 0.11, 0.03),
    pupil: new THREE.BoxGeometry(0.055, 0.07, 0.03),
    mouth: new THREE.BoxGeometry(0.16, 0.035, 0.03),
  };
  return personGeos;
}

// Builds one figure facing local -Z (same "heading 0" convention as cars,
// see geo.js), feet at y=0, about 2.1 m tall. Returns the group plus its
// limbs, so animatePerson can swing them.
function buildPersonMesh(look) {
  const g = getPersonGeos();
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  const add = (parent, geo, color, x, y, z) => {
    const mesh = new THREE.Mesh(geo, personMat(color));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  const leftLeg = add(group, g.leg, look.pants, -0.15, 0.85, 0);
  const rightLeg = add(group, g.leg, look.pants, 0.15, 0.85, 0);
  add(group, g.torso, look.shirt, 0, 1.21, 0);

  const leftArm = add(group, g.arm, look.shirt, -0.41, 1.55, 0);
  const rightArm = add(group, g.arm, look.shirt, 0.41, 1.55, 0);
  add(leftArm, g.hand, look.skin, 0, -0.68, 0);
  add(rightArm, g.hand, look.skin, 0, -0.68, 0);

  add(group, g.head, look.skin, 0, 1.79, 0);
  add(group, g.hair, look.hair, 0, 2.04, 0);

  // Face on the -Z (front) side of the head: eye whites, pupils, mouth.
  add(group, g.eye, 0xffffff, -0.1, 1.85, -0.215);
  add(group, g.eye, 0xffffff, 0.1, 1.85, -0.215);
  add(group, g.pupil, 0x111111, -0.1, 1.84, -0.232);
  add(group, g.pupil, 0x111111, 0.1, 1.84, -0.232);
  add(group, g.mouth, 0x7a2e2e, 0, 1.7, -0.222);

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

// A copy of `path` shifted sideways by `offset` metres (positive = to the
// right of the direction of travel) — i.e. a sidewalk alongside a road.
function offsetPath(path, offset) {
  return path.map((p, i) => {
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const r = rightVec(headingTo(prev, next));
    return { x: p.x + r.x * offset, z: p.z + r.z * offset };
  });
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

    // Either follows a sidewalk path back and forth...
    this.path = null;
    this.index = 0;
    this.dir = 1;
    // ...or wanders between random points around `home`.
    this.home = null;
    this.target = null;
    this.pause = 0;
  }

  setPath(path, startIndex, dir) {
    this.path = path;
    this.index = startIndex;
    this.dir = dir;
    this.position = { x: path[startIndex].x, z: path[startIndex].z };
  }

  setWander(home) {
    this.home = home;
    this.pickWanderTarget();
    this.position = { x: this.target.x, z: this.target.z };
    this.pickWanderTarget();
  }

  pickWanderTarget() {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * PED_WANDER_RADIUS;
    this.target = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
  }

  currentTarget() {
    if (this.path) {
      let t = this.path[this.index + this.dir];
      if (!t) {
        this.dir *= -1;
        t = this.path[this.index + this.dir];
      }
      return t;
    }
    return this.target;
  }

  update(dt, car, viewer) {
    const group = this.figure.group;
    group.visible = dist2D(this.position, viewer) < PED_VISIBLE_DIST;
    if (!group.visible) return; // far away: freeze in place, saves work

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
      const target = this.currentTarget();
      if (target) {
        const dx = target.x - this.position.x;
        const dz = target.z - this.position.z;
        const dist = Math.hypot(dx, dz);
        const step = this.speed * dt;
        if (dist > 0.01) this.heading = headingTo(this.position, target);
        if (step >= dist) {
          this.position = { x: target.x, z: target.z };
          if (this.path) {
            this.index += this.dir;
          } else {
            this.pickWanderTarget();
            if (Math.random() < 0.4) this.pause = 1 + Math.random() * 3; // stop and look around
          }
        } else {
          this.position.x += (dx / dist) * step;
          this.position.z += (dz / dist) * step;
        }
        this.phase += dt * (3 + this.speed * 2.2);
        animatePerson(this.figure, this.phase, Math.min(1, this.speed / 2));
      }
    }

    group.position.set(this.position.x, SIDEWALK_TOP + this.y, this.position.z);
    group.rotation.y = this.heading;
  }
}

class PedestrianManager {
  constructor(scene) {
    this.scene = scene;
    this.people = [];
  }

  init(projectedRoutes) {
    for (const path of projectedRoutes) {
      if (!path || path.length < 2) continue;
      for (const side of [1, -1]) {
        const sidewalk = offsetPath(path, SIDEWALK_OFFSET * side);
        for (let i = 0; i < PEDS_PER_SIDEWALK; i++) {
          const ped = new Pedestrian(this.scene, sidewalk[0]);
          const start = Math.floor(Math.random() * (sidewalk.length - 1));
          ped.setPath(sidewalk, start, Math.random() < 0.5 ? 1 : -1);
          this.people.push(ped);
        }
      }
    }

    for (let i = 0; i < PED_WANDERERS; i++) {
      const ped = new Pedestrian(this.scene, { x: 0, z: 0 });
      ped.setWander({ x: 0, z: 0 });
      this.people.push(ped);
    }
  }

  // `car` is the player's car while driving (pedestrians dodge it), and
  // `viewer` is where the player is (to hide far-away people).
  update(dt, car, viewer) {
    for (const p of this.people) p.update(dt, car, viewer);
  }
}
