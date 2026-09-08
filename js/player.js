// The player: walks freely (top-down, 8-direction) until they enter a
// car, at which point control hands off to that Vehicle's own driving
// physics and the player marker is hidden.

const WALK_SPEED_MPS = 1.4; // average human walking speed

// Built lazily (not at script-parse time) since `google` isn't defined
// until the Maps JS API script has finished loading.
function playerSymbol() {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#2b6fff',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: 7,
  };
}

class Player {
  constructor(map, startPos) {
    this.map = map;
    this.position = new google.maps.LatLng(startPos.lat, startPos.lng);
    this.heading = 0;
    this.vehicle = null; // Vehicle instance while driving, else null
    this.isMoving = false;

    this.marker = new google.maps.Marker({
      position: this.position,
      map,
      icon: playerSymbol(),
      zIndex: 10,
    });
  }

  get isDriving() {
    return this.vehicle !== null;
  }

  get currentPosition() {
    return this.isDriving ? this.vehicle.position : this.position;
  }

  enterVehicle(vehicle) {
    this.vehicle = vehicle;
    this.marker.setMap(null);
  }

  exitVehicle() {
    const v = this.vehicle;
    this.vehicle = null;
    // Step out beside the car rather than on top of it.
    this.position = Geo.offset(v.position, 3, v.heading + 90);
    this.heading = v.heading;
    this.marker.setPosition(this.position);
    this.marker.setMap(this.map);
    return v;
  }

  updateWalking(dt, keys) {
    const heading = Geo.headingFromKeys(keys);
    this.isMoving = heading !== null;
    if (heading === null) return;

    this.heading = heading;
    this.position = Geo.offset(this.position, WALK_SPEED_MPS * dt, heading);
    this.marker.setPosition(this.position);
  }
}
