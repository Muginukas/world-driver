# World Driver

Naršyklės žaidimas ant tikro Vilniaus (Lietuva) žemėlapio — **be jokio API rakto ir
mokesčių**, naudojant atvirą **OpenStreetMap** žemėlapį (per Leaflet.js) ir nemokamą
**OSRM** maršrutų servisą tikroms, kelias atitinkančioms trasoms.

Vaikščioji po miestą (matai tik siūbuojančias rankas), gali priėjus prie **bet
kurios** mašinos paspausti **E** ir į ją įlipti, o mieste nuolat, be sustojimo,
važinėja fonininis eismas — automobiliai realiais keliais, kurie sukasi į
priekį ir atgal be galo.

## Kaip paleisti

Nereikia nei API rakto, nei registracijos — tiesiog paleisk statinį serverį:

```bash
cd world-driver
python3 -m http.server 8080
```

Tada atidaryk `http://localhost:8080` naršyklėje ir spausk **Žaisti**.

(Failus galima atidaryti ir tiesiog per `file://`, bet naršyklės tinklo
politika kartais apriboja `fetch()` užklausas iš `file://` — todėl geriau
per lokalų serverį.)

## Valdymas

| Klavišas | Veiksmas |
|---|---|
| `W A S D` / rodyklės | Vaikščiojimas (8 kryptys) arba vairavimas (pirmyn/atgal/posūkiai) |
| `E` | Įlipti į mašiną / išlipti iš jos |

## Architektūra

- `index.html`, `css/style.css` — puslapio karkasas, HUD ir žemėlapio žymeklių
  (Leaflet divIcon) stilius.
- `js/geo.js` — savarankiška (be bibliotekų priklausomybių) sferinė geometrija:
  atstumas, azimutas, poslinkis pagal atstumą+kryptį (haversine formulos) ant
  paprastų `{lat, lng}` objektų.
- `js/routes.js` — eismo maršrutų sąrašas (pradžios/pabaigos taškai Vilniuje)
  ir jų išsprendimas į tikrus, kelias atitinkančius taškų masyvus per
  nemokamą OSRM viešą demo serverį (`router.project-osrm.org`).
- `js/vehicles.js` — `Vehicle` (viena mašina: arba NPC eismo dalyvė, arba
  žaidėjo vairuojama) ir `TrafficManager` (visų mašinų valdymas, nuolatinio
  eismo tankio palaikymas — kai žaidėjas įlipa į NPC mašiną, jos maršrutas
  tuoj pat papildomas nauja mašina).
- `js/player.js` — žaidėjo būsena: vaikščiojimas arba vairavimas.
- `js/hud.js` — rankų siūbavimo animacija, greitimatis, prompt'ai.
- `js/main.js` — žaidimo ciklas (`requestAnimationFrame`), klavišų
  apdorojimas, Leaflet žemėlapio inicializacija.

Žemėlapio "variklis" — [Leaflet](https://leafletjs.com/) + OpenStreetMap
plyteles (`{s}.tile.openstreetmap.org`), įkeliamos per CDN (cdnjs), be
jokio rakto. Žemėlapis tik programiškai valdomas (vartotojo tąsymas/zoom
išjungtas), kamera visada centruota ant žaidėjo/mašinos.

## Kaip veikia "nuolatinis eismas"

`TRAFFIC_ROUTES` (`js/routes.js`) apibrėžia kelias pradžios/pabaigos taškų
poras Vilniuje. Įkrovus žaidimą, kiekvienai porai per OSRM užklausiama reali
vairavimo trasa (kelias atitinkantis taškų masyvas). Kiekvienam maršrutui
priskiriama po kelias `Vehicle` instancijas, kurios visą laiką slenka pirmyn
tuo pačiu tašku masyvu, o pasiekusios galą — apsisuka ir važiuoja atgal
(ping-pong), taip sukuriant nenutrūkstamą eismą. Kai žaidėjas į tokią mašiną
įlipa, ji išimama iš NPC sąrašo ir tame maršrute tuoj pat atsiranda nauja —
eismo tankis nekrenta.

## Žinomi apribojimai / ką būtų galima tobulinti

- `router.project-osrm.org` yra nemokamas **viešas demo** serveris — geras
  šiam prototipui, bet ribotas (rate limit) ir netinkamas rimtai
  produkcijai; jei reikės daugiau maršrutų ar dažnesnių užklausų, verta
  pasikelti savo OSRM instanciją.
- Žemėlapis liekas "šiaurė aukštyn" (nesisuka su mašinos kryptimi) — Leaflet
  turi papildomų (ne core) sprendimų kameros pasukimui, bet tai reikalautų
  papildomos bibliotekos (pvz. `leaflet-rotate`).
- Nėra susidūrimų fizikos tarp automobilių ar su pastatais — tai
  žaidimas be "sienų", mašinos ir žaidėjas gali važiuoti bet kur.
- Rankų HUD yra 2D CSS animacija, ne pilnas 3D pirmo asmens vaizdas.
- Naudojant OpenStreetMap duomenis, būtina išlaikyti "© OpenStreetMap
  contributors" atribuciją žemėlapyje (jau įtraukta) — tai ODbL licencijos
  reikalavimas.
