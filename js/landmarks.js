// World landmarks you can travel to from the map: the Eiffel Tower
// (Paris), Big Ben (London), and in Da Nang, Vietnam, the Dragon Bridge
// and the Lady Buddha. Each city is its own "zone" far away from Vilnius
// in the same 3D world (so they never overlap), with a street grid, city
// blocks in that city's style, a few parked cars to drive, and the
// landmark itself as a big blocky model you can walk or drive up to.
//
// Models are stylised and scaled down (Roblox-block style), not accurate
// replicas.

const ZONE_STREET_SPACING = 70; // streets run at center + 35 + k*70
const ZONE_HALF = 350; // zone covers +/- this from its center
const ZONE_STREET_HALF_WIDTH = 5;

const ZONES = [
  { id: 'vilnius', name: 'Vilnius', center: { x: 0, z: 0 } },
  { id: 'paris', name: 'Paryžius', center: { x: 8000, z: 0 } },
  { id: 'london', name: 'Londonas', center: { x: -8000, z: 0 } },
  { id: 'danang', name: 'Danangas', center: { x: 0, z: 8000 } },
];

// Travel destinations shown in the map menu. `pos` is the landmark
// itself, `arrival` where you appear (on a street a short walk/drive
// away, facing it).
const DESTINATIONS = [
  {
    id: 'vilnius', zone: 'vilnius', emoji: '🏠', name: 'Vilnius — pradžia',
    fact: 'Lukiškių aikštė, iš kur prasideda žaidimas.',
    pos: { x: 0, z: 0 }, arrival: { x: 0, z: 6 },
  },
  {
    id: 'eiffel', zone: 'paris', emoji: '🗼', name: 'Eifelio bokštas',
    place: 'Paryžius, Prancūzija',
    fact: '330 m aukščio geležinis bokštas, pastatytas 1889 m. pasaulinei parodai, inžinieriaus Gustave Eiffelio.',
    pos: { x: 8000, z: 0 }, arrival: { x: 8035, z: 175 },
  },
  {
    id: 'bigben', zone: 'london', emoji: '🕰️', name: 'Big Benas',
    place: 'Londonas, Jungtinė Karalystė',
    fact: 'Taip vadinamas didysis Elžbietos bokšto (96 m, 1859 m.) varpas prie Parlamento rūmų.',
    pos: { x: -8000, z: 0 }, arrival: { x: -7965, z: 175 },
  },
  {
    id: 'dragon', zone: 'danang', emoji: '🐉', name: 'Drakono tiltas',
    place: 'Danangas, Vietnamas',
    fact: '666 m ilgio tiltas per Hano upę (atidarytas 2013 m.). Savaitgalio vakarais drakonas spjaudo ugnį ir vandenį.',
    pos: { x: 0, z: 8000 }, arrival: { x: 0, z: 8105 },
  },
  {
    id: 'buddha', zone: 'danang', emoji: '🙏', name: 'Ponios Buda',
    place: 'Danangas, Vietnamas',
    fact: '67 m aukščio balta statula prie Linh Ung pagodos Son Tra pusiasalyje — aukščiausia Buda Vietname (2010 m.).',
    pos: { x: 280, z: 7720 }, arrival: { x: 245, z: 7825 },
  },
];

function zoneById(id) {
  return ZONES.find((z) => z.id === id);
}

// Which zone a world position is in (the nearest zone center).
function zoneAt(pos) {
  let best = ZONES[0];
  let bestD = Infinity;
  for (const z of ZONES) {
    const d = dist2D(pos, z.center);
    if (d < bestD) {
      best = z;
      bestD = d;
    }
  }
  return best;
}

// ---------- small building blocks ----------

const lmMatCache = new Map();
function lmMat(color, basic = false) {
  const key = color + (basic ? 'b' : 'l');
  if (!lmMatCache.has(key)) {
    lmMatCache.set(key, basic
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshLambertMaterial({ color }));
  }
  return lmMatCache.get(key);
}

function lmBox(parent, w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lmMat(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// A square beam of thickness `t` from point a to point b.
function lmBeam(parent, a, b, t, color) {
  const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, len, t), lmMat(color));
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(m);
  return m;
}

