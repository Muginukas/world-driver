// Bodyguards and villain gangs.
//
// Guards (dark suits, sunglasses) follow you around in a little
// formation and keep up even when you sprint. When villains come close
// they run over and fight them off. While you drive they ride along with
// you and hop out when you get out. Guards can be knocked out in a fight
// (villains land a hurting blow now and then); a replacement guard comes
// running in a little later.
//
// Villains (black clothes, masks, red eyes) roam in gangs of ten, walking
// around the city together. If one of them spots you on foot the whole
// gang charges and surrounds you, hitting you; your health drops and if
// it hits zero you're knocked out (respawn at the start). You can outrun
// them, punch them yourself (action button when one is next to you), let
// your guards deal with them, or run them over with a car. Knocked-out
// villains rejoin their gang after a while.

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
const GUARD_HP = 8;
const GUARD_HURT_CHANCE = 0.3; // chance a villain's swing actually hurts a guard
const GUARD_REPLACE_TIME = 20; // seconds until a knocked-out guard is replaced

const GANG_COUNT = 3;
const GANG_SIZE = 10;
const GANG_SPAWN_MIN = 90;
const GANG_SPAWN_MAX = 160;
const GANG_RECYCLE_DIST = 240;
const GANG_ALERT_TIME = 4; // seconds the whole gang keeps chasing after one spots you

const VILLAIN_HP = 3;
const VILLAIN_SIGHT = 24;
const VILLAIN_CHASE_SPEED = 5.2;
const VILLAIN_WALK_SPEED = 1.3;
const VILLAIN_HIT_DAMAGE = 7;
const VILLAIN_HIT_INTERVAL = 0.9;
const VILLAIN_RESPAWN_TIME = 15;
const VILLAIN_VISIBLE_DIST = 170;
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

// Spot `i` of `n` spread evenly around a circle — used to make a gang walk
// as a loose crowd and to surround you instead of all piling onto one spot.
function ringOffset(i, n, radius) {
  const a = (i / n) * Math.PI * 2;
  return { x: Math.cos(a) * radius, z: Math.sin(a) * radius };
}

class Gang {
  constructor() {
    this.center = { x: 0, z: 0 };
    this.target = null;
    this.members = [];
    this.alert = 0; // >0 while the gang is charging you
  }

  // Where member `i` walks while the gang strolls around.
  slot(i) {
    const inner = i < 4;
    const o = ringOffset(inner ? i : i - 4, inner ? 4 : GANG_SIZE - 4, inner ? 1.6 : 3.2);
    return { x: this.center.x + o.x, z: this.center.z + o.z };
  }

  moveTo(spot) {
    this.center = { x: spot.x, z: spot.z };
    this.target = null;
    this.alert = 0;
    this.members.forEach((v, i) => {
      if (!v.dead) v.position = this.slot(i);
    });
  }

  update(dt, ctx) {
    const { buildings, viewerPos } = ctx;
    this.alert -= dt;
    if (dist2D(this.center, viewerPos) > GANG_RECYCLE_DIST) {
      // Left far behind (you ran, drove or travelled away): the gang turns
      // up somewhere else around you instead.
      const spot = findFreeSpot(viewerPos, GANG_SPAWN_MIN, GANG_SPAWN_MAX, buildings);
      if (spot) this.moveTo(spot);
      return;
    }
    if (this.alert > 0) {
      // Charging: the gang's center follows its members.
      const alive = this.members.filter((v) => !v.dead);
      if (alive.length) {
        this.center = {
          x: alive.reduce((s, v) => s + v.position.x, 0) / alive.length,
          z: alive.reduce((s, v) => s + v.position.z, 0) / alive.length,
        };
      }
      return;
    }
    if (!this.target) this.target = findFreeSpot(this.center, 10, 40, buildings);
    if (this.target) {
      const res = stepToward(this.center, this.target, VILLAIN_WALK_SPEED, dt, buildings, 1.5);
      if (res.arrived || res.blocked) this.target = null;
    }
  }
}

