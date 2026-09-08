# World Driver

Tikras 3D pirmo asmens naršyklės žaidimas, sekantis realų Vilniaus (Lietuva)
gatvių tinklą — **be jokio API rakto ir mokesčių**. Renderiu naudojamas
[Three.js](https://threejs.org/) (WebGL), o gatvių trasos gaunamos iš
nemokamo **OSRM** maršrutų serviso pagal tikrus Vilniaus taškus. Pasaulis —
blokinė, "Roblox" stiliaus grafika (plokšti spalvoti dėžučių pastatai,
kampuoti automobiliai) ant to realaus gatvių tinklo, ne fotorealistiškas
miestas.

Vaikščioji pirmuoju asmeniu (matai savo siūbuojančias rankas), gali priėjus
prie **bet kurios** mašinos paspausti veiksmo mygtuką ir į ją įlipti
(vaizdas pereina į vairuotojo vietą su prietaisų skydeliu/vairu), o mieste
nuolat, be sustojimo, važinėja fonininis eismas — automobiliai realiais
keliais, kurie sukasi į priekį ir atgal be galo.

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

| Įrenginys | Judėjimas | Žvilgsnis | Veiksmas |
|---|---|---|---|
| Kompiuteris | `W A S D` — pirmyn/atgal/į šoną (vairuojant: greitis/posūkiai) | Pelė (spustelėk ekraną, kad "užrakintų" pelę) arba rodyklės | `E` |
| Telefonas / lietimas | Rodyklių mygtukai kairiame apatiniame kampe | Brauk pirštu bet kur ekrane | Didelis apskritas mygtukas dešiniame apatiniame kampe |

Jutiklinio ekrano mygtukai tiesiog paspaudžia/atleidžia tuos pačius klavišus,
kuriuos naudoja klaviatūra — todėl visa judėjimo/vairavimo logika veikia
identiškai, nepriklausomai nuo įvesties būdo. Žvilgsnis (pelė/pirštas/rodyklės)
sukioja kamerą nepriklausomai nuo judėjimo krypties — tikras pirmo asmens
valdymas, ne senasis "žemėlapis sukasi" sprendimas.

Vairuojant kamera užrakinta į mašinos kryptį (žiūri tiesiai pro priekinį
stiklą) — laisvas apsižvalgymas vairuojant kol kas neįgyvendintas.

## Architektūra

- `index.html`, `css/style.css` — puslapio karkasas, HUD ir jutiklinio ekrano
  valdymo mygtukų stilius.
- `js/geo.js` — vienintelė vieta, kur pasirodo lat/lng: `toLocal()` projektuoja
  `{lat, lng}` į lokalius metrus `{x, z}` santykinai su fiksuotu pradžios
  tašku (plokščios Žemės aproksimacija, tinkama tokiam mažam žaidimo plotui).
  Visa kita (judėjimas, vairavimas, atstumai) vyksta tuose lokaliuose
  koordinatėse su paprasta trigonometrija — geodezijos vykdymo metu
  nereikia. Taip pat apibrėžia `forwardVec`/`rightVec`/`headingTo` —
  kryptis atitinka tiesiai `THREE.Object3D.rotation.y` reikšmę.
- `js/routes.js` — eismo maršrutų sąrašas (pradžios/pabaigos taškai Vilniuje)
  ir jų išsprendimas į tikrus, kelias atitinkančius taškų masyvus per
  nemokamą OSRM viešą demo serverį (`router.project-osrm.org`).
- `js/world.js` — sukuria 3D sceną: dangus/apšvietimas, žemė, keliai (dėžutės
  palei realias OSRM trasas) ir procedūriškai išmėtyti blokiniai pastatai
  palei tuos kelius.
- `js/vehicles.js` — `Vehicle` (viena mašina: arba NPC eismo dalyvė, arba
  žaidėjo vairuojama, su blokiniu "Roblox" stiliaus 3D modeliu) ir
  `TrafficManager` (visų mašinų valdymas, nuolatinio eismo tankio
  palaikymas — kai žaidėjas įlipa į NPC mašiną, jos maršrutas tuoj pat
  papildomas nauja mašina).
- `js/player.js` — tikras pirmo asmens valdiklis: laisvas žvilgsnis
  (yaw+pitch) nepriklausomai nuo judėjimo krypties, 3D rankų "viewmodel"
  su siūbavimo animacija vaikščiojant, prietaisų skydelis/vairas vairuojant.
- `js/hud.js` — greitimatis, prompt'ai.
- `js/main.js` — Three.js scenos/kameros/renderer'io inicializacija, žaidimo
  ciklas (`requestAnimationFrame`), klaviatūros, pelės (Pointer Lock API) ir
  jutiklinio ekrano įvesties apdorojimas.

Three.js įkeliamas per CDN (cdnjs), be jokio rakto.

## Kaip veikia "nuolatinis eismas"

`TRAFFIC_ROUTES` (`js/routes.js`) apibrėžia kelias pradžios/pabaigos taškų
poras Vilniuje. Įkrovus žaidimą, kiekvienai porai per OSRM užklausiama reali
vairavimo trasa, kuri projektuojama į lokalias 3D koordinates. Kiekvienam
maršrutui priskiriama po kelias `Vehicle` instancijas, kurios visą laiką
slenka pirmyn tuo pačiu tašku masyvu, o pasiekusios galą — apsisuka ir
važiuoja atgal (ping-pong), taip sukuriant nenutrūkstamą eismą. Kai žaidėjas
į tokią mašiną įlipa, ji išimama iš NPC sąrašo ir tame maršrute tuoj pat
atsiranda nauja — eismo tankis nekrenta.

## Žinomi apribojimai / ką būtų galima tobulinti

- Pastatai yra **procedūriškai išmėtyti dėžučių tipo** modeliai palei
  gatves, ne tikri Vilniaus pastatų kontūrai — tikriems pastatams reikėtų
  papildomos Overpass API (OpenStreetMap) užklausos, kuri gautų realius
  pastatų poligonus.
- `router.project-osrm.org` yra nemokamas **viešas demo** serveris — geras
  šiam prototipui, bet ribotas (rate limit) ir netinkamas rimtai
  produkcijai; jei reikės daugiau maršrutų ar dažnesnių užklausų, verta
  pasikelti savo OSRM instanciją.
- Nėra susidūrimų fizikos tarp automobilių ar su pastatais/žeme — žaidimas
  be "sienų", mašinos ir žaidėjas gali važiuoti/vaikščioti bet kur (net per
  pastatus).
- Vairuojant kamera visiškai užrakinta į mašinos kryptį (nėra laisvo
  apsižvalgymo iš vairuotojo vietos).
- Grafika yra sąmoningai paprasta/blokinė (dėžutės, plokšti flat-shading
  spalvos) — tai atitinka "Roblox stiliaus" estetiką, o ne fotorealizmą, ir
  gerai veikia telefonuose.