function rectCollider(x, z, hw, hd, rotY = 0) {
  return { x, z, hw, hd, rotY };
}

function lmTree(parent, x, z, palm) {
  if (palm) {
    lmBox(parent, 0.6, 8, 0.6, 0x8d6e47, x, 4, z);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leaf = lmBox(parent, 0.5, 0.3, 4, 0x2e9e4a, x + Math.sin(a) * 1.6, 7.6, z + Math.cos(a) * 1.6);
      leaf.rotation.y = a;
      leaf.rotation.x = 0.35;
    }
  } else {
    lmBox(parent, 0.5, 2.5, 0.5, 0x6d4c41, x, 1.25, z);
    lmBox(parent, 2.6, 2.6, 2.6, 0x3f9b46, x, 3.6, z);
  }
}

// ---------- zone streets and city blocks ----------

function addZoneStreets(scene, c) {
  const mat = lmMat(0x555555);
  for (let k = -5; k <= 4; k++) {
    const off = 35 + k * ZONE_STREET_SPACING;
    const alongX = new THREE.Mesh(new THREE.PlaneGeometry(ZONE_HALF * 2, ZONE_STREET_HALF_WIDTH * 2), mat);
    alongX.rotation.x = -Math.PI / 2;
    alongX.position.set(c.x, 0.02, c.z + off);
    scene.add(alongX);
    const alongZ = new THREE.Mesh(new THREE.PlaneGeometry(ZONE_STREET_HALF_WIDTH * 2, ZONE_HALF * 2), mat);
    alongZ.rotation.x = -Math.PI / 2;
    alongZ.position.set(c.x + off, 0.03, c.z);
    scene.add(alongZ);
  }
}

// Four buildings per city block (blocks sit between the streets), in the
// zone's colors, skipping anywhere `isClear(x, z)` says to keep open.
// Paris gets dark mansard roof caps on top. Returns colliders.
function addZoneBlocks(scene, c, style, isClear) {
  const list = [];
  for (let bx = -4; bx <= 4; bx++) {
    for (let bz = -4; bz <= 4; bz++) {
      const blockX = c.x + bx * ZONE_STREET_SPACING;
      const blockZ = c.z + bz * ZONE_STREET_SPACING;
      for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const w = 18 + Math.random() * 8;
        const d = 18 + Math.random() * 8;
        const x = blockX + qx * 14.5;
        const z = blockZ + qz * 14.5;
        const r = Math.hypot(w, d) / 2;
        if (!isClear(x, z, r)) continue;
        list.push({ x, z, w, d, h: style.minH + Math.random() * (style.maxH - style.minH) });
      }
    }
  }

  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const walls = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
  const roofs = style.roof ? new THREE.InstancedMesh(geo, lmMat(style.roof), list.length) : null;
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  list.forEach((b, i) => {
    m.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z);
    walls.setMatrixAt(i, m);
    col.setHex(style.palette[Math.floor(Math.random() * style.palette.length)]);
    walls.setColorAt(i, col);
    if (roofs) {
      m.makeScale(b.w - 1.5, 3.5, b.d - 1.5).setPosition(b.x, b.h, b.z);
      roofs.setMatrixAt(i, m);
    }
  });
  walls.instanceMatrix.needsUpdate = true;
  if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
  walls.frustumCulled = false;
  scene.add(walls);
  if (roofs) {
    roofs.instanceMatrix.needsUpdate = true;
    roofs.frustumCulled = false;
    scene.add(roofs);
  }
  return list.map((b) => rectCollider(b.x, b.z, b.w / 2, b.d / 2));
}

// ---------- the landmarks ----------