class Villain {
  constructor(scene, gang, index) {
    this.gang = gang;
    this.index = index;
    this.figure = buildPersonMesh(villainLook());
    scene.add(this.figure.group);
    this.dot = buildMinimapDot(scene, 0x5a0000);
    this.position = { x: 0, z: 0 };
    this.heading = 0;
    this.hp = VILLAIN_HP;
    this.dead = false;
    this.deadTimer = 0;
    this.hitCooldown = Math.random();
    this.punchAnim = 0;
    this.phase = Math.random() * 10;
    this.engagedBy = null; // guard fighting this villain
    this.knock = { x: 0, z: 0 };
  }

  revive() {
    this.position = this.gang.slot(this.index);
    this.hp = VILLAIN_HP;
    this.dead = false;
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
    this.engagedBy = null;
    setKnockedOut(this.figure, true);
  }

  // Swing at a guard: only sometimes actually hurts.
  hitGuard(guard) {
    this.heading = headingTo(this.position, guard.position);
    if (this.hitCooldown > 0) return;
    this.hitCooldown = VILLAIN_HIT_INTERVAL;
    this.punchAnim = 0.2;
    if (Math.random() < GUARD_HURT_CHANCE) guard.takeHit(1);
  }

  update(dt, ctx) {
    const { player, buildings, guards } = ctx;
    const g = this.figure.group;
    const viewer = ctx.viewerPos;

    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer < VILLAIN_RESPAWN_TIME - 3) g.visible = false; // lies there a moment, then gone
      if (this.deadTimer <= 0 && dist2D(this.gang.slot(this.index), player.position) > 30) this.revive();
      this.syncMesh();
      return;
    }

    g.visible = dist2D(this.position, viewer) < VILLAIN_VISIBLE_DIST;

    // Run over by your car.
    if (ctx.car && ctx.car.speedKmh > VILLAIN_RUN_OVER_KMH && dist2D(this.position, ctx.car.position) < 2.2) {
      this.knockOut();
      this.syncMesh();
      return;
    }

    // Knockback slide from a punch.
    if (this.knock.x || this.knock.z) {
      const k = this.knock;
      stepToward(this.position, { x: this.position.x + k.x, z: this.position.z + k.z }, Math.hypot(k.x, k.z), dt, buildings);
      k.x *= Math.max(0, 1 - dt * 8);
      k.z *= Math.max(0, 1 - dt * 8);
      if (Math.hypot(k.x, k.z) < 0.1) this.knock = { x: 0, z: 0 };
    }

    this.hitCooldown -= dt;
    this.punchAnim -= dt;
    let moveSpeed = 0;

    const playerOnFoot = !player.isDriving && !player.dead;
    const toPlayer = dist2D(this.position, player.position);
    if (playerOnFoot && toPlayer < VILLAIN_SIGHT) this.gang.alert = GANG_ALERT_TIME;

    const eg = this.engagedBy;
    const fightingGuard = eg && !eg.dead && dist2D(eg.position, this.position) < MELEE_RANGE + 0.6 ? eg : null;
    // A guard standing right next to you while you charge gets hit too.
    const guardInWay = fightingGuard || guards.find((gd) => !gd.dead && !gd.riding
      && dist2D(gd.position, this.position) < MELEE_RANGE + 0.2
      && dist2D(gd.position, this.position) < toPlayer);

    if (guardInWay) {
      this.hitGuard(guardInWay);
    } else if (playerOnFoot && this.gang.alert > 0 && toPlayer < 70) {
      // Charge: surround you, each from their own side.
      const o = ringOffset(this.index, GANG_SIZE, MELEE_RANGE * 0.85);
      const spot = { x: player.position.x + o.x, z: player.position.z + o.z };
      if (toPlayer > MELEE_RANGE) {
        const res = stepToward(this.position, spot, VILLAIN_CHASE_SPEED, dt, buildings);
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
      // Stroll along with the gang.
      const slot = this.gang.slot(this.index);
      const d = dist2D(this.position, slot);
      if (d > 0.3) {
        const speed = Math.min(VILLAIN_CHASE_SPEED, Math.max(VILLAIN_WALK_SPEED, d * 1.5));
        const res = stepToward(this.position, slot, speed, dt, buildings);
        if (res.heading !== null) this.heading = res.heading;
        moveSpeed = speed;
        if (res.blocked && d > 15) this.position = slot; // stuck on a building
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
    this.hp = GUARD_HP;
    this.dead = false;
    this.deadTimer = 0;
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

  takeHit(amount) {
    if (this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.dead = true;
      this.deadTimer = GUARD_REPLACE_TIME;
      if (this.target && this.target.engagedBy === this) this.target.engagedBy = null;
      this.target = null;
      setKnockedOut(this.figure, true);
      this.dot.visible = false;
    }
  }

  // A fresh guard comes running in from behind you.
  replace(player) {
    this.dead = false;
    this.hp = GUARD_HP;
    setKnockedOut(this.figure, false);
    const fwd = forwardVec(player.avatarHeading);
    this.position = { x: player.position.x - fwd.x * 25, z: player.position.z - fwd.z * 25 };
  }

  update(dt, ctx) {
    const { player, buildings } = ctx;
    const g = this.figure.group;

    if (this.dead) {
      this.deadTimer -= dt;
      g.visible = this.deadTimer > GUARD_REPLACE_TIME - 4; // lies there a few seconds, then gone
      g.position.set(this.position.x, 0.12, this.position.z);
      if (this.deadTimer <= 0 && !player.isDriving) this.replace(player);
      return;
    }

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
    this.gangs = [];
    this.villains = [];
  }

  // Villains need the buildings to find somewhere to stand, so they're
  // added once the city is built.
  init(buildings) {
    for (let i = 0; i < GANG_COUNT; i++) {
      const gang = new Gang();
      for (let j = 0; j < GANG_SIZE; j++) {
        const v = new Villain(this.scene, gang, j);
        gang.members.push(v);
        this.villains.push(v);
      }
      gang.moveTo(findFreeSpot({ x: 0, z: 0 }, GANG_SPAWN_MIN, GANG_SPAWN_MAX * 1.5, buildings) || { x: 200, z: 200 });
      this.gangs.push(gang);
    }
  }

  get guardsStanding() {
    return this.guards.filter((g) => !g.dead).length;
  }

  assignGuards() {
    const player = this.player;
    if (player.isDriving) return;
    const threats = this.villains
      .filter((v) => !v.dead && dist2D(v.position, player.position) < GUARD_PROTECT_RADIUS)
      .filter((v) => !this.guards.some((g) => g.target === v))
      .sort((a, b) => dist2D(a.position, player.position) - dist2D(b.position, player.position));
    for (const guard of this.guards) {
      if (guard.dead || guard.target || !threats.length) continue;
      guard.target = threats.shift();
    }
  }

  update(dt, ctx) {
    ctx.player = this.player;
    ctx.guards = this.guards;
    this.assignGuards();
    for (const g of this.guards) g.update(dt, ctx);
    for (const gang of this.gangs) gang.update(dt, ctx);
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

  // After you respawn or travel somewhere: move nearby gangs away and
  // bring the guards to your side.
  onPlayerMoved(buildings) {
    for (const gang of this.gangs) {
      if (dist2D(gang.center, this.player.position) < GANG_SPAWN_MIN) {
        const spot = findFreeSpot(this.player.position, GANG_SPAWN_MIN, GANG_SPAWN_MAX, buildings);
        if (spot) gang.moveTo(spot);
      }
    }
    this.guards.forEach((g) => {
      g.target = null;
      if (!g.dead) g.position = g.slotPosition(this.player);
    });
  }
}
