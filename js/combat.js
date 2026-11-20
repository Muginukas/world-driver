// Bodyguards and villains.
//
// Guards (dark suits, sunglasses) follow you around in a little
// formation and keep up even when you sprint. When a villain comes close
// they run over and fight it off. While you drive they ride along with
// you and hop out when you get out.
//
// Villains (black clothes, masks, red eyes) roam the city. If they spot
// you on foot they chase you and hit you; your health drops and if it
// hits zero you're knocked out (respawn at the start). You can outrun
// them, punch them yourself (action button when one is next to you), let
// your guards deal with them, or run them over with a car. Knocked-out
// villains come back after a while somewhere else.

const GUARD_SLOTS = [
  { side: -1.3, back: 1.0 },
  { side: 1.3, back: 1.0 },
  { side: 1.0, back: -1.4 }, // a step ahead, off to the side, so it never blocks the camera
];
const GUARD_PROTECT_RADIUS = 20; // villains this close to you get intercepted
const GUARD_RUN_SPEED = 10; // m/s when going after a villain
const GUARD_MAX_SPEED = 16; // m/s catching up to you (you can run 13.9)
const GUARD_TELEPORT_DIST = 35; // stuck/left behind: just reappear by your side
const GUARD_PUNCH_INTERVAL = 0.55;

const VILLAIN_COUNT = 8;
const VILLAIN_HP = 3;
const VILLAIN_SIGHT = 26;
const VILLAIN_CHASE_SPEED = 5.2;
const VILLAIN_WALK_SPEED = 1.3;
const VILLAIN_HIT_DAMAGE = 12;
const VILLAIN_HIT_INTERVAL = 0.9;
const VILLAIN_RESPAWN_TIME = 10;
const VILLAIN_SPAWN_MIN = 60;
const VILLAIN_SPAWN_MAX = 140;
const VILLAIN_RECYCLE_DIST = 200;
const VILLAIN_VISIBLE_DIST = 160;
const VILLAIN_RUN_OVER_KMH = 12;

const MELEE_RANGE = 0.9; // metres between two people to land a punch
const PLAYER_PUNCH_RANGE = 1.6;

const GUARD_LOOK = {
  shirt: 0x1b1f2a, pants: 0x111111, skin: 0xe0ac69, hair: 0x111111,
  hairStyle: 'short', glasses: true, width: 1.25, scale: 1.12,
};

function villainLook() {
  return {
    shirt: pick([0x222222, 0x3b0a0a, 0x2d2d2d, 0x1a1a2e]),
    pants: 0x111111,
    skin: pick(SKIN_COLORS),
    hair: 0x111111,
    hairStyle: 'bald',
    hat: 'beanie',
    hatColor: 0x111111,
    mask: 0x111111,
    eyes: 0xff1a1a,
    width: 1.1,
    scale: 1.05,
  };
}

// A dot on the minimap (layer 1: minimap camera only, never the main view).
function buildMinimapDot(scene, color) {
  const dot = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 0.3, 10),
    new THREE.MeshBasicMaterial({ color, depthTest: false })
  );
  dot.layers.set(1);
  dot.renderOrder = 998;
  scene.add(dot);
  return dot;
}

class Villain {
  constructor(scene) {
    this.figure = buildPersonMesh(villainLook());
    scene.add(this.figure.group);
    this.dot = buildMinimapDot(scene, 0x5a0000);
    this.position = { x: 0, z: 0 };
    this.heading = 0;
    this.hp = VILLAIN_HP;
    this.dead = false;
    this.deadTimer = 0;
    this.hitCooldown = 0;
    this.punchAnim = 0;
    this.phase = Math.random() * 10;
    this.target = null; // wander target
    this.engagedBy = null; // guard fighting this villain
    this.chasing = false;
    this.knock = { x: 0, z: 0 };
  }

  placeAt(spot) {
    this.position = { x: spot.x, z: spot.z };
    this.hp = VILLAIN_HP;
    this.dead = false;
    this.target = null;
    this.chasing = false;
    setKnockedOut(this.figure, false);
    this.figure.group.visible = true;
  }

  // Hit by a guard or by you; `from` is the hitter's position.
  takeHit(from, amount = 1) {
    if (this.dead) return;
    this.hp -= amount;
    const ax = this.position.x - from.x;
    const az = this.position.z - from.z;
    const len = Math.hypot(ax, az) || 1;
    this.knock = { x: (ax / len) * 5, z: (az / len) * 5 };
    if (this.hp <= 0) this.knockOut();
  }

  knockOut() {
    this.dead = true;
    this.deadTimer = VILLAIN_RESPAWN_TIME;
    this.chasing = false;
    this.engagedBy = null;
    setKnockedOut(this.figure, true);
  }

