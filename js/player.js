// The player: walks freely (top-down, 8-direction) until they enter a
// car, at which point control hands off to that Vehicle's own driving
// physics and the player marker is hidden.

const WALK_SPEED_MPS = 1.4; // average human walking speed

// Built lazily (not at script-parse time) since `L` isn't defined until
// the Leaflet <script> tag has run.
function playerIcon() {
  return L.divIcon({
    className: 'player-icon',
    html: '<div class="player-body"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

class Player {
  constructor(map, startPos) {
    this.map = map;
    this.position = { lat: startPos.lat, lng: startPos.lng };
    this.heading = 0;
    this.vehicle = null; // Vehicle instance while driving, else null
    this.isMoving = false;

    this.marker = L.marker([this.position.lat, this.position.lng], {
      icon: playerIcon(),
      zIndexOffset: 200,
    }).addTo(map);
  }

  get isDriving() {
    return this.vehicle !== null;
  }

  get currentPosition() {
    return this.isDriving ? this.vehicle.position : this.position;
  }

  enterVehicle(vehicle) {
    this.vehicle = vehicle;
    this.map.removeLayer(this.marker);
  }

  exitVehicle() {
    const v = this.vehicle;
    this.vehicle = null;
    // Step out beside the car rather than on top of it.
    this.position = Geo.offset(v.position, 3, v.heading + 90);
    this.heading = v.heading;
    this.marker.setLatLng([this.position.lat, this.position.lng]);
    this.marker.addTo(this.map);
    return v;
  }

  updateWalking(dt, keys) {
    const heading = Geo.headingFromKeys(keys);
    this.isMoving = heading !== null;
    if (heading === null) return;

    this.heading = heading;
    this.position = Geo.offset(this.position, WALK_SPEED_MPS * dt, heading);
    this.marker.setLatLng([this.position.lat, this.position.lng]);
  }
}
