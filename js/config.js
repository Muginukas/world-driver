// Handles the one-time "paste your Google Maps API key" bootstrap step.
// The key never leaves the browser: it's stored in localStorage and used
// only to build the Maps JS API <script> tag src.

const API_KEY_STORAGE_KEY = 'worldDriver.googleMapsApiKey';

function loadGoogleMapsScript(apiKey) {
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry&callback=initGame`;
  script.async = true;
  script.onerror = () => {
    alert('Nepavyko įkelti Google Maps. Patikrink, ar API raktas galiojantis ir ar įjungtos Maps JavaScript API / Directions API.');
    document.getElementById('setup-overlay').classList.remove('hidden');
  };
  document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('setup-overlay');
  const input = document.getElementById('api-key-input');
  const startBtn = document.getElementById('start-btn');

  const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
  if (savedKey) input.value = savedKey;

  const start = () => {
    const key = input.value.trim();
    if (!key) {
      input.focus();
      return;
    }
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
    overlay.classList.add('hidden');
    loadGoogleMapsScript(key);
  };

  startBtn.addEventListener('click', start);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') start();
  });
});
