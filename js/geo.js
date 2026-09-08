// Minimal geo/vector math shared by the player and vehicles.
//
// toLocal() is the only place lat/lng ever appears at runtime: it
// projects a {lat, lng} point to local meters {x, z} relative to a
// fixed origin (flat-earth approximation, fine over the few-hundred-
// metre play area). Everything else — movement, steering, distances —
// happens in that local Cartesian space with plain trig, no geodesy.
//
// Convention: north (increasing lat) -> -Z, east (increasing lng) -> +X.
// An object's "heading" is exactly the value assigned to its
// THREE.Object3D.rotation.y, so forwardVec/rightVec mirror Three.js's
// own rotation-about-Y matrix (local -Z/+X axes) rather than an
// independently-invented convention.

const METERS_PER_DEG_LAT = 110540;

function metersPerDegLng(latDeg) {
  return 111320 * Math.cos((latDeg * Math.PI) / 180);
}

function toLocal(origin, latlng) {
  const dLat = latlng.lat - origin.lat;
  const dLng = latlng.lng - origin.lng;
  return {
    x: dLng * metersPerDegLng(origin.lat),
    z: -dLat * METERS_PER_DEG_LAT,
  };
}

// World-space direction a heading of `angle` (rotation.y) faces/strafes to.
function forwardVec(angle) {
  return { x: -Math.sin(angle), z: -Math.cos(angle) };
}

function rightVec(angle) {
  return { x: Math.cos(angle), z: -Math.sin(angle) };
}

// Heading (rotation.y) that makes forwardVec point from `from` toward `to`.
function headingTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