// Eiffel Tower, ~150 m: four splayed legs with arches between them, two
// platforms, a tapering upper tower with cross-bracing, and an antenna.
// You can walk or drive right underneath it between the legs.
function buildEiffel(scene, p) {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  const iron = 0x7a5c3e;
  const legAt = (y0, y1, r0, r1, y) => r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
  const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  for (const [sx, sz] of corners) {
    lmBeam(g, { x: sx * 30, y: 0, z: sz * 30 }, { x: sx * 9, y: 57, z: sz * 9 }, 5, iron);
    lmBeam(g, { x: sx * 24, y: 0, z: sz * 24 }, { x: sx * 7, y: 57, z: sz * 7 }, 1.6, iron);
    lmBeam(g, { x: sx * 9, y: 57, z: sz * 9 }, { x: sx * 2.2, y: 135, z: sz * 2.2 }, 2.6, iron);
  }

  // Square frames (platforms and cross-bracing) at given heights.
  const ring = (y, half, t) => {
    lmBox(g, half * 2 + t, t, t, iron, 0, y, half);
    lmBox(g, half * 2 + t, t, t, iron, 0, y, -half);
    lmBox(g, t, t, half * 2 + t, iron, half, y, 0);
    lmBox(g, t, t, half * 2 + t, iron, -half, y, 0);
  };
  ring(26, legAt(0, 57, 30, 9, 26), 5); // first platform
  ring(42, legAt(0, 57, 30, 9, 42), 1.5);
  ring(57, 9.5, 3); // second platform
  [75, 95, 115].forEach((y) => ring(y, legAt(57, 135, 9, 2.2, y), 1.2));

  // Arches between the legs under the first platform.
  for (let i = 0; i < 4; i++) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(22, 1, 6, 20, Math.PI), lmMat(iron));
    arch.position.set(0, 4, 0);
    arch.rotation.y = (i * Math.PI) / 2;
    arch.translateZ(25);
    g.add(arch);
  }

  lmBox(g, 6, 7, 6, iron, 0, 138.5, 0);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 14, 6), lmMat(0x9e9e9e));
  antenna.position.set(0, 149, 0);
  g.add(antenna);

  scene.add(g);

  // Champ de Mars: a strip of lawn with trees running south of the tower.
  for (let z = 50; z <= 160; z += 14) {
    lmTree(scene, p.x - 30, p.z + z, false);
    lmTree(scene, p.x + 30, p.z + z, false);
  }

  return corners.map(([sx, sz]) => rectCollider(p.x + sx * 28, p.z + sz * 28, 4, 4));
}

function buildClockTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#f7f3e3';
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 4;
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(64 + Math.sin(a) * 46 - 3, 64 - Math.cos(a) * 46 - 3, 6, 6);
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(64, 64);
  ctx.lineTo(64, 28); // minute hand -> 12
  ctx.moveTo(64, 64);
  ctx.lineTo(90, 64); // hour hand -> 3
  ctx.stroke();
  return new THREE.CanvasTexture(c);
}

