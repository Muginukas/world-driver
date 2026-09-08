// Self-contained geodesic math (haversine distance, initial bearing,
// destination point given distance+bearing). Deliberately has no
// dependency on any mapping library — it works on plain {lat, lng}
// objects — so the map engine underneath (Leaflet/OSM here) can be
// swapped without touching movement/route code.

const EARTH_RADIUS_M = 6371000;

function toRad(deg) { return (deg * Math.PI) / 180; }
function toDeg(rad) { return (rad * 180) / Math.PI; }

const Geo = {
  distance(a, b) {
    const phi1 = toRad(a.lat);
    const phi2 = toRad(b.lat);
    const dPhi = toRad(b.lat - a.lat);
    const dLambda = toRad(b.lng - a.lng);

    const sinDPhi = Math.sin(dPhi / 2);
    const sinDLambda = Math.sin(dLambda / 2);
    const h = sinDPhi * sinDPhi + Math.cos(phi1) * Math.cos(phi2) * sinDLambda * sinDLambda;

    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  },

  // Initial bearing from `from` to `to`, in degrees (0 = north, clockwise).
  heading(from, to) {
    const phi1 = toRad(from.lat);
    const phi2 = toRad(to.lat);
    const dLambda = toRad(to.lng - from.lng);

    const y = Math.sin(dLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  },

  // Destination point given a start point, distance (m) and heading (deg).
  offset(latLng, distanceMeters, headingDeg) {
    const delta = distanceMeters / EARTH_RADIUS_M;
    const theta = toRad(headingDeg);
    const phi1 = toRad(latLng.lat);
    const lambda1 = toRad(latLng.lng);

    const phi2 = Math.asin(
      Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
    );
    const lambda2 = lambda1 + Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );

    return { lat: toDeg(phi2), lng: toDeg(lambda2) };
  },

  // Shortest signed difference between two headings, in degrees (-180..180).
  headingDelta(from, to) {
    let d = (to - from) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  },

  // Combine currently-pressed movement keys into a single heading (degrees,
  // 0 = north/up on the map) for the free 8-direction walking mode.
  // Returns null if no movement key is pressed.
  headingFromKeys(keys) {
    const up = keys.has('w') || keys.has('arrowup');
    const down = keys.has('s') || keys.has('arrowdown');
    const left = keys.has('a') || keys.has('arrowleft');
    const right = keys.has('d') || keys.has('arrowright');

    if (up && right) return 45;
    if (down && right) return 135;
    if (down && left) return 225;
    if (up && left) return 315;
    if (up) return 0;
    if (right) return 90;
    if (down) return 180;
    if (left) return 270;
    return null;
  },
};
