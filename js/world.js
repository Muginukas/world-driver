// Builds the 3D scene: sky/lighting, a flat ground plane, road ribbons
// following the real (OSRM-resolved, now locally-projected) Vilnius
// street paths, and procedurally scattered low-poly "block" buildings
// alongside them. There's no real building-footprint data here (that
// would need an Overpass API pass) — buildings are stylised filler,
// Roblox-block style, not accurate to real Vilnius architecture.

function buildWorld(scene, projectedRoutes) {
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

  const roadMat = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
  const ROAD_WIDTH = 7;

  projectedRoutes.forEach((path) => {
    for (let i = 0; i < path.length - 1; i++) {
      addRoadSegment(scene, roadMat, path[i], path[i + 1], ROAD_WIDTH);
    }
  });

  return scatterBuildings(scene, projectedRoutes);
}

function addRoadSegment(scene, mat, a, b, width) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.05) return;

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.2, length), mat);
  mesh.position.set((a.x + b.x) / 2, 0.05, (a.z + b.z) / 2);
  mesh.rotation.y = Math.atan2(dx, dz); // aligns the box's local +Z with (dx, dz)
  scene.add(mesh);
}

// Returns a list of building colliders {x, z, hw, hd, rotY} — each box's
// half-width/half-depth in its own (rotated) local frame — used by
// vehicles.js to stop a driven car from passing through a building.
function scatterBuildings(scene, projectedRoutes) {
  const palette = [0xcfd8dc, 0xd7ccc8, 0xb0bec5, 0xffe0b2, 0xc5cae9, 0xb2dfdb];
  const placed = [];
  const colliders = [];
  const MAX_BUILDINGS = 120;
  let count = 0;

  for (const path of projectedRoutes) {
    for (let i = 0; i < path.length - 1 && count < MAX_BUILDINGS; i += 2) {
      const a = path[i];
      const b = path[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;

      const nx = dz / len;
      const nz = -dx / len;
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };

      for (const side of [1, -1]) {
        if (count >= MAX_BUILDINGS) break;
        if (Math.random() > 0.5) continue; // sparser, more natural spacing

        const offset = 8 + Math.random() * 6; // clear of the road itself
        const pos = { x: mid.x + nx * offset * side, z: mid.z + nz * offset * side };

        if (placed.some((p) => Math.hypot(p.x - pos.x, p.z - pos.z) < 9)) continue;
        placed.push(pos);

        const w = 6 + Math.random() * 6;
        const d = 6 + Math.random() * 6;
        const h = 6 + Math.random() * 16;
        const mat = new THREE.MeshLambertMaterial({
          color: palette[Math.floor(Math.random() * palette.length)],
        });
        const rotY = Math.random() * Math.PI;
        const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        building.position.set(pos.x, h / 2, pos.z);
        building.rotation.y = rotY;
        scene.add(building);
        colliders.push({ x: pos.x, z: pos.z, hw: w / 2, hd: d / 2, rotY });
        count++;
      }
    }
  }

  return colliders;
}
