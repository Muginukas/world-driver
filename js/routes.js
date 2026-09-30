// Traffic route definitions. Each route is an origin/destination pair
// inside Vilnius; the actual driving path between them is resolved at
// startup via the free OSRM public routing API, so ambient traffic
// always follows real, road-snapped streets rather than a straight line.
//
// Note: router.project-osrm.org is OSRM's free public demo server —
// fine for a hobby project like this, but it's rate-limited and not
// meant for production/heavy traffic. Self-host OSRM if this ever needs
// to scale.

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

const CARS_PER_ROUTE = 4;

// Cars parked right at the player's spawn point, free to be driven
// off-route as soon as they're entered.
const PARKED_CARS = [
  { lat: 54.6872, lng: 25.2660 },
  { lat: 54.6866, lng: 25.2645 },
  { lat: 54.6878, lng: 25.2638 },
  { lat: 54.6874, lng: 25.2670 },
  { lat: 54.6862, lng: 25.2655 },
];

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRoutePath(route) {
  const url = `${OSRM_BASE_URL}/${route.origin.lng},${route.origin.lat};${route.destination.lng},${route.destination.lat}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes.length) {
      return data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    }
    console.warn('OSRM returned no route, falling back to straight line', data);
  } catch (err) {
    console.warn('OSRM route fetch failed, falling back to straight line', err);
  }

  return [
    { lat: route.origin.lat, lng: route.origin.lng },
    { lat: route.destination.lat, lng: route.destination.lng },
  ];
}

// Resolves every TRAFFIC_ROUTES entry into a dense array of {lat, lng}
// points (the real road-snapped path). Requests are staggered slightly
// to be polite to the free public OSRM server.
async function resolveTrafficRoutes(callback) {
  const resolved = [];
  for (let i = 0; i < TRAFFIC_ROUTES.length; i++) {
    resolved[i] = await fetchRoutePath(TRAFFIC_ROUTES[i]);
    if (i < TRAFFIC_ROUTES.length - 1) await sleep(250);
  }
  callback(resolved);
}
