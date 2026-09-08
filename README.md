# World Driver

Naršyklės žaidimas ant tikro Vilniaus (Lietuva) žemėlapio — **be jokio API rakto ir
mokesčių**, naudojant atvirą **OpenStreetMap** žemėlapį (per Leaflet.js) ir nemokamą
**OSRM** maršrutų servisą tikroms, kelias atitinkančioms trasoms. Pritaikyta ir
telefonui (jutiklinio ekrano mygtukai), ir pirmo asmens vaizdui — žemėlapis
visada sukasi taip, kad tavo/mašinos kryptis rodytų tiesiai į viršų.

Vaikščioji po miestą (matai tik siūbuojančias rankas), gali priėjus prie **bet
kurios** mašinos paspausti veiksmo mygtuką ir į ją įlipti, o mieste nuolat, be
sustojimo, važinėja fonininis eismas — automobiliai realiais keliais, kurie
sukasi į priekį ir atgal be galo.

## Kaip paleisti

Nereikia nei API rakto, nei registracijos — tiesiog paleisk statinį serverį:

```bash
cd world-driver
python3 -m http.server 8080
```

Tada atidaryk `http://localhost:8080` naršyklėje (kompiuteryje ar telefone) ir
spausk **Žaisti**.

(Failus galima atidaryti ir tiesiog per `file://`, bet naršyklės tinklo
politika kartais apriboja `fetch()` užklausas iš `file://` — todėl geriau
per lokalų serverį.)

## Valdymas

| Įrenginys | Veiksmas |
|---|---|
| Kompiuteris | `W A S D` / rodyklės — judėti / vairuoti · `E` — įlipti/išlipti |
| Telefonas / lietimas | Rodyklių mygtukai kairiame apatiniame kampe — judėti / vairuoti · didelis apskritas mygtukas dešiniame apatiniame kampe — įlipti/išlipti |

Jutiklinio ekrano mygtukai tiesiog paspaudžia/atleidžia tuos pačius klavišus,
kuriuos naudoja klaviatūra — todėl visa judėjimo/vairavimo logika veikia
identiškai, nepriklausomai nuo įvesties būdo.

## Pirmo asmens ("heading-up") kamera

Kadangi žemėlapis yra plokščios 2D plytelės (ne 3D pasaulis), tikras pirmo
asmens (akių lygio) vaizdas nėra galimas be sudėtingo 3D variklio. Vietoj to
naudojamas GPS/navigacijos programose paplitęs sprendimas: visas žemėlapis
sukamas ekrane taip, kad žaidėjo (ar mašinos) kryptis visada rodytų į viršų —
todėl vaizdas jaučiasi kaip "žiūrėjimas į priekį", o ne žiūrėjimas iš viršaus.
Kamera papildomai pasukta žiūrėti į priekį (žaidėjas/mašina laikoma arčiau
ekrano apačios), kad matytum daugiau to, kas laukia priekyje.

Techniškai: `#map` elementas yra padarytas didesnis nei ekranas (iki jo
įstrižainės dydžio) ir kiekvieną kadrą pasukamas per CSS `transform: rotate()`
priešinga žaidėjo kryptimi; `#map-viewport` aplink jį nukirpimo (`overflow:
hidden`) rėmeliu palieka matomą tik tikrą ekrano dydį.

## Architektūra

- `index.html`, `css/style.css` — puslapio karkasas, HUD, jutiklinio ekrano
  valdymo mygtukai ir žemėlapio žymeklių (Leaflet divIcon) stilius.
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
- `js/main.js` — žaidimo ciklas (`requestAnimationFrame`), klaviatūros ir
  jutiklinio ekrano įvesties apdorojimas, Leaflet žemėlapio inicializacija,
  pirmo asmens kameros pasukimas ir priartinimo (zoom) valdymas.

Žemėlapio "variklis" — [Leaflet](https://leafletjs.com/) + OpenStreetMap
plyteles (`{s}.tile.openstreetmap.org`), įkeliamos per CDN (cdnjs), be
jokio rakto.

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
- Kadangi visas žemėlapis (kartu su gatvių pavadinimais) sukasi su kamera,
  tekstas plytelėse pasukimo metu būna įstrižas/neįsiskaitomas — tai žinomas
  šio "heading-up" sprendimo trade-off be papildomos (ne core) Leaflet
  bibliotekos.
- Nėra susidūrimų fizikos tarp automobilių ar su pastatais — tai
  žaidimas be "sienų", mašinos ir žaidėjas gali važiuoti bet kur.
- Rankų HUD yra 2D CSS animacija, ne pilnas 3D pirmo asmens vaizdas.
- Naudojant OpenStreetMap duomenis, būtina išlaikyti "© OpenStreetMap
  contributors" atribuciją žemėlapyje (jau įtraukta, nepasukama) — tai ODbL
  licencijos reikalavimas.