// Big Ben (the Elizabeth Tower), ~95 m: sandstone tower, clock faces on
// all four sides, belfry, and a pointed green-grey spire with a gold tip,
// with the long Houses of Parliament beside it and a red double-decker
// bus parked out front.
function buildBigBen(scene, p) {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  const stone = 0xcdb479;
  const dark = 0x8c7a4f;

  lmBox(g, 12, 55, 12, stone, 0, 27.5, 0);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    lmBox(g, 1.4, 55, 1.4, dark, sx * 6, 27.5, sz * 6);
  }
  lmBox(g, 13.5, 9, 13.5, stone, 0, 59.5, 0);
  const clockMat = new THREE.MeshLambertMaterial({ map: buildClockTexture() });
  for (let i = 0; i < 4; i++) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), clockMat);
    face.rotation.y = (i * Math.PI) / 2;
    face.position.set(0, 59.5, 0);
    face.translateZ(6.8);
    g.add(face);
  }
  lmBox(g, 12, 7, 12, stone, 0, 67.5, 0);
  for (let i = 0; i < 4; i++) {
    const opening = lmBox(g, 6, 4.5, 0.4, 0x3a3020, 0, 67.5, 0);
    opening.rotation.y = (i * Math.PI) / 2;
    opening.translateZ(6.05);
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(9, 20, 4), lmMat(0x3d4a3d));
  spire.position.set(0, 81, 0);
  spire.rotation.y = Math.PI / 4;
  g.add(spire);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.6, 6, 6), lmMat(0xd4af37));
  tip.position.set(0, 94, 0);
  g.add(tip);

  // Houses of Parliament, stretching west from the tower.
  lmBox(g, 110, 18, 22, stone, -70, 9, 0);
  for (let x = -120; x <= -20; x += 14) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 4), lmMat(0x3d4a3d));
    s.position.set(x, 21.5, -10);
    g.add(s);
    lmBox(g, 2.4, 5, 2.4, dark, x, 20.5, 10);
  }

  // Red double-decker bus.
  const bus = new THREE.Group();
  bus.position.set(35, 0, 60);
  lmBox(bus, 2.6, 4.2, 10, 0xc62828, 0, 2.5, 0);
  lmBox(bus, 2.7, 0.8, 9.4, 0x263238, 0, 2.2, 0);
  lmBox(bus, 2.7, 0.8, 9.4, 0x263238, 0, 3.9, 0);
  for (const [x, z] of [[-1.3, 3.5], [1.3, 3.5], [-1.3, -3.5], [1.3, -3.5]]) lmBox(bus, 0.4, 1, 1, 0x111111, x, 0.5, z);
  g.add(bus);
  // Red phone box.
  lmBox(g, 1.2, 2.6, 1.2, 0xc62828, 28, 1.3, 70);

  scene.add(g);
  return [
    rectCollider(p.x, p.z, 7, 7),
    rectCollider(p.x - 70, p.z, 55, 11),
    rectCollider(p.x + 35, p.z + 60, 1.5, 5.2),
  ];
}

// Dragon Bridge over the Han River: a wide road deck across the water
// with a long yellow steel dragon arching over the middle in humps, head
// raised at the north end breathing (flickering) fire. Drive across on
// either side of the dragon. Returns colliders plus an update() for the
// fire.
function buildDragonBridge(scene, p) {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  const yellow = 0xf2c200;

  // River (blocks you everywhere except on the bridge) and banks.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(ZONE_HALF * 2, 90), lmMat(0x1c5a87));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.06;
  g.add(water);

  // Deck, side railings and approach roads.
  lmBox(g, 24, 0.4, 124, 0x6e6e6e, 0, 0.15, 0);
  lmBox(g, 0.5, 1, 124, yellow, 12, 0.8, 0);
  lmBox(g, 0.5, 1, 124, yellow, -12, 0.8, 0);
  for (const s of [1, -1]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(24, 50), lmMat(0x555555));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.04, s * 85);
    g.add(road);
  }

  // Dragon body: humps along the deck, from tail (south) to head (north).
  const pts = [];
  const N = 70;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const z = 58 - s * 116;
    let y;
    if (s < 0.88) y = 1.8 + 10 * Math.abs(Math.sin((s / 0.88) * Math.PI * 3));
    else y = 1.8 + ((s - 0.88) / 0.12) * 7;
    pts.push({ x: 0, y, z });
  }
  for (let i = 0; i < N; i++) {
    lmBeam(g, pts[i], pts[i + 1], 2.4, yellow);
    if (i % 2 === 0) lmBox(g, 0.5, 1.2, 0.8, 0xe65100, 0, pts[i].y + 1.6, pts[i].z);
  }

  // Head with snout, open jaw, red eyes and horns.
  const head = new THREE.Group();
  const hp = pts[N];
  head.position.set(0, hp.y + 0.5, hp.z - 1.5);
  lmBox(head, 4, 3.4, 5, yellow, 0, 0, 0);
  lmBox(head, 3, 1.6, 3.5, yellow, 0, 0.4, -3.6);
  const jaw = lmBox(head, 2.8, 0.8, 3.5, yellow, 0, -1.5, -3.2);
  jaw.rotation.x = 0.35;
  lmBox(head, 0.7, 0.7, 0.3, 0xd50000, 1.3, 1, -2.6);
  lmBox(head, 0.7, 0.7, 0.3, 0xd50000, -1.3, 1, -2.6);
  for (const sx of [1, -1]) {
    const horn = lmBox(head, 0.5, 3, 0.5, 0xe65100, sx * 1.3, 2.6, 1.5);
    horn.rotation.x = -0.6;
  }
  g.add(head);

  // Fire breath: cones pointing north out of the mouth.
  const fire = new THREE.Group();
  fire.position.set(0, hp.y, hp.z - 7.5);
  const flames = [
    [0xff6d00, 1.6, 7],
    [0xffab00, 1.1, 5],
    [0xffff8d, 0.6, 3],
  ].map(([color, r, h]) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), lmMat(color, true));
    f.rotation.x = -Math.PI / 2; // tip forward (-Z)
    f.position.z = -h / 2;
    fire.add(f);
    return f;
  });
  g.add(fire);

  scene.add(g);

  // Colliders: the river on both sides of the deck, and the dragon's
  // feet where its body touches down in the middle of the deck.
  const colliders = [
    rectCollider(p.x - (ZONE_HALF + 12.5) / 2, p.z, (ZONE_HALF - 12.5) / 2, 45),
    rectCollider(p.x + (ZONE_HALF + 12.5) / 2, p.z, (ZONE_HALF - 12.5) / 2, 45),
  ];
  for (let k = 0; k <= 3; k++) {
    const z = 58 - ((k / 3) * 0.88) * 116;
    colliders.push(rectCollider(p.x, p.z + z, 1.6, 2.5));
  }

  let t = 0;
  const update = (dt) => {
    t += dt;
    flames.forEach((f, i) => {
      const s = 0.8 + 0.3 * Math.sin(t * (13 + i * 5)) + Math.random() * 0.15;
      f.scale.set(s, s, s);
    });
  };
  return { colliders, update };
}

