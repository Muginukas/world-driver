// Traffic route definitions. Each route is an origin/destination pair
// inside Vilnius; the actual driving path between them is resolved at
// startup via the Directions API, so ambient traffic always follows
// real, road-snapped streets rather than a straight line.

const LITHUANIA_CENTER = { lat: 54.6872, lng: 25.2797 }; // Vilnius, Lithuania
const START_POSITION = { lat: 54.6870, lng: 25.2650 }; // near Lukiškės Square

const TRAFFIC_ROUTES = [
  { origin: { lat: 54.6870, lng: 25.2647 }, destination: { lat: 54.6858, lng: 25.2872 } }, // Lukiškės Sq -> Cathedral Sq (Gedimino ave corridor)
  { origin: { lat: 54.6858, lng: 25.2872 }, destination: { lat: 54.6710, lng: 25.2838 } }, // Cathedral Sq -> railway station
  { origin: { lat: 54.6890, lng: 25.2540 }, destination: { lat: 54.6960, lng: 25.2740 } }, // Vingis park -> Europos Sq
  { origin: { lat: 54.6960, lng: 25.2740 }, destination: { lat: 54.7080, lng: 25.2900 } }, // Europos Sq -> Žirmūnai bridge
  { origin: { lat: 54.7010, lng: 25.3020 }, destination: { lat: 54.7150, lng: 25.3200 } }, // Antakalnis -> Belmontas
  { origin: { lat: 54.6790, lng: 25.3050 }, destination: { lat: 54.6820, lng: 25.2940 } }, // Paupys -> Užupis
];

const CARS_PER_ROUTE = 2;

// Cars parked right at the player's spawn point, free to be driven
// off-route as soon as they're entered.
const PARKED_CARS = [
  { lat: 54.6872, lng: 25.2660 },
  { lat: 54.6866, lng: 25.2645 },
  { lat: 54.6878, lng: 25.2638 },
];

// Resolves every TRAFFIC_ROUTES entry into a dense array of LatLng points
// (the real road-snapped path) using the Directions API.
function resolveTrafficRoutes(callback) {
  const directionsService = new google.maps.DirectionsService();
  const resolved = [];
  let pending = TRAFFIC_ROUTES.length;

  if (pending === 0) {
    callback(resolved);
    return;
  }

  TRAFFIC_ROUTES.forEach((route, idx) => {
    directionsService.route(
      {
        origin: route.origin,
        destination: route.destination,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result.routes.length) {
          resolved[idx] = result.routes[0].overview_path;
        } else {
          console.warn('Directions failed for route', idx, status, '- falling back to straight line');
          resolved[idx] = [
            new google.maps.LatLng(route.origin.lat, route.origin.lng),
            new google.maps.LatLng(route.destination.lat, route.destination.lng),
          ];
        }
        pending -= 1;
        if (pending === 0) callback(resolved);
      }
    );
  });
}