  update(dt, ctx) {
    const { player, buildings } = ctx;
    const g = this.figure.group;
    const viewer = ctx.viewerPos;

    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer < VILLAIN_RESPAWN_TIME - 3) g.visible = false; // lies there a moment, then gone
      if (this.deadTimer <= 0) {
        const spot = findFreeSpot(viewer, VILLAIN_SPAWN_MIN, VILLAIN_SPAWN_MAX, buildings);
        if (spot) this.placeAt(spot);
        else this.deadTimer = 1;
      }
      this.syncMesh();
      return;
    }

    const fromViewer = dist2D(this.position, viewer);
    if (fromViewer > VILLAIN_RECYCLE_DIST) {
      const spot = findFreeSpot(viewer, VILLAIN_SPAWN_MIN, VILLAIN_SPAWN_MAX, buildings);
      if (spot) this.placeAt(spot);
    }
    g.visible = fromViewer < VILLAIN_VISIBLE_DIST;

    // Run over by your car.
    if (ctx.car && ctx.car.speedKmh > VILLAIN_RUN_OVER_KMH && dist2D(this.position, ctx.car.position) < 2.2) {
      this.knockOut();
      this.syncMesh();
      return;
    }

    // Knockback slide from a punch.
    if (this.knock.x || this.knock.z) {
      stepToward(this.position, { x: this.position.x + this.knock.x, z: this.position.z + this.knock.z }, Math.hypot(this.knock.x, this.knock.z), dt, buildings);
      this.knock.x *= Math.max(0, 1 - dt * 8);
      this.knock.z *= Math.max(0, 1 - dt * 8);
      if (Math.hypot(this.knock.x, this.knock.z) < 0.1) this.knock = { x: 0, z: 0 };
    }

    this.hitCooldown -= dt;
    this.punchAnim -= dt;
    let moveSpeed = 0;

    const guard = this.engagedBy;
    const playerOnFoot = !player.isDriving && !player.dead;
    const toPlayer = dist2D(this.position, player.position);

    if (guard && dist2D(guard.position, this.position) < MELEE_RANGE + 0.6) {
      // Busy fighting a bodyguard: stand and swing at them.
      this.heading = headingTo(this.position, guard.position);
      if (this.hitCooldown <= 0) {
        this.hitCooldown = VILLAIN_HIT_INTERVAL;
        this.punchAnim = 0.2;
      }
      this.chasing = false;
    } else if (playerOnFoot && toPlayer < VILLAIN_SIGHT) {
      this.chasing = true;
      if (toPlayer > MELEE_RANGE) {
        const res = stepToward(this.position, player.position, VILLAIN_CHASE_SPEED, dt, buildings);
        if (res.heading !== null) this.heading = res.heading;
        moveSpeed = VILLAIN_CHASE_SPEED;
      } else {
        this.heading = headingTo(this.position, player.position);
        if (this.hitCooldown <= 0) {
          this.hitCooldown = VILLAIN_HIT_INTERVAL;
          this.punchAnim = 0.2;
          player.takeDamage(VILLAIN_HIT_DAMAGE);
        }
      }
    } else {
      this.chasing = false;
      if (!this.target) this.target = findFreeSpot(this.position, 5, 25, buildings);
      if (this.target) {
        const res = stepToward(this.position, this.target, VILLAIN_WALK_SPEED, dt, buildings);
        if (res.heading !== null) this.heading = res.heading;
        if (res.arrived || res.blocked) this.target = null;
        moveSpeed = VILLAIN_WALK_SPEED;
      }
    }

    this.phase += dt * (3 + moveSpeed * 2);
    animatePerson(this.figure, this.phase, Math.min(1, moveSpeed / 2));
    if (this.punchAnim > 0) setPunch(this.figure);
    this.syncMesh();
  }

  syncMesh() {
    const g = this.figure.group;
    g.position.set(this.position.x, this.dead ? 0.12 : 0, this.position.z);
    g.rotation.y = this.heading;
    this.dot.position.set(this.position.x, 1.5, this.position.z);
    this.dot.visible = !this.dead;
  }
}

class Guard {
  constructor(scene, slot) {
    this.figure = buildPersonMesh(GUARD_LOOK);
    scene.add(this.figure.group);
    this.dot = buildMinimapDot(scene, 0x2ecc71);
    this.slot = slot;
    this.position = { x: 0, z: 0 };
    this.heading = 0;
    this.target = null; // villain being fought
    this.punchCooldown = 0;
    this.punchAnim = 0;
    this.phase = Math.random() * 10;
    this.riding = false;
  }

  slotPosition(player) {
    const h = player.avatarHeading;
    const fwd = forwardVec(h);
    const right = rightVec(h);
    return {
      x: player.position.x + right.x * this.slot.side - fwd.x * this.slot.back,
      z: player.position.z + right.z * this.slot.side - fwd.z * this.slot.back,
    };
  }