// Lady Buddha at Linh Ung Pagoda: a big white standing statue on a pink
// lotus pedestal in a stone plaza, a small pagoda beside it, and palm
// trees around.
function buildLadyBuddha(scene, p) {
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, 0.3, 24), lmMat(0xd8d0c0));
  plaza.position.set(p.x, 0.15, p.z);
  scene.add(plaza);

  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  g.scale.setScalar(1.3);
  const white = 0xf5f5f0;

  const cyl = (rt, rb, h, color, y, seg = 8) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), lmMat(color));
    m.position.set(0, y, 0);
    g.add(m);
    return m;
  };
  cyl(10, 11, 4, 0xe0dcd0, 2);
  cyl(7, 9, 2.5, 0xf4b6c8, 5.25, 12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const petal = lmBox(g, 3.2, 0.6, 2.4, 0xf8c8d8, Math.sin(a) * 8, 6.2, Math.cos(a) * 8);
    petal.rotation.y = a;
    petal.rotation.x = -0.5;
  }
  cyl(3.2, 5.5, 24, white, 18.5); // flowing robe
  // Arms: one hand raised in front holding a small vase, one down.
  const armL = lmBox(g, 1.8, 9, 1.8, white, -3.8, 24, -0.6);
  armL.rotation.z = 0.15;
  lmBox(g, 1.6, 1.6, 4, white, 1.6, 23.5, -3.4);
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 1.8, 8), lmMat(white));
  vase.position.set(1.6, 25, -5);
  g.add(vase);
  cyl(1.5, 1.7, 1.6, white, 31.3);
  lmBox(g, 4.2, 5, 4.2, white, 0, 34.5, 0); // head
  lmBox(g, 5, 7, 1.2, white, 0, 32.5, 2.3); // hood/veil falling behind
  lmBox(g, 4.6, 1.6, 4.6, white, 0, 37.5, 0.2);
  lmBox(g, 2, 2, 2, white, 0, 39, 0.6); // hair bun
  lmBox(g, 0.6, 0.3, 0.2, 0x555555, -0.9, 35, -2.15); // closed eyes
  lmBox(g, 0.6, 0.3, 0.2, 0x555555, 0.9, 35, -2.15);
  scene.add(g);

  // A small three-roof pagoda beside the statue.
  const pg = new THREE.Group();
  pg.position.set(p.x + 45, 0, p.z);
  [[10, 5, 0], [8, 4, 6.5], [6, 3.5, 12]].forEach(([w, h, y]) => {
    lmBox(pg, w, h, w, 0xb03a2e, 0, y + h / 2, 0);
    lmBox(pg, w + 4, 0.8, w + 4, 0x37474f, 0, y + h + 0.4, 0);
  });
  scene.add(pg);

  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    lmTree(scene, p.x + Math.cos(a) * 36, p.z + Math.sin(a) * 36, true);
  }

  return [rectCollider(p.x, p.z, 13.5, 13.5), rectCollider(p.x + 45, p.z, 6, 6)];
}

