// Small geo helper layer on top of the Maps JS "geometry" library.
// Kept separate so the movement/route code below doesn't sprinkle
// google.maps.geometry.spherical calls everywhere.

const Geo = {
  offset(latLng, distanceMeters, headingDeg) {
    return google.maps.geometry.spherical.computeOffset(latLng, distanceMeters, headingDeg);
  },

  distance(a, b) {
    return google.maps.geometry.spherical.computeDistanceBetween(a, b);
  },

  heading(from, to) {
    return google.maps.geometry.spherical.computeHeadingBetween(from, to);
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
