# World Driver

Naršyklės žaidimas ant tikro Google Maps žemėlapio, pradedant Lietuvoje (Vilniuje).
Vaikščioji po miestą pirmuoju/trečiuoju asmeniu (matai tik savo siūbuojančias rankas),
gali priėjus prie **bet kurios** mašinos paspausti **E** ir į ją įlipti, o mieste
nuolat, be sustojimo, važinėja fonininis eismas — automobiliai realiais,
žemėlapio kelias atitinkančiais maršrutais (per Directions API), kurie sukasi
į priekį ir atgal be galo.

## Kaip paleisti

1. Reikės savo **Google Maps API rakto** (Google Cloud Console), su įjungtomis:
   - **Maps JavaScript API**
   - **Directions API**
   - Įjungtas billing (Google reikalauja jo šioms API, bet turi nemokamą
     kreditą kas mėnesį — nedidelis žaidimo naudojimas jo neišnaudos).
2. Paleisk failus per bet kokį statinį serverį (rekomenduojama, nes API raktai
   dažnai turi HTTP referrer apribojimus, kurie neveikia su `file://`):

   ```bash
   cd world-driver
   python3 -m http.server 8080
   ```

   Tada atidaryk `http://localhost:8080` naršyklėje.
3. Įklijuok API raktą į pasirodžiusį langą ir spausk **Pradėti žaidimą**.
   Raktas laikomas tik `localStorage` tavo naršyklėje.

## Valdymas

| Klavišas | Veiksmas |
|---|---|
| `W A S D` / rodyklės | Vaikščiojimas (8 kryptys) arba vairavimas (pirmyn/atgal/posūkiai) |
| `E` | Įlipti į mašiną / išlipti iš jos |

## Architektūra

- `index.html`, `css/style.css` — puslapio karkasas ir HUD stilius.
- `js/config.js` — API rakto įvedimo langas ir Maps JS API skripto įkėlimas.
- `js/geo.js` — pagalbinės geografijos funkcijos (atstumas, azimutas,
  poslinkis) ant `google.maps.geometry.spherical`.
- `js/routes.js` — eismo maršrutų sąrašas (pradžios/pabaigos taškai Vilniuje)
  ir jų išsprendimas į tikrus, kelias atitinkančius taškų masyvus per
  `DirectionsService`.
- `js/vehicles.js` — `Vehicle` (viena mašina: arba NPC eismo dalyvė, arba
  žaidėjo vairuojama) ir `TrafficManager` (visų mašinų valdymas, nuolatinio
  eismo tankio palaikymas — kai žaidėjas įlipa į NPC mašiną, jos maršrutas
  tuoj pat papildomas nauja mašina).
- `js/player.js` — žaidėjo būsena: vaikščiojimas arba vairavimas.
- `js/hud.js` — rankų siūbavimo animacija, greitimatis, prompt'ai.
- `js/main.js` — žaidimo ciklas (`requestAnimationFrame`), klavišų
  apdorojimas, `initGame()` (Maps JS API callback).

## Kaip veikia "nuolatinis eismas"

`TRAFFIC_ROUTES` (`js/routes.js`) apibrėžia kelias pradžios/pabaigos taškų
poras Vilniuje. Įkrovus žaidimą, kiekvienai porai per `DirectionsService`
užklausiama reali vairavimo trasa (`overview_path`) — tai realaus kelio
taškų masyvas. Kiekvienam maršrutui priskiriama po kelias `Vehicle`
instancijas, kurios visą laiką slenka pirmyn tuo pačiu tašku masyvu, o
pasiekusios galą — apsisuka ir važiuoja atgal (ping-pong), taip sukuriant
nenutrūkstamą eismą. Kai žaidėjas į tokią mašiną įlipa, ji išimama iš NPC
sąrašo ir tame maršrute tuoj pat atsiranda nauja — eismo tankis nekrenta.

## Žinomi apribojimai / ką būtų galima tobulinti

- Žemėlapis liekas "šiaurė aukštyn" (nesisuka su mašinos kryptimi) — tikra
  kamera, kuri sekasi paskui vairuotoją, reikalautų Map ID + vector maps
  (WebGL) rėžimo.
- Nėra susidūrimų fizikos tarp automobilių ar su pastatais — tai
  žaidimas be "sienų", mašinos ir žaidėjas gali važiuoti bet kur.
- Rankų HUD yra 2D CSS animacija, ne pilnas 3D pirmo asmens vaizdas.
- Kadangi žaidimui reikia paties naudotojo Google Maps API rakto (su
  billing), pilno žaidimo veikimo naršyklėje šioje aplinkoje patikrinti
  nepavyko — patikrink lokaliai su savo raktu.