// Builds every zone and landmark. Returns { colliders, update(dt),
// parkedCars: [{x, z, heading}] } — main.js merges the colliders into the
// building index and adds the parked cars to the traffic.
function buildLandmarkZones(scene) {
  const colliders = [];
  const updaters = [];
  const parkedCars = [];
  const dest = (id) => DESTINATIONS.find((d) => d.id === id);

  const addParking = (arrival) => {
    // A row of cars parked along the street beside where you arrive
    // (off to the side, so they don't block the camera behind you).
    for (let i = 0; i < 3; i++) parkedCars.push({ x: arrival.x + 6, z: arrival.z - 4 + i * 7, heading: 0 });
  };

  // Paris
  {
    const c = zoneById('paris').center;
    const e = dest('eiffel');
    addZoneStreets(scene, c);
    colliders.push(...buildEiffel(scene, e.pos));
    colliders.push(...addZoneBlocks(scene, c,
      { palette: [0xefe6cf, 0xe8dcc0, 0xf3ead6, 0xddd0b3], roof: 0x546e7a, minH: 18, maxH: 26 },
      (x, z, r) => Math.hypot(x - e.pos.x, z - e.pos.z) > 60 + r && !(Math.abs(x - e.pos.x) < 45 + r && z > e.pos.z && z < e.pos.z + 170)));
    addParking(e.arrival);
  }

  // London
  {
    const c = zoneById('london').center;
    const b = dest('bigben');
    addZoneStreets(scene, c);
    colliders.push(...buildBigBen(scene, b.pos));
    colliders.push(...addZoneBlocks(scene, c,
      { palette: [0x9c4a3a, 0xb5653f, 0x8a7f72, 0xa1887f, 0xd7ccc8], roof: 0x3e3e3e, minH: 12, maxH: 32 },
      (x, z, r) => Math.hypot(x - b.pos.x, z - b.pos.z) > 55 + r
        && !(x > b.pos.x - 140 - r && x < b.pos.x + 15 + r && Math.abs(z - b.pos.z) < 30 + r)
        && Math.hypot(x - (b.pos.x + 35), z - (b.pos.z + 60)) > 15 + r));
    addParking(b.arrival);
  }

  // Da Nang: Dragon Bridge at the center over the river, Lady Buddha to the north-east.
  {
    const c = zoneById('danang').center;
    const d = dest('dragon');
    const bu = dest('buddha');
    addZoneStreets(scene, c);
    const bridge = buildDragonBridge(scene, d.pos);
    colliders.push(...bridge.colliders);
    updaters.push(bridge.update);
    colliders.push(...buildLadyBuddha(scene, bu.pos));
    colliders.push(...addZoneBlocks(scene, c,
      { palette: [0xffd54f, 0x4fc3f7, 0xff8a65, 0xaed581, 0xffffff, 0xf48fb1], minH: 6, maxH: 40 },
      (x, z, r) => Math.abs(z - c.z) > 48 + r // river
        && Math.abs(x - c.x) > 14 + r // bridge approach road
        && Math.hypot(x - bu.pos.x, z - bu.pos.z) > 60 + r));
    for (let x = -300; x <= 300; x += 25) {
      if (Math.abs(x) < 20) continue;
      lmTree(scene, c.x + x, c.z + 52, true);
      lmTree(scene, c.x + x, c.z - 52, true);
    }
    addParking(d.arrival);
    addParking(bu.arrival);
  }

  return {
    colliders,
    parkedCars,
    update(dt) {
      updaters.forEach((u) => u(dt));
    },
  };
}