  update(dt, ctx) {
    const { player, buildings } = ctx;
    const g = this.figure.group;

    if (player.isDriving) {
      // Riding along in the car with you.
      this.riding = true;
      this.target = null;
      g.visible = false;
      this.dot.visible = false;
      return;
    }
    if (this.riding) {
      // Just got out: hop out next to you.
      this.riding = false;
      this.position = this.slotPosition(player);
      this.heading = player.avatarHeading;
    }
    g.visible = true;
    this.dot.visible = true;

    this.punchCooldown -= dt;
    this.punchAnim -= dt;
    let moveSpeed = 0;

    if (this.target && (this.target.dead || dist2D(this.target.position, player.position) > GUARD_PROTECT_RADIUS * 1.6)) {
      if (this.target.engagedBy === this) this.target.engagedBy = null;
      this.target = null;
    }

    if (this.target) {
      const v = this.target;
      const d = dist2D(this.position, v.position);
      if (d > MELEE_RANGE) {
        const res = stepToward(this.position, v.position, GUARD_RUN_SPEED, dt, buildings);
        if (res.heading !== null) this.heading = res.heading;
        moveSpeed = GUARD_RUN_SPEED;
      } else {
        v.engagedBy = this;
        this.heading = headingTo(this.position, v.position);
        if (this.punchCooldown <= 0) {
          this.punchCooldown = GUARD_PUNCH_INTERVAL;
          this.punchAnim = 0.2;
          v.takeHit(this.position, 1);
        }
      }
    } else {
      const slot = this.slotPosition(player);
      const d = dist2D(this.position, slot);
      if (d > GUARD_TELEPORT_DIST) {
        this.position = slot;
      } else if (d > 0.15) {
        // Hurry when far behind, ease in when nearly there.
        const speed = Math.min(GUARD_MAX_SPEED, Math.max(player.speed, d * 3));
        const res = stepToward(this.position, slot, speed, dt, buildings);
        if (res.heading !== null && d > 0.6) this.heading = res.heading;
        moveSpeed = speed;
      }
      if (d <= 0.6) this.heading = player.avatarHeading;
    }

    this.phase += dt * (3 + moveSpeed * 0.8);
    animatePerson(this.figure, this.phase, Math.min(1, moveSpeed / 3));
    if (this.punchAnim > 0) setPunch(this.figure);
    g.position.set(this.position.x, 0, this.position.z);
    g.rotation.y = this.heading;
    g.rotation.x = -0.2 * Math.min(1, moveSpeed / GUARD_MAX_SPEED);
    this.dot.position.set(this.position.x, 1.5, this.position.z);
  }
}

class CombatManager {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.guards = GUARD_SLOTS.map((slot) => new Guard(scene, slot));
    this.guards.forEach((g) => {
      g.position = g.slotPosition(player);
      g.heading = player.avatarHeading;
    });
    this.villains = [];
  }

  // Villains need the buildings to find somewhere to stand, so they're
  // added once the city is built.
  init(buildings) {
    for (let i = 0; i < VILLAIN_COUNT; i++) {
      const v = new Villain(this.scene);
      const spot = findFreeSpot({ x: 0, z: 0 }, VILLAIN_SPAWN_MIN, VILLAIN_SPAWN_MAX * 1.5, buildings);
      v.placeAt(spot || { x: 200, z: 200 });
      this.villains.push(v);
    }
  }

  assignGuards() {
    const player = this.player;
    if (player.isDriving) return;
    const threats = this.villains
      .filter((v) => !v.dead && dist2D(v.position, player.position) < GUARD_PROTECT_RADIUS)
      .filter((v) => !this.guards.some((g) => g.target === v))
      .sort((a, b) => dist2D(a.position, player.position) - dist2D(b.position, player.position));
    for (const guard of this.guards) {
      if (guard.target || !threats.length) continue;
      guard.target = threats.shift();
    }
  }

  update(dt, ctx) {
    ctx.player = this.player;
    this.assignGuards();
    for (const g of this.guards) g.update(dt, ctx);
    for (const v of this.villains) v.update(dt, ctx);
  }

  // The nearest standing villain within punching reach of `pos`, or null.
  villainInReach(pos) {
    let best = null;
    let bestD = PLAYER_PUNCH_RANGE;
    for (const v of this.villains) {
      if (v.dead) continue;
      const d = dist2D(v.position, pos);
      if (d < bestD) {
        best = v;
        bestD = d;
      }
    }
    return best;
  }

  // After you respawn, clear villains away from the start point.
  onPlayerRespawn(buildings) {
    for (const v of this.villains) {
      if (!v.dead && dist2D(v.position, this.player.position) < VILLAIN_SPAWN_MIN) {
        const spot = findFreeSpot(this.player.position, VILLAIN_SPAWN_MIN, VILLAIN_SPAWN_MAX, buildings);
        if (spot) v.placeAt(spot);
      }
    }
    this.guards.forEach((g) => {
      g.target = null;
      g.position = g.slotPosition(this.player);
    });
  }
}
